# Building CSCMint.exe for an air-gapped Windows PC

The offline PC needs **Python 3.11 (64-bit)** — not 3.12/3.13/3.14.
`bip_utils` has no compatible Windows wheels above 3.11.

## 1. On an internet-connected Mac/PC — collect the packages

One command, everything included (~37 files, **~55 MB** total — `opencv-python`
is ~40 MB of that and is what powers the VERIFY tab's webcam QR scanning; drop
`opencv-python numpy` from the list if you'll only ever use a USB
keyboard-wedge scanner).
`pip`'s resolver chokes here because `crcmod` ships source-only, so we grab the
wheels explicitly with `--no-deps` and pull `crcmod` separately.

```zsh
mkdir -p ~/cscmint-offline-packages

python3 -m pip download \
  --platform win_amd64 --python-version 3.11 --implementation cp \
  --only-binary=:all: --no-deps \
  -d ~/cscmint-offline-packages \
  pyinstaller pyinstaller-hooks-contrib altgraph macholib packaging setuptools wheel \
  pefile pywin32-ctypes importlib_metadata zipp \
  "bip_utils==2.12.1" "cbor2<6.0.0" coincurve ecdsa ed25519-blake2b-fork \
  pycryptodome pycryptodomex pynacl py-sr25519-bindings pytoniq-core-fork \
  typing_extensions cffi pycparser six bitarray x25519 \
  requests urllib3 idna charset-normalizer certifi asn1crypto base58 \
  opencv-python numpy

python3 -m pip download --no-deps --no-binary :all: \
  -d ~/cscmint-offline-packages crcmod
```

This is a deliberate superset — it includes every transitive dependency of
`bip_utils` and `pyinstaller` plus a few common extras, so you shouldn't hit
another "could not find a version that satisfies…" round-trip.

Verify before unplugging the USB:

```zsh
ls ~/cscmint-offline-packages | wc -l   # expect 37
du -sh ~/cscmint-offline-packages       # expect ~55M (11M without opencv)
```

`pywin32-ctypes` and `pefile` are Windows-only PyInstaller dependencies, but
they download fine on a Mac because of the `--platform win_amd64` flag.

`crcmod` arrives as a `.tar.gz`. That's fine — it falls back to a pure-Python
build when no C compiler is present.


## 1b. Verify the folder BEFORE you unplug the USB

Instead of discovering one missing package per USB round-trip, run the doctor
script. It reads the metadata inside every wheel already in the folder, walks
the whole dependency graph, and prints **every** missing package at once --
plus the exact `pip download` command to fetch them all in one go.

```zsh
python3 desktop/check_offline_packages.py ~/cscmint-offline-packages
```

Expected output when the folder is complete:

```text
Nothing missing. This folder is complete for an offline install.
```

If anything is missing it prints, for example:

```text
MISSING (2):
  - pycryptodomex   (needed by: pytoniq-core-fork)
  - bitarray        (needed by: pytoniq-core-fork)

Run this on an internet-connected machine to grab them all at once:
...
```

Copy that generated command, run it, then re-run the doctor until it says
nothing is missing. The script is pure standard library, so it also runs on the
offline Windows PC itself:

```batch
python E:\desktop\check_offline_packages.py E:\cscmint-offline-packages
```

## 2. Put on the USB stick

- `cscmint-offline-packages/` (the folder above)
- `python-3.11.9-amd64.exe` (from python.org)
- the `desktop/` folder **and** the `keygen-plugins/` folder from this repo
- `VC_redist.x64.exe` (Microsoft Visual C++ 2015-2022 Redistributable, x64)

## 3. On the offline Windows PC

Install Python 3.11 with **"Add Python to PATH"** checked, then:

