#!/usr/bin/env python3
"""Check or deploy an already packaged export with the approved CLI."""
import argparse
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("action", choices=("check", "deploy"))
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
if not (root / "dist" / ".opengame-renpy-export").is_file():
    parser.error("Run scripts/package-web.py on a genuine editor export first.")
try:
    result = subprocess.run([os.environ.get("OPENGAME_BIN", "opengame"), args.action, ".", "--json"], cwd=root)
except FileNotFoundError:
    parser.error("Install the approved OpenGame CLI and sign in first.")
raise SystemExit(result.returncode)
