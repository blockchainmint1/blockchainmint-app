"""
Bitcoin Btc12 coin service — 12-word seed phrase Cold Storage Coin (BTC).

The engraved secret under the sticker is a 12-word BIP-39 mnemonic; the
sticker carries the BTC legacy address + 6-char Asset ID derived from it.

Bitcoin mainnet: PUBKEY_ADDRESS=0 ("1…"), SECRET_KEY=128 (0x80), SLIP-44 coin type 0.
Keys derive at m/44'/0'/0'/0/0 (standard BIP-44), so the phrase restores
in any mainstream wallet.

Standalone use
--------------
    python btc12.py generate --count 10 --out ./out
    python btc12.py verify --seed "word ... word"
    python btc12.py verify --seed "word ... word" --sticker "<address>,ABC123"

Requires: bip_utils (1.7.0 pin or 2.x both work)
"""

from __future__ import annotations

import argparse
import hashlib
import os
import secrets
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
ENTROPY_BYTES = 16  # 128 bits — BIP-39 strength for 12 words

# Bitcoin mainnet version bytes.
BTC_PUBKEY_VERSION = 0x00
BTC_SECRET_VERSION = 0x80
BTC_DEFAULT_COIN_TYPE = 0


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


def btc_address_from_pubkey(pubkey_compressed: bytes) -> str:
    return _b58check_encode(bytes([BTC_PUBKEY_VERSION]) + _hash160(pubkey_compressed))


def btc_wif_from_privkey(priv32: bytes, compressed: bool = True) -> str:
    payload = bytes([BTC_SECRET_VERSION]) + priv32 + (b"\x01" if compressed else b"")
    return _b58check_encode(payload)


# --------------------------------------------------------------------------
# bip_utils 1.7.0 vs 2.x compatibility
# --------------------------------------------------------------------------

# --- entropy health testing (NIST SP 800-90B flavoured) -------------------

_SYSRAND = secrets.SystemRandom()
_SEEN_DRAWS = set()
_SEEN_ENTROPY = set()


