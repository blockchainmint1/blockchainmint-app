# Building CSCMint.exe for an air-gapped Windows PC

The offline PC needs **Python 3.11 (64-bit)** — not 3.12/3.13/3.14.
`bip_utils` has no compatible Windows wheels above 3.11.

## 1. On an internet-connected Mac/PC — collect the packages

One command, everything included (tested — 34 files, **~9 MB** total).
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
  pycryptodome pynacl py-sr25519-bindings pytoniq-core-fork \
  typing_extensions cffi pycparser six bitarray x25519 \
  requests urllib3 idna charset-normalizer certifi asn1crypto base58

python3 -m pip download --no-deps --no-binary :all: \
  -d ~/cscmint-offline-packages crcmod
```

This is a deliberate superset — it includes every transitive dependency of
`bip_utils` and `pyinstaller` plus a few common extras, so you shouldn't hit
another "could not find a version that satisfies…" round-trip.

Verify before unplugging the USB:

```zsh
ls ~/cscmint-offline-packages | wc -l   # expect 34
du -sh ~/cscmint-offline-packages       # expect ~9M
```

`pywin32-ctypes` and `pefile` are Windows-only PyInstaller dependencies, but
they download fine on a Mac because of the `--platform win_amd64` flag.

`crcmod` arrives as a `.tar.gz`. That's fine — it falls back to a pure-Python
build when no C compiler is present.


## 2. Put on the USB stick

- `cscmint-offline-packages/` (the folder above)
- `python-3.11.9-amd64.exe` (from python.org)
- the `desktop/` folder **and** the `keygen-plugins/` folder from this repo

## 3. On the offline Windows PC

Install Python 3.11 with **"Add Python to PATH"** checked, then:

```batch
python -m pip install --no-index --find-links E:\cscmint-offline-packages ^
  pyinstaller bip_utils

cd desktop
python -m PyInstaller --noconfirm --clean --onefile --windowed --name CSCMint ^
  --add-data "..\keygen-plugins;keygen-plugins" --collect-all bip_utils csc_mint.py
```

Output: `desktop\dist\CSCMint.exe` — a single self-contained file.

## Notes

- Replace `E:\` with your USB drive letter.
- If `pip` isn't found, use `py -3.11 -m pip ...`.
- The `.exe` never touches the network; keys are generated fully offline.
