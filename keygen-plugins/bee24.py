"""
Beekeeper Bee24 coin service — 24-word seed phrase Cold Storage Coin.

Drop this file into the `keygen` package used by csc-manager-ui
(https://github.com/blockchainmint1/csc-manager-ui) as:

    keygen/currencies/bee24_crypto_coin_service.py

...and register it in `keygen/crypto_coin_factory.py`:

    from keygen.currencies.bee24_crypto_coin_service import Bee24CoinService
    ...
    'BEE24': Bee24CoinService,          # defaults to BTC
    'BEE24-BTC': lambda: Bee24CoinService('BTC'),
    'BEE24-LTC': lambda: Bee24CoinService('LTC'),
    'BEE24-ETH': lambda: Bee24CoinService('ETH'),

------------------------------------------------------------------------------
What makes Beekeeper different
------------------------------------------------------------------------------
Every other CSC series engraves a WIF private key under the hologram. Beekeeper
engraves ONLY a 24-word BIP-39 mnemonic (256 bits of entropy). So:

  * The seed IS the secret of record. There is no WIF on the coin.
  * Derivation must be *standard* BIP-44 so the phrase restores in any wallet
    (Electrum/Ledger/Trezor/Sparrow): m/44'/<coin>'/0'/0/0
    NOTE: the legacy LTC/BTC services in this repo derive from the BIP-44
    *master* node, which is non-standard. Beekeeper deliberately does not copy
    that, otherwise a customer's phrase would show an empty wallet everywhere
    except our own tooling.
  * `CryptoCoin.wif` is still populated (the derived account-0 key) so the
    existing recovery/sweep tooling keeps working unchanged, but the laser file
    for Beekeeper prints the mnemonic, not the WIF.

------------------------------------------------------------------------------
Standalone use (no keygen package required)
------------------------------------------------------------------------------
    python bee24.py --count 10 --chain BTC --out ./out

Requires: bip_utils==1.7.0 (same pin as keygen-requirements.txt)
"""

from __future__ import annotations

import argparse
import os

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
# Base-class / model shims.
#
# When this file lives inside the `keygen` package the real CoinService and
# CryptoCoin are used. Standalone (or in CI without the private package) we
# fall back to compatible local definitions so the module is still runnable
# and testable.
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


# --------------------------------------------------------------------------
# Supported chains for a Beekeeper coin.
#
# `Bip39WordsNum.WORDS_NUM_24` -> 256-bit entropy -> 24 words, for every chain.
# --------------------------------------------------------------------------
BEEKEEPER_CHAINS = {
    "BTC": Bip44Coins.BITCOIN,
    "LTC": Bip44Coins.LITECOIN,
    "DOGE": Bip44Coins.DOGECOIN,
    "BCH": Bip44Coins.BITCOIN_CASH,
    "DASH": Bip44Coins.DASH,
    "ETH": Bip44Coins.ETHEREUM,
}

WORDS_COUNT = 24


# --------------------------------------------------------------------------
# bip_utils 1.7.0 uses static methods and int word counts; 2.x uses instances
# and the Bip39WordsNum enum. Support both so this plugin runs against the
# pinned keygen-requirements.txt and against a modern environment.
# --------------------------------------------------------------------------

def _new_mnemonic() -> str:
    if Bip39WordsNum is not None:
        words = Bip39WordsNum.WORDS_NUM_24
        try:
            return str(Bip39MnemonicGenerator().FromWordsNumber(words))
        except TypeError:
            return str(Bip39MnemonicGenerator.FromWordsNumber(words))
    return str(Bip39MnemonicGenerator.FromWordsNumber(WORDS_COUNT))


def _is_valid_mnemonic(mnemonic: str) -> bool:
    """Works across every bip_utils API shape we've seen in the wild."""
    # bip_utils 2.x: Bip39MnemonicValidator().IsValid(mnemonic) / .Validate(mnemonic)
    try:
        v = Bip39MnemonicValidator()
    except TypeError:
        v = None
    if v is not None:
        if hasattr(v, "IsValid"):
            try:
                return bool(v.IsValid(mnemonic))
            except TypeError:
                pass
        if hasattr(v, "Validate"):
            try:
                v.Validate(mnemonic)
                return True
            except Exception:
                return False
    # bip_utils 1.7.0: Bip39MnemonicValidator(mnemonic).IsValid() / .Validate()
    try:
        v = Bip39MnemonicValidator(mnemonic)
    except Exception:
        return False
    if hasattr(v, "IsValid"):
        try:
            return bool(v.IsValid())
        except TypeError:
            pass
    if hasattr(v, "Validate"):
        try:
            v.Validate()
            return True
        except Exception:
            return False
    # Last resort: the seed generator itself validates the checksum.
    try:
        Bip39SeedGenerator(mnemonic).Generate()
        return True
    except Exception:
        return False


