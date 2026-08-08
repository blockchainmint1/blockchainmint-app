#!/usr/bin/env python3
"""Make sure the ZBar native DLLs live next to the installed ``pyzbar``.

Why this exists
---------------
``pyzbar`` on Windows needs two native DLLs at runtime:

  * ``libzbar-64.dll``  — the decoder itself
  * ``libiconv.dll``    — character-set conversion, loaded *by* libzbar

Some installs (pip cache re-use, a source install, an antivirus quarantine, or
a wheel unpacked without its ``.libs``) end up with one of them missing, and
then PyInstaller has nothing to bundle. The ZBar engine silently disappears
from the built exe.

This script re-downloads the official ``pyzbar`` Windows wheel from PyPI and
copies any missing DLL into the installed package directory. Run it on the
internet-connected build machine right before PyInstaller.

Usage:  python fetch_zbar_dlls.py
Exit code is always 0 — a failure here just means ZBar stays missing, which
the build script reports as a warning (WeChat QR still works).
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

WANTED = ("libzbar-64.dll", "libiconv.dll", "libiconv-2.dll")


def pyzbar_dir() -> str | None:
    try:
        import pyzbar  # type: ignore
        return os.path.dirname(pyzbar.__file__)
    except Exception as exc:
        print("pyzbar is not installed ({})".format(exc))
        return None


def missing(target: str) -> list[str]:
    have = {n.lower() for n in os.listdir(target)}
    gaps = [n for n in WANTED if n.lower() not in have]
    # libiconv ships under either name depending on the wheel build; one is enough.
    if "libiconv.dll" in gaps and "libiconv-2.dll" not in gaps:
        gaps.remove("libiconv.dll")
    if "libiconv-2.dll" in gaps and "libiconv.dll" not in gaps:
        gaps.remove("libiconv-2.dll")
    return gaps


def download_wheel(dest: str) -> str | None:
    """pip download the win_amd64 pyzbar wheel into ``dest``; return its path."""
    cmd = [
        sys.executable, "-m", "pip", "download", "pyzbar",
        "--only-binary=:all:", "--no-deps",
        "--platform", "win_amd64",
        "--python-version", "3.11", "--implementation", "cp",
        "-d", dest,
    ]
    print("  running: {}".format(" ".join(cmd)))
    try:
        subprocess.run(cmd, check=True)
    except Exception as exc:
        print("  pip download failed: {}".format(exc))
        return None
    for name in os.listdir(dest):
        if name.lower().endswith(".whl"):
            return os.path.join(dest, name)
    return None


def main() -> int:
    target = pyzbar_dir()
    if not target:
        return 0

    gaps = missing(target)
    if not gaps:
        print("ZBar DLLs already present in {}".format(target))
        return 0

    print("Missing from {}: {}".format(target, ", ".join(gaps)))
    print("Re-downloading the pyzbar Windows wheel to recover them...")

    tmp = tempfile.mkdtemp(prefix="pyzbar-dll-")
    try:
        wheel = download_wheel(tmp)
        if not wheel:
            print("  could not obtain a pyzbar wheel - ZBar will be unavailable.")
            return 0
        copied = []
        with zipfile.ZipFile(wheel) as zf:
            for info in zf.infolist():
                base = os.path.basename(info.filename)
                if base.lower() in {w.lower() for w in WANTED}:
                    out = os.path.join(target, base)
                    if os.path.exists(out):
                        continue
                    with zf.open(info) as src, open(out, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    copied.append(base)
        if copied:
            print("  copied: {}".format(", ".join(copied)))
        else:
            print("  wheel contained no DLLs - unexpected, ZBar may stay missing.")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    still = missing(target)
    if still:
        print("Still missing: {} (build will warn)".format(", ".join(still)))
    else:
        print("All ZBar DLLs are in place.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
