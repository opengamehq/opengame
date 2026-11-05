"""Build the synthetic Kaigen fixture in engine-signatures.json, byte for byte.

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

Run `python3 synthetic_kaigen.py` to print the row; the pipeline test
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


def module(*, stamped: bool = True) -> bytes:
    """A valid module: one function type, the two imports, hz_flags, and the stamp."""
    types = _section(1, _leb(1) + b"\x60\x00\x00")
    imports = _section(2, _leb(2) + b"".join(
        _name("env") + _name(name) + b"\x00" + _leb(0)
        for name in ("js_gpu_get_supported_compressed_formats", "_os_get_file_range_bytes")))
    flags = _section(0, _name("hz_flags") + b"\x00")
    stamp = _section(0, _name("opengame.synthetic.stamp") + STAMP) if stamped else b""
    return b"\x00asm\x01\x00\x00\x00" + types + imports + flags + stamp


def row() -> dict:
    return {"id": "kaigen", "path": "main_worker.js", "text": TEXT,
            "source": "Synthetic, built by packages/preflight/tests/fixtures/synthetic_kaigen.py: "
                      "Kaigen's import names, hz_flags section and licence-stamp marker with fake fields. "
                      "No Kaigen software, template or sample content.",
            "sha256": hashlib.sha256(TEXT.encode()).hexdigest(), "kind": "exported-game-runtime",
            "paths": ["game.wasm.br", "ios/game.wasm.br"], "version": VERSION,
            "wasm": [{"path": "game.wasm", "base64": base64.b64encode(module()).decode()}]}


if __name__ == "__main__":
    print(json.dumps(row(), indent=2))
