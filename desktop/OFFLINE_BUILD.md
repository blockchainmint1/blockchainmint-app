# Building CSCMint.exe for an air-gapped Windows PC

The offline PC needs **Python 3.11 (64-bit)** — not 3.12/3.13/3.14.
`bip_utils` has no compatible Windows wheels above 3.11.

## 1. On an internet-connected Mac/PC — collect the packages

`pip`'s resolver chokes here because `crcmod` ships source-only, so we grab the
wheels explicitly with `--no-deps` and pull `crcmod` separately.

```zsh
mkdir -p ~/cscmint-offline-packages

python3 -m pip download \
  --platform win_amd64 --python-version 3.11 --implementation cp \
  --only-binary=:all: --no-deps \
  -d ~/cscmint-offline-packages \
  pyinstaller altgraph macholib packaging pyinstaller-hooks-contrib setuptools wheel \
  "bip_utils==2.12.1" "cbor2<6.0.0" coincurve ecdsa ed25519-blake2b-fork \
  pycryptodome pynacl py-sr25519-bindings pytoniq-core-fork typing_extensions \
  cffi pycparser pefile

python3 -m pip download --no-deps --no-binary :all: \
  -d ~/cscmint-offline-packages crcmod
```

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
