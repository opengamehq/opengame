"""Build the synthetic Kaigen fixtures in engine-signatures.json, byte for byte.

Why synthetic: Kaigen's beta agreement (section 7(a)) bars distributing Kaigen software,
templates or sample content except inside a Build, so no byte of a real Kaigen export or
of the SDK may sit in this repository. Detection does not need one. What the detectors
read is three identifiers and a marker, which are names, not software:

* a module importing `js_gpu_get_supported_compressed_formats` and
  `_os_get_file_range_bytes`, with an `hz_flags` custom section;
* loader text that names the same three things;
* the `HZLICSTAMP1|` licence-stamp marker, followed within 256 bytes by a NUL-delimited
  version. Every field after the marker here is visibly fake: no licence id and no ingest
  token from any real build appears.

Three rows, in this order. The first is shaped like 0.6.2.001-beta (OG Clash R196), above.
The second is shaped like 0.7.1.001 (the Kaigen Starting Template a creator deployed on
18 Nov 2026): its imports are shortened, so neither of 0.6.2's names is there and its glue
names nothing; it keeps the `hz_flags` section, adds `hz_memory`, and carries the stamp in a
data segment with the version after a 0x01 byte rather than a NUL, as that export did. The
third carries only an `hzlic` custom section opening with the stamp, which Kaigen's founder
named that day as what every Kaigen web build contains.

Run `python3 synthetic_kaigen.py` to print the rows; the pipeline test
`test_engine_archives.py::test_the_synthetic_kaigen_fixture_is_reproducible` fails if the
JSON and this builder disagree. Tests that read a real export are opt-in through
OPENGAME_KAIGEN_EXPORT and never copy its bytes here.
"""
from __future__ import annotations

import base64
import hashlib
import json

VERSION = "0.6.2.001-beta"
STAMP = (b"HZLICSTAMP1|licence=SYNTHETIC-NOT-A-LICENCE|ingest=SYNTHETIC-NOT-A-TOKEN|"
         b"\x00" + VERSION.encode() + b"\x00")
TEXT = ('// Synthetic Kaigen-shaped glue for detection tests; not Kaigen code.\n'
        'const flags = WebAssembly.Module.customSections(module, "hz_flags");\n'
        'const imports = { env: { js_gpu_get_supported_compressed_formats: () => 1, '
        '_os_get_file_range_bytes: () => 0 } };\n')


def _leb(value: int) -> bytes:
    out = bytearray()
    while True:
        byte, value = value & 0x7F, value >> 7
        out.append(byte | (0x80 if value else 0))
        if not value:
            return bytes(out)


def _name(text: str) -> bytes:
    data = text.encode()
    return _leb(len(data)) + data


def _section(kind: int, payload: bytes) -> bytes:
    return bytes([kind]) + _leb(len(payload)) + payload


#: The 0.7.1-shaped stamp: three fake fields, padding, and the version after 0x01 0x01.
VERSION_071 = "0.7.1.001"
STAMP_071 = (b"HZLICSTAMP1|SYNTHETIC-NOT-A-LICENCE|SYNTHETIC-NOT-A-TOKEN|SYNTHETIC-NOT-A-TIER"
             b"\x00" * 7 + b"\x00\x00\x01\x01" + VERSION_071.encode() + b"\x00")
#: Minified glue: nothing a signature could read.
TEXT_071 = ('// Synthetic Kaigen-shaped glue for detection tests; not Kaigen code. Names shortened.\n'
            'const r = await WebAssembly.instantiate(b, { env: { a: () => 1, b: () => 0 } });\n')


def module(*, stamped: bool = True) -> bytes:
    """A valid module: one function type, the two imports, hz_flags, and the stamp."""
    types = _section(1, _leb(1) + b"\x60\x00\x00")
    imports = _section(2, _leb(2) + b"".join(
        _name("env") + _name(name) + b"\x00" + _leb(0)
        for name in ("js_gpu_get_supported_compressed_formats", "_os_get_file_range_bytes")))
    flags = _section(0, _name("hz_flags") + b"\x00")
    stamp = _section(0, _name("opengame.synthetic.stamp") + STAMP) if stamped else b""
    return b"\x00asm\x01\x00\x00\x00" + types + imports + flags + stamp


def module_071(*, stamped: bool = True, flags: bool = True) -> bytes:
    """Shortened imports, one memory, hz_flags and hz_memory, and the stamp in a data segment."""
    types = _section(1, _leb(1) + b"\x60\x00\x00")
    imports = _section(2, _leb(2) + b"".join(_name("env") + _name(name) + b"\x00" + _leb(0) for name in ("a", "b")))
    memory = _section(5, _leb(1) + b"\x00" + _leb(1))
    data = STAMP_071 if stamped else b"SYNTHETIC-DATA"
    segment = _section(11, _leb(1) + b"\x00\x41\x00\x0b" + _leb(len(data)) + data)
    sections = _section(0, _name("hz_flags") + b"\x00") if flags else b""
    return (b"\x00asm\x01\x00\x00\x00" + types + imports + memory + segment + sections
            + _section(0, _name("hz_memory") + b"\x9c\x00\x00\x00"))


def module_hzlic() -> bytes:
    """Shortened imports and an hzlic section opening with the stamp, and nothing else Kaigen's."""
    types = _section(1, _leb(1) + b"\x60\x00\x00")
    imports = _section(2, _leb(2) + b"".join(_name("env") + _name(name) + b"\x00" + _leb(0) for name in ("a", "b")))
    return b"\x00asm\x01\x00\x00\x00" + types + imports + _section(0, _name("hzlic") + STAMP_071)


_SOURCE = ("Synthetic, built by packages/preflight/tests/fixtures/synthetic_kaigen.py: {what} "
           "with fake fields. No Kaigen software, template or sample content.")


def rows() -> list[dict]:
    """Every Kaigen row of engine-signatures.json, in order."""
    def shaped(what: str, wasm: bytes, version: str) -> dict:
        return {"id": "kaigen", "path": "main_worker.js", "text": TEXT_071, "source": _SOURCE.format(what=what),
                "sha256": hashlib.sha256(TEXT_071.encode()).hexdigest(), "kind": "exported-game-runtime",
                "paths": ["game.wasm.br"], "version": version,
                "wasm": [{"path": "game.wasm", "base64": base64.b64encode(wasm).decode()}]}
    return [row(),
            shaped("a 0.7.1-shaped module with shortened imports, hz_flags and hz_memory sections and a licence stamp in a data segment",
                   module_071(), VERSION_071),
            shaped("a module whose only Kaigen mark is an hzlic section opening with a licence stamp",
                   module_hzlic(), VERSION_071)]


def row() -> dict:
    return {"id": "kaigen", "path": "main_worker.js", "text": TEXT,
            "source": "Synthetic, built by packages/preflight/tests/fixtures/synthetic_kaigen.py: "
                      "Kaigen's import names, hz_flags section and licence-stamp marker with fake fields. "
                      "No Kaigen software, template or sample content.",
            "sha256": hashlib.sha256(TEXT.encode()).hexdigest(), "kind": "exported-game-runtime",
            "paths": ["game.wasm.br", "ios/game.wasm.br"], "version": VERSION,
            "wasm": [{"path": "game.wasm", "base64": base64.b64encode(module()).decode()}]}


if __name__ == "__main__":
    print(json.dumps(rows(), indent=2))
