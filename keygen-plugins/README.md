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
  contains the words (12 or 24) — that's the file the laser/print pipeline uses.
  A `wif.txt` extra is written for the sweep/recovery tooling only.

- Derivation is **standard BIP-44**: `m/44'/<slip44>'/0'/0/0`. The legacy BTC/LTC
  services derive from the BIP-44 *master* node, which is non-standard; a Beekeeper
  phrase must restore correctly in Electrum / Ledger / Trezor / Sparrow, so we
  deliberately don't copy that behaviour.
- `CryptoCoin.wif` is still populated (derived account-0 key, hex for ETH) so the
  existing recovery and sweep tooling keeps working untouched.
- Chains supported: BTC, LTC, DOGE, BCH, DASH, ETH.

## Install into the keygen package

Copy the files to `keygen/currencies/bee12_crypto_coin_service.py` and
`keygen/currencies/bee24_crypto_coin_service.py`, then register them in
`keygen/crypto_coin_factory.py`:

```python
from keygen.currencies.bee12_crypto_coin_service import Bee12CoinService
from keygen.currencies.bee24_crypto_coin_service import Bee24CoinService

'BEE12':     Bee12CoinService,                  # BTC by default
'BEE12-LTC': lambda: Bee12CoinService('LTC'),
'BEE12-ETH': lambda: Bee12CoinService('ETH'),
'BEE24':     Bee24CoinService,
'BEE24-LTC': lambda: Bee24CoinService('LTC'),
'BEE24-ETH': lambda: Bee24CoinService('ETH'),
```

Add the new currencies to `get_available_currencies()` so they appear in the
keygen widget's dropdown.

## Standalone run (air-gapped machine)

```bash
pip install bip_utils          # 1.7.0 pin and 2.x are both supported
python bee24.py --count 100 --chain BTC --laser A --out ./out
python bee12.py --count 100 --chain BTC --laser A --out ./out
```

Outputs the five laser files (`keypair.txt`, `snip.txt`, `key.txt`, `labels.txt`,
`numbers.txt`) plus `wif.txt`.

> Run key generation offline only. `key.txt` and `wif.txt` are the live
> secrets — they never belong on a networked machine or in this repo.

## TEXITcoin editions: `txc12.py` / `txc24.py`

A seed phrase unlocks many chains, but a physical coin is minted for exactly
one. `txc12.py` / `txc24.py` mint the TEXITcoin edition: the engraved secret is
the 12- or 24-word mnemonic, and the sticker (`labels.txt`) carries the **TXC**
address plus the 6-char Asset ID derived from that same seed.

TXC mainnet params (from `chainparams.cpp`): PUBKEY_ADDRESS `0x42` (`T…`),
SECRET_KEY `0xC1`. TXC has no registered SLIP-44 type, so derivation uses
Bitcoin's path `m/44'/0'/0'/0/0` and re-encodes with TXC version bytes
(override with `--coin-type` if that ever changes).

Register as:

```python
from keygen.currencies.txc12_crypto_coin_service import Txc12CoinService
from keygen.currencies.txc24_crypto_coin_service import Txc24CoinService

'TXC12': Txc12CoinService,
'TXC24': Txc24CoinService,
```

### Mint a batch

```bash
python txc24.py generate --count 100 --laser A --out ./out
```

Before writing anything the batch aborts if any two coins share a seed,
address or Asset ID, and every coin is re-derived from its own words and
checked against the address that will be printed.

### QA station: scan coin, then scan sticker

Step 4/5 of the mint process. Scan the laser-etched QR (the seed), then scan
the printed sticker, and confirm they belong together before applying it:

```bash
# just show what the coin should be
python txc24.py verify --seed "word word ... word"

# compare against the scanned sticker (address[,assetId])
python txc24.py verify --seed "word ... word" --sticker "T…,agGM2c"
```

Prints `MATCH` (exit 0) or `*** MISMATCH — DO NOT APPLY STICKER ***` (exit 1),
so it can be wired straight into a scanner loop. Pass `--seed -` to read the
words from stdin instead of the command line (keeps secrets out of shell
history).

## Required: `get_currency_name()`

`crypto_coin_factory.get_available_currencies()` builds the dropdown with
`coin_services_class.get_currency_name()` — called on the **class**, before any
instance exists. A plugin without it crashes the whole app at startup with:

```
AttributeError: type object 'Txc12CoinService' has no attribute 'get_currency_name'
```

All four plugins now expose `CURRENCY_NAME` plus classmethods
`get_currency_name()` / `get_currency_symbol()` (`BEE12`, `BEE24`, `TXC12`,
`TXC24`). Any new plugin must do the same.
