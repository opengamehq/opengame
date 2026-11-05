#!/usr/bin/env python3
"""Package an actual Ren'Py web export without rewriting its game archive."""
import argparse
from pathlib import Path
import re
import shutil
import zipfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SDK = "opengame-global.js"


def sdk_global(explicit=None):
    """The browser SDK this page loads before the Ren'Py bridge, as a file to ship in dist/.

    The page used to load /_og/sdk.js instead. og-games answers that path only for a
    release on a contract that adds the SDK at the edge (2027-02 and 2027-04, which a
    release reaches when its scan finds threads), so on an ordinary 2027-03 release it was
    a 404 and the bridge found no OpenGame. Every other starter ships its own copy; this
    one does too. Found before anything is written, so a missing SDK stops packaging and
    says where to get it. The package archive keeps it in sdk/; inside the OpenGame
    repository the built packages/sdk has it.
    """
    candidates = [Path(explicit).expanduser()] if explicit else [
        ROOT / "sdk" / SDK, ROOT.parent.parent / "packages" / "sdk" / "dist" / SDK]
    for path in candidates:
        notice = path.with_name(path.name + ".LEGAL.txt")
        if path.is_file() and path.stat().st_size > 0 and notice.is_file():
            return path.resolve()
    if explicit:
        raise ValueError(f"{explicit} is not the SDK, or its {SDK}.LEGAL.txt notice is not beside it. "
                         f"Pass the package archive's sdk/{SDK}.")
    raise ValueError(f"No OpenGame SDK found. Copy the package archive's sdk/{SDK} and its .LEGAL.txt into "
                     f"sdk/ here, or pass --sdk with its path. Inside the OpenGame repository, run "
                     f"npm run build in packages/sdk instead.")


def package_web(source, sdk=None):
    sdk = sdk_global(sdk)
    source = Path(source).resolve()
    destination = ROOT / "dist"
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError("Export outside dist/; the source and destination must be separate.")
    for name in ("index.html", "renpy.js", "renpy-pre.js", "game.zip"):
        if not (source / name).is_file() or (source / name).stat().st_size == 0:
            raise ValueError("Missing genuine Ren'Py export file: " + name)
    if not any(path.stat().st_size > 8 for path in source.rglob("*.wasm")):
        raise ValueError("No nonempty wasm found. Export Web from the Ren'Py launcher first.")
    with zipfile.ZipFile(source / "game.zip") as archive:
        names = set(archive.namelist())
        for name in ("opengame.py", "opengame_session.py"):
            entry = next((value for value in ("game/" + name, name) if value in names), None)
            if entry is None or archive.read(entry) != (ROOT / "game" / name).read_bytes():
                raise ValueError("Export is missing or has stale " + name + "; export this project's game/ again.")
        for stem in ("opengame", "script", "screens", "options"):
            if not any(prefix + stem + extension in names for prefix in ("game/", "") for extension in (".rpy", ".rpyc")):
                raise ValueError("Export was not built from this starter: missing " + stem)
    for name in ("opengame.py", "opengame.rpy"):
        if (ROOT / "game" / name).read_bytes() != (ROOT / "opengame-sdk" / name).read_bytes():
            raise ValueError("Refresh game/" + name + " from opengame-sdk/ and re-export before packaging.")
    html = (source / "index.html").read_text(encoding="utf-8")
    first_script = re.search(r"<script\b", html, re.IGNORECASE)
    if first_script is None:
        raise ValueError("The exported page has no runtime script.")
    if "<!-- OpenGame RenPy shell -->" in html:
        raise ValueError("Use the original editor export, not an already patched shell.")
    scripts = ('<!-- OpenGame RenPy shell -->\n'
               '<script src="' + SDK + '"></script>\n'
               '<script src="opengame-sdk/lifecycle.js"></script>\n'
               '<script src="opengame-sdk/opengame.js"></script>\n')
    html = html[:first_script.start()] + scripts + html[first_script.start():]
    temporary = ROOT / ".build"
    backup = temporary / "opengame-renpy-previous"
    record = temporary / "opengame-renpy-previous.owned"
    identity = "opengame-renpy-backup-v1\n"

    def recorded():
        return record.is_file() and record.read_text(encoding="utf-8") == identity

    def mark():
        if record.exists():
            if not recorded():
                raise ValueError("The backup ownership record is not recognized.")
            return
        record_temporary = record.with_name(record.name + ".tmp")
        record_temporary.write_text(identity, encoding="utf-8")
        record_temporary.replace(record)

    def remove_backup():
        mark()
        shutil.rmtree(backup)
        record.unlink()
    if source == backup or source in backup.parents or backup in source.parents:
        raise ValueError("The source export must be separate from the package backup.")
    temporary.mkdir(exist_ok=True)

    def owned(path):
        return path.is_dir() and not path.is_symlink() and (path / ".opengame-renpy-export").is_file()

    # Recover a process interruption between the two directory renames. The
    # previous complete export survives until the new package is fully written.
    if backup.exists():
        if not owned(backup) and not (recorded() and owned(destination)):
            raise ValueError("The Ren'Py package backup is not owned by this script.")
        if not destination.exists():
            backup.rename(destination)
            if recorded():
                record.unlink()
        elif owned(destination):
            remove_backup()
        else:
            raise ValueError("dist/ is unrelated to the saved package backup.")
    if not backup.exists() and recorded():
        record.unlink()
    if destination.exists() and not owned(destination):
        raise ValueError("dist/ is not a package made by this script. Move it aside first.")
    staging = Path(tempfile.mkdtemp(prefix="opengame-renpy-stage-", dir=temporary))
    try:
        shutil.copytree(source, staging, dirs_exist_ok=True)
        assets = staging / "opengame-sdk"
        assets.mkdir(exist_ok=True)
        for name in ("lifecycle.js", "opengame.js", "LICENSE"):
            shutil.copy2(ROOT / "opengame-sdk" / name, assets / name)
        shutil.copy2(ROOT / "opengame.json", staging / "opengame.json")
        shutil.copy2(sdk, staging / SDK)
        shutil.copy2(sdk.with_name(sdk.name + ".LEGAL.txt"), staging / (SDK + ".LEGAL.txt"))
        (staging / "index.html").write_text(html, encoding="utf-8")
        (staging / ".opengame-renpy-export").write_text("Generated by scripts/package-web.py\n", encoding="utf-8")
        if destination.exists():
            mark()
            destination.rename(backup)
        try:
            staging.rename(destination)
        except BaseException:
            if not destination.exists() and backup.exists():
                backup.rename(destination)
                if recorded():
                    record.unlink()
            raise
        if backup.exists():
            remove_backup()
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    print("Packaged the genuine Ren'Py export into dist/.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", help="Directory containing the launcher's real Web export")
    parser.add_argument("--sdk", help=f"The package archive's sdk/{SDK}, if it is not in sdk/ here")
    arguments = parser.parse_args()
    package_web(arguments.export, arguments.sdk)