```batch
python -m pip install --no-index --find-links E:\cscmint-offline-packages ^
  pyinstaller bip_utils opencv-python numpy

cd desktop
mkdir keygen-plugins 2>nul
copy /y ..\keygen-plugins\*.py keygen-plugins\

python -m PyInstaller --noconfirm --clean --onefile --windowed --name CSCMint ^
  --add-data "keygen-plugins;keygen-plugins" ^
  --collect-all bip_utils --collect-all coincurve --collect-binaries coincurve ^
  --hidden-import coincurve --hidden-import coincurve._cffi_backend ^
  --hidden-import _cffi_backend --hidden-import cffi ^
  --hidden-import Cryptodome --hidden-import Crypto ^
  --hidden-import crcmod --hidden-import ecdsa --hidden-import nacl ^
  --hidden-import bitarray --hidden-import cbor2 ^
  --collect-all cv2 --hidden-import cv2 --hidden-import numpy ^
  csc_mint.py
```

The extra `--hidden-import` flags are pre-emptive: PyInstaller's static
analysis misses libraries that `bip_utils` imports lazily, and the failure only
shows up when you double-click the `.exe` (`ModuleNotFoundError`), not at build
time. Including them costs a couple of MB and saves a second USB round-trip.

Output: `desktop\dist\CSCMint.exe` — a single self-contained file.

## Troubleshooting the likely next snags

**`error: Microsoft Visual C++ 14.0 or greater is required`** while installing
`crcmod` — it's the only source-only package. Force the pure-Python fallback:

```batch
set CRCMOD_PURE_PYTHON=1
python -m pip install --no-index --find-links E:\cscmint-offline-packages ^
  --no-build-isolation crcmod
```

`--no-build-isolation` matters offline: without it pip tries to fetch a fresh
`setuptools` from PyPI to build the sdist.

**VERIFY tab says "no camera support in this build"** — `opencv-python` wasn't
installed when you built. Install it from the USB folder and rebuild with
`--collect-all cv2`. The USB keyboard-wedge scanner path keeps working either
way.

**Camera opens black / "could not open camera #0"** — click **Find cameras** in
the VERIFY tab to probe indexes 0-4 and pick the right one; laptops often put
the USB document camera on #1.

**`ModuleNotFoundError` when running the `.exe`** — rebuild adding
`--hidden-import <missing_module>` for whatever it names.

**`ImportError: DLL load failed` for `coincurve` or `_cffi_backend`** — install
the Microsoft Visual C++ 2015-2022 Redistributable (x64). Download
`VC_redist.x64.exe` from Microsoft on an internet machine and carry it on the
same USB; it's ~25 MB and worth having on hand.

**`python` not recognized** — the "Add Python to PATH" checkbox was missed.
Use `py -3.11 -m pip ...` and `py -3.11 -m PyInstaller ...` instead.

**Windows SmartScreen blocks the `.exe`** — the binary is unsigned. Click
"More info" then "Run anyway"; it only appears the first time.

## Notes

- Replace `E:\` with your USB drive letter.
- The `.exe` never touches the network; keys are generated fully offline.
- Nothing about the build embeds secrets — the same `.exe` is safe to rebuild
  and re-copy at any time.


**`ModuleNotFoundError: No module named 'coincurve._cffi_backend'`** when you
run the exe — `coincurve` is a compiled CFFI extension, and PyInstaller's static
analysis can't see the `.pyd` it loads at runtime. Rebuild with:

```batch
  --collect-all coincurve --collect-binaries coincurve ^
  --hidden-import coincurve --hidden-import coincurve._cffi_backend ^
  --hidden-import _cffi_backend --hidden-import cffi ^
```

Make sure `coincurve` and `cffi` are actually installed first
(`python -m pip install --no-index --find-links E:\cscmint-offline-packages coincurve cffi`)
and that you grabbed the **win_amd64** wheels, not the macOS ones.

If you still can't get the wheel onto the offline PC, `bip_utils` falls back to
the pure-Python `ecdsa` backend — the addresses it derives are identical, just
slower. Install `ecdsa` and rebuild without the coincurve flags.
