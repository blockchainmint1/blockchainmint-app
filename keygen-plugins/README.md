# Beekeeper keygen plugins (bee12 / bee24)

Beekeeper is the Cold Storage Coin series whose only engraved secret is a BIP-39
seed phrase. There are two variants, one file each — identical behaviour apart
from the phrase length:

| File | Class | Words | Entropy |
| --- | --- | --- | --- |
| `bee12.py` | `Bee12CoinService` | 12 | 128-bit |
| `bee24.py` | `Bee24CoinService` | 24 | 256-bit |

## How the existing keygen works

[`csc-manager-ui`](https://github.com/blockchainmint1/csc-manager-ui) doesn't contain
the crypto itself — it imports a separate `keygen` package:

```
keygen/
  crypto_coin.py           -> CryptoCoin(address, wif, seed)
  crypto_coin_service.py   -> CoinService base class
  crypto_coin_factory.py   -> CoinFactory.get_coin_service(currency)
  currencies/
    btc_crypto_coin_service.py
    ltc_crypto_coin_service.py
    ...
```

`logic/keygen.py` (`KeygenProcessor`) asks the factory for a service, then calls:

| method | purpose |
| --- | --- |
| `generate_list(count)` | make N coins |
| `get_csv_header()` / `format(coin)` | the master CSV |
| `generate_asset_id(coin)` | 6-char Asset ID (legacy: `address[1:7]`) |
| `get_coin(private_key)` / `get_address(private_key)` | recovery + coin-checker |

## The five output files (what the laser PC gets)

`logic/coin_files_saver.py` writes to paths configured in `config.json` on the
laser machine (`C:\Users\laser\Desktop\...`). The five keys and their standard
filenames:

| config.json key | file | contents (one line per coin) |
| --- | --- | --- |
| `base_file_name` | `keypair.txt` | CSV master: header + `wif,address,seed` |
| `asset_id_file_name` | `snip.txt` | `Nv7Q8D` — 6-char Asset ID |
| `private_file_name` | `key.txt` | the private key (WIF) |
| `public_file_name` | `labels.txt` | `address,assetId` |
| `sequence_file_name` | `numbers.txt` | `A0000`, `A0001`, … (`<LASER><0000>`) |

## What Beekeeper changes

- The secret of record is the **mnemonic**, not a WIF. `key.txt` therefore
  contains the 24 words — that's the file the laser/print pipeline uses.
  A `wif.txt` extra is written for the sweep/recovery tooling only.

- Derivation is **standard BIP-44**: `m/44'/<slip44>'/0'/0/0`. The legacy BTC/LTC
  services derive from the BIP-44 *master* node, which is non-standard; a Beekeeper
  phrase must restore correctly in Electrum / Ledger / Trezor / Sparrow, so we
  deliberately don't copy that behaviour.
- `CryptoCoin.wif` is still populated (derived account-0 key, hex for ETH) so the
  existing recovery and sweep tooling keeps working untouched.
- Chains supported: BTC, LTC, DOGE, BCH, DASH, ETH.

## Install into the keygen package

Copy the file to `keygen/currencies/beekeeper_crypto_coin_service.py` and register it
in `keygen/crypto_coin_factory.py`:

```python
from keygen.currencies.beekeeper_crypto_coin_service import BeekeeperCoinService

'BEEKEEPER':     BeekeeperCoinService,                  # BTC by default
'BEEKEEPER-LTC': lambda: BeekeeperCoinService('LTC'),
'BEEKEEPER-ETH': lambda: BeekeeperCoinService('ETH'),
```

Add the new currencies to `get_available_currencies()` so they appear in the
keygen widget's dropdown.

## Standalone run (air-gapped machine)

```bash
pip install bip_utils          # 1.7.0 pin and 2.x are both supported
python beekeeper.py --count 100 --chain BTC --laser A --out ./out
```

Outputs `address.csv`, `asset_ids.txt`, `seeds.txt`, `private.txt`, `public.txt`,
`numbers.txt`.

> Run key generation offline only. `seeds.txt` and `private.txt` are the live
> secrets — they never belong on a networked machine or in this repo.
