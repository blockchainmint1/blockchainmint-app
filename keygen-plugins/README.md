# Seed-phrase keygen plugins (btc12 / ltc12 / dash12 / eth12 / txc12 / isk12)

These are the Cold Storage Coin series whose only engraved secret is a BIP-39
seed phrase. Identical behaviour apart from the chain and the word count. The
BTC / LTC / DASH series are 12-word only.

| File | Class | Chain | Words | Entropy |
| --- | --- | --- | --- | --- |
| `eth12.py` | `Eth12CoinService` | ETH / all EVM | 12 | 128-bit |
| `txc12.py` | `Txc12CoinService` | TEXITcoin (m/44'/696969') | 12 | 128-bit |
| `isk12.py` | `Isk12CoinService` | Iskander Coin (m/44'/969696') | 12 | 128-bit |
| `btc12.py` | `Btc12CoinService` | Bitcoin (m/44'/0') | 12 | 128-bit |
| `ltc12.py` | `Ltc12CoinService` | Litecoin (m/44'/2') | 12 | 128-bit |
| `dash12.py` | `Dash12CoinService` | Dash (m/44'/5') | 12 | 128-bit |

BTC / LTC / DASH mint legacy P2PKH addresses (`1…` / `L…` / `X…`) and write the
WIF to `wif.txt`.


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
| `generate_asset_id(coin)` | 6-char Asset ID |
| `get_coin(private_key)` / `get_address(private_key)` | recovery + coin-checker |

## The five output files (what the laser PC gets)

`logic/coin_files_saver.py` writes to paths configured in `config.json` on the
laser machine (`C:\Users\laser\Desktop\...`). The five keys and their standard
filenames:

| config.json key | file | contents (one line per coin) |
| --- | --- | --- |
| `base_file_name` | `keypair.txt` | CSV master: header + `seed,address,key,derivation` |
| `asset_id_file_name` | `snip.txt` | `Nv7Q8D` — 6-char Asset ID |
| `private_file_name` | `key.txt` | **the seed phrase only** (what gets etched) |
| `public_file_name` | `labels.txt` | `address,assetId` (what gets printed) |
| `sequence_file_name` | `numbers.txt` | `A0000`, `A0001`, … (`<LASER><0000>`) |

A `wif.txt` extra (WIF for TXC, `0x…` hex for ETH) is written for the
sweep/recovery tooling only — it is not part of the laser pipeline.

## What these plugins change vs. the legacy services

- The secret of record is the **mnemonic**, not a WIF. `key.txt` contains only
  the words (12).
- Derivation is **standard BIP-44**: ETH on `m/44'/60'/0'/0/0` (matches
  MetaMask / Ledger Live / Rainbow, and every EVM chain), TXC on
  `m/44'/0'/0'/0/0`. The legacy BTC/LTC services derive from the BIP-44
  *master* node, which is non-standard; these phrases must restore correctly in
  mainstream wallets, so we deliberately don't copy that behaviour.
- `CryptoCoin.wif` is still populated so existing recovery/sweep tooling works.
- Asset ID: TXC uses `address[1:7]` (after the leading `T`), ETH uses
  `address[2:8]` uppercased (after `0x`).

## Install into the keygen package

Copy the files into `keygen/currencies/` and register them in
`keygen/crypto_coin_factory.py`:

```python
from keygen.currencies.eth12_crypto_coin_service import Eth12CoinService
from keygen.currencies.txc12_crypto_coin_service import Txc12CoinService

'ETH12': Eth12CoinService,
'TXC12': Txc12CoinService,
```

Add the new currencies to `get_available_currencies()` so they appear in the
keygen widget's dropdown.

## Standalone run (air-gapped machine)

```bash
pip install bip_utils          # 1.7.0 pin and 2.x are both supported
python txc12.py generate --count 100 --laser A --out ./out
```

Before writing anything the batch aborts if any two coins share a seed,
address or Asset ID, and every coin is re-derived from its own words and
checked against the address that will be printed.

> Run key generation offline only. `key.txt` and `wif.txt` are the live
> secrets — they never belong on a networked machine or in this repo.

## QA station: scan coin, then scan sticker

Step 4/5 of the mint process. Scan the laser-etched QR (the seed), then scan
the printed sticker, and confirm they belong together before applying it:

```bash
# just show what the coin should be

# compare against the scanned sticker (address[,assetId])
```

Prints `MATCH` (exit 0) or `*** MISMATCH — DO NOT APPLY STICKER ***` (exit 1),
so it can be wired straight into a scanner loop. Pass `--seed -` to read the
words from stdin instead of the command line (keeps secrets out of shell
history). EVM addresses compare case-insensitively, so a non-checksummed
sticker scan still matches.

### Run-on seeds from barcode/QR scanners

Keyboard-wedge scanners in the laser room emit the space bar as a non-character
key event (`'Key' object has no attribute 'char'`), so the seed arrives as one
long word: `rulepapersizeseekfitlizardsidescorpioncomepolicelazywant`. Every
plugin now re-splits that against the BIP-39 English wordlist and keeps only
the reading whose checksum validates, so scanning still yields the right
address. If a run-on string somehow splits into more than one valid mnemonic,
the plugin refuses instead of guessing. The real fix is still to make the
scanner emit spaces (handle `keyboard.Key.space` alongside `key.char`).


## Required: `get_currency_name()`

`crypto_coin_factory.get_available_currencies()` builds the dropdown with
`coin_services_class.get_currency_name()` — called on the **class**, before any
instance exists. A plugin without it crashes the whole app at startup with:

```
AttributeError: type object 'Txc12CoinService' has no attribute 'get_currency_name'
```

All four plugins expose `CURRENCY_NAME` plus classmethods
`get_currency_name()` / `get_currency_symbol()` (`ETH12`, `TXC12`
). Any new plugin must do the same.

## Entropy / seed strength (audit notes)

The mnemonic is the coin. Everything else is derived from it, so this is the
only place where a weakness is fatal.

- Entropy is drawn **inside these plugins**, not by the library's internal RNG:
  `_system_entropy()` takes three independent kernel-CSPRNG draws
  (`secrets.token_bytes` twice, `os.urandom` once), mixes them through SHA-512,
  and XORs the result with the primary draw — XOR with an independent value can
  never reduce entropy, so the output is at least as strong as
  `secrets.token_bytes(n)`.
- Strength: **128 bits** for all 12-word variants — full BIP-39 strength, no
  truncation, no reduced word pool.
- Nothing is seeded from time, PID, hostname, counter or `random`. The stdlib
  `random` module is not imported anywhere in these files; output is not
  reproducible by design.
- Hard aborts (mint nothing) if the RNG returns identical draws, degenerate
  output (all 0x00 / 0xff / <4 distinct bytes), a mnemonic that fails its own
  BIP-39 checksum, the wrong word count, or a suspiciously repetitive phrase.
- Batch-level gates still apply: duplicate seed / address / Asset ID anywhere in
  a run aborts the whole batch before a single file is written, and every coin
  is re-derived from its own words and checked against the address that will be
  printed.
- The ColdCard-class failure mode (a low-entropy or replayed RNG silently
  producing guessable seeds) is what the triple-draw + abort-on-anomaly design
  is aimed at. Statistical sanity check over 200 draws per plugin:
  bit balance 0.496–0.503, zero collisions.