class Bee24CoinService(CoinService):
    """Cold Storage Coin whose only engraved secret is a 24-word seed phrase."""

    # The factory calls these on the CLASS (no instance), so they must be
    # static/class methods -- csc-manager's get_available_currencies() does
    # `coin_services_class.get_currency_name()` while building the dropdown.
    CURRENCY_NAME = "BEE24"

    @classmethod
    def get_currency_name(cls):
        return cls.CURRENCY_NAME

    @classmethod
    def get_currency_symbol(cls):
        return cls.CURRENCY_NAME

    def __init__(self, chain: str = "BTC"):
        chain = (chain or "BTC").upper()
        if chain not in BEEKEEPER_CHAINS:
            raise ValueError(
                "Beekeeper does not support {}. Supported: {}".format(
                    chain, ", ".join(sorted(BEEKEEPER_CHAINS))
                )
            )
        self.chain = chain
        self.bip44_coin = BEEKEEPER_CHAINS[chain]

    # -- generation --------------------------------------------------------

    def generate(self) -> CryptoCoin:
        mnemonic = _new_mnemonic()
        return self.get_coin_from_mnemonic(mnemonic)

    def generate_list(self, count):
        return [self.generate() for _ in range(int(count))]

    # -- recovery ----------------------------------------------------------

    def get_coin(self, private_key: str) -> CryptoCoin:
        """`private_key` for Beekeeper is the 24-word mnemonic itself."""
        return self.get_coin_from_mnemonic(private_key)

    def get_address(self, private_key: str) -> str:
        return self.get_coin(private_key).address

    def get_coin_from_mnemonic(self, mnemonic: str) -> CryptoCoin:
        mnemonic = " ".join(str(mnemonic).strip().lower().split())
        words = mnemonic.split(" ")
        if len(words) != WORDS_COUNT:
            raise ValueError(
                "Beekeeper Bee24 requires a {}-word seed phrase (got {}).".format(
                    WORDS_COUNT, len(words)
                )
            )
        if not _is_valid_mnemonic(mnemonic):
            raise ValueError("Invalid BIP-39 seed phrase (checksum failed).")

        seed_bytes = Bip39SeedGenerator(mnemonic).Generate()
        # Standard BIP-44 account 0, external chain, first address.
        acct = (
            Bip44.FromSeed(seed_bytes, self.bip44_coin)
            .Purpose()
            .Coin()
            .Account(0)
            .Change(Bip44Changes.CHAIN_EXT)
            .AddressIndex(0)
        )
        address = acct.PublicKey().ToAddress()
        try:
            wif = acct.PrivateKey().ToWif()
        except Exception:  # ETH and other non-WIF chains
            wif = ""
        if not wif:
            wif = acct.PrivateKey().Raw().ToHex()
        return CryptoCoin(address, wif, mnemonic)

    # -- file/laser formatting --------------------------------------------

    def get_csv_header(self):
        return "seed,address,wif,derivation\n"

    def derivation_path(self) -> str:
        return "m/44'/{}'/0'/0/0".format(self._coin_type_index())

    def _coin_type_index(self) -> int:
        # SLIP-44 registered coin types.
        return {
            "BTC": 0,
            "LTC": 2,
            "DOGE": 3,
            "DASH": 5,
            "ETH": 60,
            "BCH": 145,
        }[self.chain]

    def format(self, coin: CryptoCoin) -> str:
        # Seed first: it's the field the laser/print pipeline cares about.
        return '"{}",{},{},{}\n'.format(
            coin.seed, coin.address, coin.wif, self.derivation_path()
        )

    def generate_asset_id(self, coin: CryptoCoin) -> str:
        """Six-character Asset ID, same convention as the other series.

        Legacy chains slice `address[1:7]` (skipping the leading network
        character). ETH addresses start with the two-character `0x` prefix, so
        skip that instead.
        """
        address = coin.address
        start = 2 if address.lower().startswith("0x") else 1
        return address[start : start + 6]


# --------------------------------------------------------------------------
# Standalone CLI — writes the SAME five files KeygenProcessor +
# CoinFilesSaver produce on the laser PC desktop (config.json keys):
#
#   base_file_name      -> keypair.txt   CSV, one row per coin
#   asset_id_file_name  -> snip.txt      6-char Asset ID per line
#   private_file_name   -> key.txt       the engraved secret (Beekeeper: seed)
#   public_file_name    -> labels.txt    address,assetId
#   sequence_file_name  -> numbers.txt   <LASER><0000>
#
# Beekeeper Bee24 writes the 24-word mnemonic into key.txt because that IS the
# engraved secret. wif.txt is written as an extra convenience file for the
# sweep/recovery tooling; the laser never reads it.
# --------------------------------------------------------------------------

def _write(path: str, lines) -> None:
    with open(path, "w") as fh:
        fh.writelines(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Beekeeper Bee24 (24-word) CSC keygen")
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--chain", default="BTC", choices=sorted(BEEKEEPER_CHAINS))
    parser.add_argument("--laser", default="A")
    parser.add_argument("--out", default="./out")
    args = parser.parse_args()

    service = Bee24CoinService(args.chain)
    coins = service.generate_list(args.count)
    os.makedirs(args.out, exist_ok=True)
    j = lambda name: os.path.join(args.out, name)  # noqa: E731

    _write(j("keypair.txt"), [service.get_csv_header()] + [service.format(c) for c in coins])
    _write(j("snip.txt"), ["{}\n".format(service.generate_asset_id(c)) for c in coins])
    # Beekeeper engraves the SEED, so key.txt holds the mnemonic, not a WIF.
    _write(j("key.txt"), ["{}\n".format(c.seed) for c in coins])
    _write(j("wif.txt"), ["{}\n".format(c.wif) for c in coins])
    _write(
        j("labels.txt"),
        ["{},{}\n".format(c.address, service.generate_asset_id(c)) for c in coins],
    )
    _write(
        j("numbers.txt"),
        ["{}{:04d}\n".format(args.laser.upper(), i) for i in range(len(coins))],
    )
    print("Wrote {} Beekeeper Bee24 {} coins to {}".format(len(coins), args.chain, args.out))



if __name__ == "__main__":
    main()
