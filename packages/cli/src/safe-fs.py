"""Descriptor-relative I/O for the CLI's local export commands.

Node has no portable openat API. Like pipeline/studio_source.read_prepared, this
helper opens each component with dir_fd and O_NOFOLLOW. Keep all directory fds
alive: renaming an ancestor cannot redirect later writes into its replacement.
It deliberately never removes a failed stage, even when its pathname looks local.
"""
import base64
import hashlib
import json
import os
import stat
import sys

# Hashing reads this much at a time, so a 256 MiB asset costs one chunk of memory and
# not the whole file.
CHUNK = 1 << 20


class OverLimit(ValueError):
    """A file, or the running total, is over the caller's byte ceiling. Reported apart
    from a race, because the fix is a smaller file rather than a quieter build."""


class OverTotal(OverLimit):
    """The files are each within their own ceiling and together over the plan's. The
    caller's fix is a smaller plan, which is a different sentence from a smaller file."""


def parts(path):
    result = path.split("/")
    if not result or any(p in ("", ".", "..") or "\\" in p or "\x00" in p for p in result):
        raise ValueError("invalid path")
    return result


def execute(job, stream=None):
    if (os.name != "posix" or not hasattr(os, "O_NOFOLLOW")
            or any(fn not in os.supports_dir_fd for fn in (os.open, os.mkdir, os.stat))):
        return {"error": "filesystem_unsupported"}
    held = []
    bindings = []
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW

    def directory(parent, name, create=False):
        if create:
            try:
                os.mkdir(name, mode=0o700, dir_fd=parent)
            except FileExistsError:
                pass
        fd = os.open(name, flags, dir_fd=parent)
        held.append(fd)
        bindings.append((parent, name, os.fstat(fd)))
        return fd

    def unchanged():
        for parent, name, before in bindings:
            after = os.stat(name, dir_fd=parent, follow_symlinks=False)
            if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
                raise ValueError("directory changed")

    try:
        root = os.open("/", flags)
        held.append(root)
        for component in parts(job["root"].lstrip("/")):
            root = directory(root, component)
        expected = job.get("identity")
        actual = os.fstat(root)
        if expected and (str(actual.st_dev), str(actual.st_ino)) != (expected["dev"], expected["ino"]):
            raise ValueError("root changed")
        if job["operation"] in ("read", "read-binary"):
            if job["operation"] == "read-binary" and len(job["files"]) != 1:
                raise ValueError("one binary file required")
            result = []
            total = 0
            for file in job["files"]:
                first_fd = len(held)
                first_binding = len(bindings)
                path = parts(file["relative"])
                parent = root
                try:
                    for component in path[:-1]:
                        parent = directory(parent, component)
                    fd = os.open(path[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
                except FileNotFoundError:
                    # Missing state is legitimate only at initial relative lookup.
                    # A vanished root/ancestor or post-read binding is a race.
                    unchanged()
                    if job.get("allowMissing"):
                        return {"error": "file_missing"}
                    raise
                with os.fdopen(fd, "rb") as source:
                    before = os.fstat(source.fileno())
                    if not stat.S_ISREG(before.st_mode) or (file.get("size") is not None and before.st_size != file["size"]):
                        raise ValueError("file changed")
                    total += before.st_size
                    if total > job["maximum"]:
                        raise OverLimit("file limit")
                    data = source.read(before.st_size + 1)
                    after = os.fstat(source.fileno())
                    if len(data) != before.st_size or (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                        raise ValueError("file changed")
                unchanged()
                # Per-file ancestors are no longer needed once bytes are in memory.
                # Keeping duplicates until the end exhausts macOS's fd limit.
                for fd in reversed(held[first_fd:]):
                    os.close(fd)
                del held[first_fd:]
                del bindings[first_binding:]
                if job["operation"] == "read-binary":
                    unchanged()
                    return {"bytes": data}
                result.append([file["path"], base64.b64encode(data).decode("ascii")])
            unchanged()
            return {"files": result}
        if job["operation"] in ("sizes", "hash"):
            # An external-asset plan is thousands of files. One process per file spent
            # its time starting interpreters (OG Clash's 12,979 ran past ten minutes at
            # about 6% CPU, 27 Oct 2026), so one job takes the whole list and walks each
            # file from the root fd held above, exactly as read does. "sizes" stats every file without reading
            # a byte, so a plan over its total is refused before any hashing; "hash"
            # streams each file through SHA-256 and holds no more than CHUNK of it.
            hashing = job["operation"] == "hash"
            file_maximum, total_maximum = job["fileMaximum"], job["totalMaximum"]
            result = []
            total = 0
            for file in job["files"]:
                first_fd = len(held)
                first_binding = len(bindings)
                path = parts(file["relative"])
                parent = root
                for component in path[:-1]:
                    parent = directory(parent, component)
                if not hashing:
                    # lstat, never a follow: a link in the leaf is not a regular file.
                    before = os.stat(path[-1], dir_fd=parent, follow_symlinks=False)
                    if not stat.S_ISREG(before.st_mode):
                        raise ValueError("not a file")
                    if before.st_size > file_maximum:
                        raise OverLimit("file limit")
                    total += before.st_size
                    if total > total_maximum:
                        raise OverTotal("total limit")
                    result.append(before.st_size)
                else:
                    fd = os.open(path[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
                    with os.fdopen(fd, "rb") as source:
                        before = os.fstat(source.fileno())
                        # The size is the one "sizes" returned. A file that moved since
                        # then is a change, whichever way it moved.
                        if not stat.S_ISREG(before.st_mode) or before.st_size != file["size"]:
                            raise ValueError("file changed")
                        if before.st_size > file_maximum:
                            raise OverLimit("file limit")
                        total += before.st_size
                        if total > total_maximum:
                            raise OverTotal("total limit")
                        digest = hashlib.sha256()
                        # One byte past the size, so a file growing under the read is seen.
                        wanted, read = before.st_size + 1, 0
                        while read < wanted:
                            chunk = source.read(min(CHUNK, wanted - read))
                            if not chunk:
                                break
                            read += len(chunk)
                            digest.update(chunk)
                        after = os.fstat(source.fileno())
                        if read != before.st_size or (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                            raise ValueError("file changed")
                    result.append([file["path"], before.st_size, digest.hexdigest()])
                unchanged()
                for fd in reversed(held[first_fd:]):
                    os.close(fd)
                del held[first_fd:]
                del bindings[first_binding:]
            unchanged()
            return {"digests": result} if hashing else {"sizes": result}
        if job["operation"] not in ("stage", "stage-stream"):
            raise ValueError("invalid operation")
        target = parts(job["target"])
        parent = root
        for component in target[:-1]:
            parent = directory(parent, component, create=True)
        # Exclusive creation is part of the public no-overwrite contract.
        try:
            os.mkdir(target[-1], mode=0o700, dir_fd=parent)
        except FileExistsError:
            return {"error": "vendor_output_exists"}
        stage = directory(parent, target[-1])
        directories = {"": stage}
        for name, encoded in job["files"]:
            path = parts(name)
            parent = stage
            key = ""
            for component in path[:-1]:
                key = key + "/" + component
                if key not in directories:
                    directories[key] = directory(parent, component, create=True)
                parent = directories[key]
            fd = os.open(path[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
            with os.fdopen(fd, "wb") as output:
                if job["operation"] == "stage-stream":
                    if stream is None or type(encoded) is not int or encoded < 0:
                        raise ValueError("invalid file length")
                    remaining = encoded
                    while remaining:
                        data = stream.read(min(CHUNK, remaining))
                        if not data:
                            raise ValueError("short file")
                        output.write(data)
                        remaining -= len(data)
                else:
                    output.write(base64.b64decode(encoded, validate=True))
        if job["operation"] == "stage-stream" and stream.read(1):
            raise ValueError("extra file bytes")
        unchanged()
        return {"ok": True}
    except OverTotal:
        return {"error": "total_limit"}
    except OverLimit:
        # Checked only after the descriptor walk succeeded, so a link swapped into the path
        # is still build_changed, never this.
        return {"error": "file_limit"}
    except (OSError, ValueError):
        return {"error": "build_changed"}
    finally:
        for fd in reversed(held):
            os.close(fd)


if __name__ == "__main__":
    # A single JSON header precedes binary stage bytes. Older one-document jobs
    # end at EOF and use the same entry point.
    stream = sys.stdin.buffer
    job = json.loads(stream.readline())
    result = execute(job, stream)
    if job.get("operation") == "read-binary":
        if "bytes" not in result:
            sys.exit(2)
        sys.stdout.buffer.write(result["bytes"])
    else:
        print(json.dumps(result, separators=(",", ":")))
