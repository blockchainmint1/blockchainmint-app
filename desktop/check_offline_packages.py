#!/usr/bin/env python3
"""
CSCMint offline package doctor.

Reads every wheel / sdist sitting in the offline package folder, walks the
dependency graph declared in their own metadata, and reports EVERY missing
package at once instead of dying on the first one.

Pure standard library. Runs on macOS, Linux or Windows, online or offline.

Usage:
    python3 check_offline_packages.py ~/cscmint-offline-packages
    python  check_offline_packages.py E:\\cscmint-offline-packages
"""

from __future__ import annotations

import os
import re
import sys
import tarfile
import zipfile

# What we actually ask pip to install on the air-gapped PC.
ROOTS = ["pyinstaller", "bip_utils"]

# Marker environment we resolve against: CPython 3.11, 64-bit Windows.
ENV = {
    "python_version": "3.11",
    "python_full_version": "3.11.9",
    "sys_platform": "win32",
    "platform_system": "Windows",
    "platform_machine": "AMD64",
    "os_name": "nt",
    "implementation_name": "cpython",
    "platform_python_implementation": "CPython",
}


def normalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).strip().lower()


def read_metadata(path: str) -> tuple[str, list[str]] | None:
    """Return (normalized_name, [raw Requires-Dist lines]) for a wheel or sdist."""
    try:
        if path.endswith(".whl"):
            with zipfile.ZipFile(path) as zf:
                meta_name = next(
                    (n for n in zf.namelist()
                     if n.endswith(".dist-info/METADATA")), None
                )
                if not meta_name:
                    return None
                text = zf.read(meta_name).decode("utf-8", "replace")
            return parse_metadata(text)

        if path.endswith((".tar.gz", ".tgz", ".zip")):
            name = os.path.basename(path)
            name = re.sub(r"\.(tar\.gz|tgz|zip)$", "", name)
            dist = name.rsplit("-", 1)[0]
            # sdists rarely carry resolvable metadata without a build step;
            # treat them as present with no declared deps.
            return normalize(dist), []
    except Exception as exc:  # noqa: BLE001 - diagnostics only
        print(f"  ! could not read {os.path.basename(path)}: {exc}")
    return None


def parse_metadata(text: str) -> tuple[str, list[str]]:
    name = ""
    requires: list[str] = []
    for line in text.splitlines():
        if not line.strip():
            break  # headers end at the first blank line
        if line.lower().startswith("name:"):
            name = line.split(":", 1)[1].strip()
        elif line.lower().startswith("requires-dist:"):
            requires.append(line.split(":", 1)[1].strip())
    return normalize(name), requires


def marker_applies(marker: str) -> bool:
    """Very small PEP 508 marker evaluator. Unknown markers count as required."""
    marker = marker.strip()
    if not marker:
        return True
    if "extra ==" in marker or "extra==" in marker:
        return False  # optional extras are not installed by default
    expr = marker
    for key, value in ENV.items():
        expr = re.sub(rf"\b{key}\b", repr(value), expr)
    expr = expr.replace(" and ", " and ").replace(" or ", " or ")
    if re.search(r"[a-zA-Z_]{3,}", re.sub(r"'[^']*'", "", expr).replace("and", "").replace("or", "").replace("not", "").replace("in", "")):
        return True  # something we do not understand - assume required
    try:
        return bool(eval(expr, {"__builtins__": {}}, {}))  # noqa: S307
    except Exception:  # noqa: BLE001
        return True


def requirement_name(req: str) -> str | None:
    req, _, marker = req.partition(";")
    if not marker_applies(marker):
        return None
    match = re.match(r"^\s*([A-Za-z0-9._-]+)", req)
    return normalize(match.group(1)) if match else None


def main() -> int:
    folder = sys.argv[1] if len(sys.argv) > 1 else "cscmint-offline-packages"
    folder = os.path.expanduser(folder)
    if not os.path.isdir(folder):
        print(f"Folder not found: {folder}")
        return 2

    files = sorted(
        f for f in os.listdir(folder)
        if f.endswith((".whl", ".tar.gz", ".tgz", ".zip"))
    )
    print(f"Scanning {len(files)} files in {folder}\n")

    have: dict[str, list[str]] = {}
    for filename in files:
        result = read_metadata(os.path.join(folder, filename))
        if result:
            name, requires = result
            have[name] = requires

    missing: dict[str, set[str]] = {}
    seen: set[str] = set()
    queue = [normalize(r) for r in ROOTS]

    while queue:
        current = queue.pop()
        if current in seen:
            continue
        seen.add(current)
        if current not in have:
            missing.setdefault(current, set())
            continue
        for raw in have[current]:
            dep = requirement_name(raw)
            if not dep:
                continue
            if dep not in have:
                missing.setdefault(dep, set()).add(current)
            elif dep not in seen:
                queue.append(dep)

    resolved = sorted(seen - set(missing))
    print(f"Resolved OK ({len(resolved)}):")
    for name in resolved:
        print(f"  + {name}")

    unused = sorted(set(have) - seen)
    if unused:
        print(f"\nPresent but not required ({len(unused)}) - harmless:")
        print("  " + ", ".join(unused))

    if not missing:
        print("\nNothing missing. This folder is complete for an offline install.")
        return 0

    print(f"\nMISSING ({len(missing)}):")
    for name in sorted(missing):
        who = ", ".join(sorted(missing[name])) or "requested directly"
        print(f"  - {name}   (needed by: {who})")

    names = " ".join(sorted(missing))
    print("\nRun this on an internet-connected machine to grab them all at once:\n")
    print("python3 -m pip download \\")
    print("  --platform win_amd64 --python-version 3.11 --implementation cp \\")
    print("  --only-binary=:all: --no-deps \\")
    print(f"  -d {folder} \\")
    print(f"  {names}")
    print("\nIf any of those have no Windows wheel, fall back to:\n")
    print(f"python3 -m pip download --no-deps --no-binary :all: -d {folder} <name>")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