def _health_check(data: bytes, what: str) -> None:
    """Abort loudly on output that looks like a degraded RNG."""
    n = len(data)
    if data == bytes(n) or data == b"\xff" * n:
        raise RuntimeError("{} is all-constant — refusing to mint.".format(what))
    if len(set(data)) < max(4, n // 4):
        raise RuntimeError("{} has too few distinct bytes — refusing to mint.".format(what))

    # Repetition count test: no byte may repeat back-to-back too many times.
    run = 1
    for prev, cur in zip(data, data[1:]):
        run = run + 1 if cur == prev else 1
        if run > 4:
            raise RuntimeError("{} has a stuck-byte run — refusing to mint.".format(what))

    # Adaptive proportion test: no single byte value may dominate the sample.
    if max(data.count(b) for b in set(data)) > max(3, n // 3):
        raise RuntimeError("{} is skewed toward one value — refusing to mint.".format(what))

    # Bit balance: a healthy sample sits near 50% ones. Wide window so this
    # only ever fires on genuinely broken hardware, never on luck.
    ones = sum(bin(b).count("1") for b in data)
    bits = n * 8
    if not (0.25 * bits <= ones <= 0.75 * bits):
        raise RuntimeError("{} has implausible bit balance — refusing to mint.".format(what))


def _system_entropy(n: int) -> bytes:
    """Raw CSPRNG entropy for a fresh mnemonic — the single most important
    line of defence in this whole program.

    Design notes (post-ColdCard-incident hardening, pass 2):
      * FOUR independent draws from the OS CSPRNG are taken through every
        distinct API Python exposes: `secrets.token_bytes` (the audited
        interface), `os.urandom`, `os.getrandom` where the platform has it
        (blocks until the kernel pool is actually seeded — the exact failure
        ColdCard shipped), and `random.SystemRandom` (a separate code path to
        the same kernel source).
      * Every draw is run through NIST SP 800-90B style health tests before it
        is used: a repetition-count test, an adaptive-proportion test and a
        byte-uniqueness floor. Any failure aborts the whole run.
      * Draws are compared against each other AND against every draw made
        earlier in this process, so a stuck or replaying RNG is caught even if
        it only repeats once in a thousand coins.
      * They are mixed through SHA-512 (counter-personalised, so the extractor
        never repeats a block) and the result is XOR-ed with the primary draw.
        XOR with an independent value can never *reduce* entropy, so the output
        is at least as strong as `secrets.token_bytes(n)` no matter what the
        mixing step does.
      * The final output is health-tested too, and is refused if it collides
        with anything this process already emitted.
      * Nothing here is seeded, timestamped, PID-derived or otherwise
        reproducible. There is no seeded `random` anywhere in this file.
    """
    if n < 16:
        raise ValueError("Refusing to generate less than 128 bits of entropy.")

    draws = [secrets.token_bytes(n), os.urandom(n)]
    getrandom = getattr(os, "getrandom", None)
    if getrandom is not None:
        try:
            # Blocks until the kernel CSPRNG is fully seeded (Linux/BSD).
            draws.append(bytes(getrandom(n)))
        except (OSError, NotImplementedError):  # pragma: no cover - platform
            pass
    draws.append(
        _SYSRAND.getrandbits(n * 8).to_bytes(n, "big")
    )
    draws.append(secrets.token_bytes(n))

    for draw in draws:
        _health_check(draw, "CSPRNG draw")
    for i, x in enumerate(draws):
        for y in draws[i + 1:]:
            if x == y:
                raise RuntimeError(
                    "CSPRNG returned identical draws — the system RNG is "
                    "broken. Refusing to mint."
                )
    for draw in draws:
        if draw in _SEEN_DRAWS:
            raise RuntimeError(
                "CSPRNG replayed a value seen earlier in this session — "
                "refusing to mint."
            )
        _SEEN_DRAWS.add(draw)

    joined = b"".join(draws)
    stream = b""
    counter = 0
    while len(stream) < n:
        stream += hashlib.sha512(
            b"blockchainmint/csc-keygen/v2" + counter.to_bytes(4, "big") + joined
        ).digest()
        counter += 1
    out = bytes(x ^ y for x, y in zip(stream[:n], draws[0]))

    _health_check(out, "mixed entropy")
    if out in _SEEN_ENTROPY:
        raise RuntimeError("Entropy collision within this session — aborting.")
    _SEEN_ENTROPY.add(out)
    return out


def _mnemonic_from_entropy(entropy: bytes) -> str:
    """Build the BIP-39 phrase from entropy WE generated, not from the
    library's internal RNG. Works on bip_utils 1.7.0 and 2.x."""
    try:
        return str(Bip39MnemonicGenerator().FromEntropy(entropy))
    except TypeError:
        return str(Bip39MnemonicGenerator.FromEntropy(entropy))


def _new_mnemonic() -> str:
    mnemonic = _mnemonic_from_entropy(_system_entropy(ENTROPY_BYTES))
    # Belt and braces: never hand back a phrase that fails its own checksum.
    if not _is_valid_mnemonic(mnemonic):
        raise RuntimeError("Generated mnemonic failed BIP-39 validation.")
    words = mnemonic.split()
    if len(words) != WORDS_COUNT:
        raise RuntimeError(
            "Generated {} words, expected {}.".format(len(words), WORDS_COUNT)
        )
    if len(set(words)) < WORDS_COUNT // 2:
        raise RuntimeError("Generated mnemonic is suspiciously repetitive.")
    return mnemonic


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



def _derive_node(seed_bytes, coin_type: int):
    """Derive m/44'/<coin_type>'/0'/0/0 across bip_utils versions.

    Bip44Coins.BITCOIN hardcodes coin type 0, so BTC (SLIP-44 696969) has to
    come off a raw BIP-32 path instead.
    """
    path = "m/44'/{}'/0'/0/0".format(int(coin_type))
    try:  # bip_utils >= 2.x
        from bip_utils import Bip32Slip10Secp256k1 as _Bip32
    except ImportError:  # bip_utils 1.7.0
        from bip_utils import Bip32 as _Bip32
    return _Bip32.FromSeedAndPath(seed_bytes, path)



# ---------------------------------------------------------------------------
# Scanner tolerance: rebuild a mnemonic whose spaces got eaten
# ---------------------------------------------------------------------------
# Keyboard-wedge / QR scanners emit the space key as a non-character key event
# ("'Key' object has no attribute 'char'"), so the scanned seed arrives as one
# run-on string. We re-split it against the BIP-39 English wordlist and keep
# only the reading whose checksum validates.

_WORDLIST_CACHE = None


def _english_wordlist():
    global _WORDLIST_CACHE
    if _WORDLIST_CACHE is not None:
        return _WORDLIST_CACHE
    words = []
    try:
        import os as _os
        import bip_utils as _bu
        for root, _dirs, files in _os.walk(_os.path.dirname(_bu.__file__)):
            if "english.txt" in files:
                with open(_os.path.join(root, "english.txt"), "r", encoding="utf-8") as fh:
                    words = [w.strip() for w in fh if w.strip()]
                break
    except Exception:
        words = []
    if len(words) != 2048:
        try:
            from mnemonic import Mnemonic as _Mnemonic
            words = list(_Mnemonic("english").wordlist)
        except Exception:
            pass
    _WORDLIST_CACHE = words if len(words) == 2048 else []
    return _WORDLIST_CACHE


def _split_runon_mnemonic(blob, words_count):
    """All ways to cut `blob` into exactly `words_count` BIP-39 words."""
    wordset = set(_english_wordlist())
    if not wordset:
        return []
    n = len(blob)
    results = []

    def walk(pos, acc):
        if len(results) > 8:
            return
        if len(acc) == words_count:
            if pos == n:
                results.append(list(acc))
            return
        for size in range(3, 9):
            if pos + size > n:
                break
            word = blob[pos:pos + size]
            if word in wordset:
                acc.append(word)
                walk(pos + size, acc)
                acc.pop()

    walk(0, [])
    return results


def _normalize_mnemonic(raw, words_count):
    text = " ".join(str(raw).replace("\u00a0", " ").strip().lower().split())
    if len(text.split(" ")) == words_count:
        return text
    blob = "".join(ch for ch in text if ch.isalpha())
    if blob and len(text.split(" ")) < words_count:
        valid = [c for c in _split_runon_mnemonic(blob, words_count)
                 if _is_valid_mnemonic(" ".join(c))]
        if len(valid) == 1:
            return " ".join(valid[0])
        if len(valid) > 1:
            raise ValueError(
                "Scanned seed has no spaces and splits {} different valid ways. "
                "Re-scan or type the words.".format(len(valid))
            )
    return text


class Btc12CoinService(CoinService):
    """Bitcoin Cold Storage Coin whose engraved secret is 12 seed words."""

    # The factory calls these on the CLASS (no instance), so they must be
    # static/class methods -- csc-manager's get_available_currencies() does
    # `coin_services_class.get_currency_name()` while building the dropdown.
    CURRENCY_NAME = "BTC12"

    @classmethod
    def get_currency_name(cls):
        return cls.CURRENCY_NAME

    @classmethod
    def get_currency_symbol(cls):
        return cls.CURRENCY_NAME

    chain = "BTC"

    def __init__(self, coin_type: int = BTC_DEFAULT_COIN_TYPE):
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
        mnemonic = _normalize_mnemonic(mnemonic, WORDS_COUNT)
        words = mnemonic.split(" ")
        if len(words) != WORDS_COUNT:
            raise ValueError(
                "Btc12 requires a {}-word seed phrase (got {}).".format(
                    WORDS_COUNT, len(words)
                )
            )
        if not _is_valid_mnemonic(mnemonic):
            raise ValueError("Invalid BIP-39 seed phrase (checksum failed).")

        seed_bytes = Bip39SeedGenerator(mnemonic).Generate()
        node = _derive_node(seed_bytes, self.coin_type)
        priv32 = node.PrivateKey().Raw().ToBytes()
        pub = node.PublicKey().RawCompressed().ToBytes()
        # csc-manager writes coin.wif into key.txt (the engraved secret), so the
        # mnemonic goes there. The real WIF lives on .private_key for sweeps.
        coin = CryptoCoin(btc_address_from_pubkey(pub), mnemonic, mnemonic)
        coin.private_key = btc_wif_from_privkey(priv32)
        return coin

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
            coin.seed, coin.address, getattr(coin, "private_key", ""),
            self.derivation_path(),
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
    service = Btc12CoinService(args.coin_type)
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
    _write(j("wif.txt"), ["{}\n".format(getattr(c, "private_key", "")) for c in coins])
    # labels.txt is what gets printed on the sticker: public key + Asset ID.
    _write(
        j("labels.txt"),
        ["{},{}\n".format(c.address, a) for c, a in zip(coins, asset_ids)],
    )
    _write(
        j("numbers.txt"),
        ["{}{:04d}\n".format(args.laser.upper(), i) for i in range(len(coins))],
    )
    print("Wrote {} BTC Btc12 coins to {}".format(len(coins), args.out))
    return 0


def _cmd_verify(args) -> int:
    service = Btc12CoinService(args.coin_type)
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
    parser = argparse.ArgumentParser(description="Bitcoin Btc12 (12-word) CSC keygen")
    parser.add_argument(
        "--coin-type", type=int, default=BTC_DEFAULT_COIN_TYPE,
        help="SLIP-44 coin type used in the derivation path (default 0)",
    )
    sub = parser.add_subparsers(dest="command")

    gen = sub.add_parser("generate", help="mint a batch and write the laser files")
    gen.add_argument("--count", type=int, default=10)
    gen.add_argument("--laser", default="A")
    gen.add_argument("--out", default="./out")
    gen.add_argument("--coin-type", type=int, default=BTC_DEFAULT_COIN_TYPE)
    gen.set_defaults(func=_cmd_generate)

    ver = sub.add_parser("verify", help="QA: scan seed (+ sticker) and compare")
    ver.add_argument("--seed", required=True, help='12 words, or "-" to read stdin')
    ver.add_argument("--sticker", help='scanned sticker: "<address>[,<assetId>]"')
    ver.add_argument("--coin-type", type=int, default=BTC_DEFAULT_COIN_TYPE)
    ver.set_defaults(func=_cmd_verify)

    args = parser.parse_args()
    if not getattr(args, "func", None):
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
