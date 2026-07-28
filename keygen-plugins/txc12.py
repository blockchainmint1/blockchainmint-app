"""
TEXITcoin Txc12 coin service — 12-word seed phrase Cold Storage Coin (TXC).

Drop this file into the `keygen` package used by csc-manager-ui
(https://github.com/blockchainmint1/csc-manager-ui) as:

    keygen/currencies/txc12_crypto_coin_service.py

...and register it in `keygen/crypto_coin_factory.py`:

    from keygen.currencies.txc12_crypto_coin_service import Txc12CoinService
    ...
    'TXC24': Txc12CoinService,

------------------------------------------------------------------------------
Why this exists
------------------------------------------------------------------------------
A BIP-39 seed phrase unlocks *many* chains, but a physical coin is minted for
exactly ONE chain. Txc12 mints the TEXITcoin edition:

  * The engraved secret (under the hologram/sticker) is the 12-word mnemonic.
  * The sticker printed on top carries the TXC public address + 6-char Asset ID
    (labels.txt) — derived from that same seed.
  * Standard BIP-44 derivation, so the phrase also restores in any wallet for
    whatever other chain the holder wants to use later.

TEXITcoin mainnet params (chainparams.cpp, blockchainmint1/texitcoin):
    PUBKEY_ADDRESS = 66 (0x42, "T…")   SCRIPT_ADDRESS = 5 (0x05)
    SECRET_KEY     = 193 (0xC1)        bech32 hrp     = "txc"
TXC has no registered SLIP-44 coin type, so it derives on Bitcoin's path
(m/44'/0'/0'/0/0) and re-encodes the key material with TXC version bytes.
Override with --coin-type if that ever changes.

------------------------------------------------------------------------------
Standalone use (no keygen package required)
------------------------------------------------------------------------------
    # mint a batch (writes the 5 laser files)
    python txc12.py generate --count 10 --out ./out

    # QA station: scan the laser-etched QR (the seed), print what to expect
    python txc12.py verify --seed "word word ... word"

    # QA station: scan the seed AND the sticker, confirm they belong together
    python txc12.py verify --seed "word ... word" --sticker "Txxxxxxx,ABC123"

Requires: bip_utils (1.7.0 pin or 2.x both work)
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys

from bip_utils import (
    Bip39MnemonicGenerator,
    Bip39MnemonicValidator,
    Bip39SeedGenerator,
    Bip44,
    Bip44Changes,
    Bip44Coins,
)

try:  # bip_utils >= 2.x
    from bip_utils import Bip39WordsNum
except ImportError:  # bip_utils 1.7.0 (the pin in keygen-requirements.txt)
    Bip39WordsNum = None

# --------------------------------------------------------------------------
# Base-class / model shims (real ones are used inside the keygen package).
# --------------------------------------------------------------------------
try:  # pragma: no cover - depends on deployment location
    from keygen.crypto_coin import CryptoCoin
    from keygen.crypto_coin_service import CoinService
except ImportError:  # pragma: no cover

    class CryptoCoin:  # type: ignore[no-redef]
        def __init__(self, address, wif=None, seed=None):
            self.address = address
            self.wif = wif
            self.seed = seed

    class CoinService:  # type: ignore[no-redef]
        def generate(self):
            raise NotImplementedError

        def get_coin(self, private_key):
            raise NotImplementedError

        def generate_list(self, count):
            return [self.generate() for _ in range(count)]

        def get_address(self, private_key):
            return self.get_coin(private_key).address

        def get_csv_header(self):
            return "wif,address,seed\n"

        def format(self, coin):
            return "{},{},{}\n".format(coin.wif, coin.address, coin.seed)

        def generate_asset_id(self, coin):
            return coin.address[1:7]


WORDS_COUNT = 12

# TEXITcoin mainnet version bytes.
TXC_PUBKEY_VERSION = 0x42   # 66 -> "T…" legacy P2PKH
TXC_SECRET_VERSION = 0xC1   # 193 -> WIF
TXC_DEFAULT_COIN_TYPE = 0   # derives on Bitcoin's SLIP-44 path


# --------------------------------------------------------------------------
# Small pure-python crypto helpers (no API drift across bip_utils versions)
# --------------------------------------------------------------------------

_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58_encode(payload: bytes) -> str:
    num = int.from_bytes(payload, "big")
    out = ""
    while num > 0:
        num, rem = divmod(num, 58)
        out = _B58[rem] + out
    for byte in payload:
        if byte == 0:
            out = _B58[0] + out
        else:
            break
    return out


def _b58check_encode(payload: bytes) -> str:
    checksum = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    return _b58_encode(payload + checksum)


def _hash160(data: bytes) -> bytes:
    sha = hashlib.sha256(data).digest()
    try:
        ripe = hashlib.new("ripemd160")
        ripe.update(sha)
        return ripe.digest()
    except ValueError:  # OpenSSL 3 without legacy provider
        from bip_utils.utils.crypto import Hash160  # type: ignore

        return Hash160.QuickDigest(data)


def txc_address_from_pubkey(pubkey_compressed: bytes) -> str:
    return _b58check_encode(bytes([TXC_PUBKEY_VERSION]) + _hash160(pubkey_compressed))


def txc_wif_from_privkey(priv32: bytes, compressed: bool = True) -> str:
    payload = bytes([TXC_SECRET_VERSION]) + priv32 + (b"\x01" if compressed else b"")
    return _b58check_encode(payload)


# --------------------------------------------------------------------------
# bip_utils 1.7.0 vs 2.x compatibility
# --------------------------------------------------------------------------

def _new_mnemonic() -> str:
    if Bip39WordsNum is not None:
        words = Bip39WordsNum.WORDS_NUM_12
        try:
            return str(Bip39MnemonicGenerator().FromWordsNumber(words))
        except TypeError:
            return str(Bip39MnemonicGenerator.FromWordsNumber(words))
    return str(Bip39MnemonicGenerator.FromWordsNumber(WORDS_COUNT))


def _is_valid_mnemonic(mnemonic: str) -> bool:
    try:
        return bool(Bip39MnemonicValidator().IsValid(mnemonic))  # 2.x
    except TypeError:
        return bool(Bip39MnemonicValidator(mnemonic).IsValid())  # 1.7.0


class Txc12CoinService(CoinService):
    """TEXITcoin Cold Storage Coin whose engraved secret is 12 seed words."""

    chain = "TXC"

    def __init__(self, coin_type: int = TXC_DEFAULT_COIN_TYPE):
        self.coin_type = int(coin_type)

    # -- generation --------------------------------------------------------

    def generate(self) -> CryptoCoin:
        return self.get_coin_from_mnemonic(_new_mnemonic())

    def generate_list(self, count):
        return [self.generate() for _ in range(int(count))]

    # -- recovery / verification ------------------------------------------

    def get_coin(self, private_key: str) -> CryptoCoin:
        """`private_key` for a seed-phrase coin is the mnemonic itself."""
        return self.get_coin_from_mnemonic(private_key)

    def get_address(self, private_key: str) -> str:
        return self.get_coin(private_key).address

    def get_coin_from_mnemonic(self, mnemonic: str) -> CryptoCoin:
        mnemonic = " ".join(str(mnemonic).strip().lower().split())
        words = mnemonic.split(" ")
        if len(words) != WORDS_COUNT:
            raise ValueError(
                "Txc12 requires a {}-word seed phrase (got {}).".format(
                    WORDS_COUNT, len(words)
                )
            )
        if not _is_valid_mnemonic(mnemonic):
            raise ValueError("Invalid BIP-39 seed phrase (checksum failed).")

        seed_bytes = Bip39SeedGenerator(mnemonic).Generate()
        node = (
            Bip44.FromSeed(seed_bytes, Bip44Coins.BITCOIN)
            .Purpose()
            .Coin()
            .Account(0)
            .Change(Bip44Changes.CHAIN_EXT)
            .AddressIndex(0)
        )
        priv32 = node.PrivateKey().Raw().ToBytes()
        pub = node.PublicKey().RawCompressed().ToBytes()
        return CryptoCoin(
            txc_address_from_pubkey(pub), txc_wif_from_privkey(priv32), mnemonic
        )

    def verify_pair(self, mnemonic: str, sticker_address: str, sticker_asset_id=None):
        """QA step: does the scanned sticker belong to the scanned coin?

        Returns a dict with the expected values and a boolean `match`.
        """
        coin = self.get_coin_from_mnemonic(mnemonic)
        expected_asset_id = self.generate_asset_id(coin)
        address_ok = coin.address == str(sticker_address).strip()
        asset_ok = (
            True
            if sticker_asset_id is None
            else expected_asset_id.upper() == str(sticker_asset_id).strip().upper()
        )
        return {
            "match": bool(address_ok and asset_ok),
            "address_ok": address_ok,
            "asset_id_ok": asset_ok,
            "expected_address": coin.address,
            "expected_asset_id": expected_asset_id,
            "scanned_address": str(sticker_address).strip(),
            "scanned_asset_id": (
                None if sticker_asset_id is None else str(sticker_asset_id).strip()
            ),
            "derivation": self.derivation_path(),
        }

    # -- file/laser formatting --------------------------------------------

    def get_csv_header(self):
        return "seed,address,wif,derivation\n"

    def derivation_path(self) -> str:
        return "m/44'/{}'/0'/0/0".format(self.coin_type)

    def format(self, coin: CryptoCoin) -> str:
        return '"{}",{},{},{}\n'.format(
            coin.seed, coin.address, coin.wif, self.derivation_path()
        )

    def generate_asset_id(self, coin: CryptoCoin) -> str:
        """Six characters after the leading network char, as all series do."""
        return coin.address[1:7]


# --------------------------------------------------------------------------
# Standalone CLI
#
# `generate` writes the SAME five files KeygenProcessor + CoinFilesSaver
# produce on the laser PC desktop (config.json keys):
#   keypair.txt  CSV master        snip.txt   6-char Asset IDs
#   key.txt      engraved secret   labels.txt <address>,<assetId> (the sticker)
#   numbers.txt  <LASER><0000>
#
# `verify` is the QA station: scan the etched QR (seed) and optionally the
# printed sticker, and confirm they belong to the same coin before applying.
# --------------------------------------------------------------------------

def _write(path: str, lines) -> None:
    with open(path, "w") as fh:
        fh.writelines(lines)


def _cmd_generate(args) -> int:
    service = Txc12CoinService(args.coin_type)
    coins = service.generate_list(args.count)

    # Batch sanity: never ship duplicate seeds, addresses or Asset IDs.
    asset_ids = [service.generate_asset_id(c) for c in coins]
    for label, values in (
        ("seed", [c.seed for c in coins]),
        ("address", [c.address for c in coins]),
        ("asset id", asset_ids),
    ):
        if len(set(values)) != len(values):
            print("ABORT: duplicate {} in batch".format(label), file=sys.stderr)
            return 2

    # Re-derive every coin from its own words before writing anything.
    for coin in coins:
        if service.get_coin_from_mnemonic(coin.seed).address != coin.address:
            print("ABORT: round-trip mismatch", file=sys.stderr)
            return 2

    os.makedirs(args.out, exist_ok=True)
    j = lambda name: os.path.join(args.out, name)  # noqa: E731

    _write(j("keypair.txt"), [service.get_csv_header()] + [service.format(c) for c in coins])
    _write(j("snip.txt"), ["{}\n".format(a) for a in asset_ids])
    # The engraved secret is the mnemonic, not a WIF.
    _write(j("key.txt"), ["{}\n".format(c.seed) for c in coins])
    _write(j("wif.txt"), ["{}\n".format(c.wif) for c in coins])
    # labels.txt is what gets printed on the sticker: public key + Asset ID.
    _write(
        j("labels.txt"),
        ["{},{}\n".format(c.address, a) for c, a in zip(coins, asset_ids)],
    )
    _write(
        j("numbers.txt"),
        ["{}{:04d}\n".format(args.laser.upper(), i) for i in range(len(coins))],
    )
    print("Wrote {} TXC Txc12 coins to {}".format(len(coins), args.out))
    return 0


def _cmd_verify(args) -> int:
    service = Txc12CoinService(args.coin_type)
    seed = args.seed
    if seed == "-":
        seed = sys.stdin.read()

    if not args.sticker:
        coin = service.get_coin_from_mnemonic(seed)
        print("words      : {}".format(coin.seed))
        print("address    : {}".format(coin.address))
        print("asset id   : {}".format(service.generate_asset_id(coin)))
        print("derivation : {}".format(service.derivation_path()))
        return 0

    parts = [p.strip() for p in args.sticker.split(",")]
    address = parts[0]
    asset_id = parts[1] if len(parts) > 1 else None
    result = service.verify_pair(seed, address, asset_id)
    print("expected address  : {}".format(result["expected_address"]))
    print("scanned  address  : {}".format(result["scanned_address"]))
    print("expected asset id : {}".format(result["expected_asset_id"]))
    print("scanned  asset id : {}".format(result["scanned_asset_id"]))
    print("MATCH" if result["match"] else "*** MISMATCH — DO NOT APPLY STICKER ***")
    return 0 if result["match"] else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="TEXITcoin Txc12 (12-word) CSC keygen")
    parser.add_argument(
        "--coin-type", type=int, default=TXC_DEFAULT_COIN_TYPE,
        help="SLIP-44 coin type used in the derivation path (default 0)",
    )
    sub = parser.add_subparsers(dest="command")

    gen = sub.add_parser("generate", help="mint a batch and write the laser files")
    gen.add_argument("--count", type=int, default=10)
    gen.add_argument("--laser", default="A")
    gen.add_argument("--out", default="./out")
    gen.add_argument("--coin-type", type=int, default=TXC_DEFAULT_COIN_TYPE)
    gen.set_defaults(func=_cmd_generate)

    ver = sub.add_parser("verify", help="QA: scan seed (+ sticker) and compare")
    ver.add_argument("--seed", required=True, help='12 words, or "-" to read stdin')
    ver.add_argument("--sticker", help='scanned sticker: "<address>[,<assetId>]"')
    ver.add_argument("--coin-type", type=int, default=TXC_DEFAULT_COIN_TYPE)
    ver.set_defaults(func=_cmd_verify)

    args = parser.parse_args()
    if not getattr(args, "func", None):
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
