/**
 * Private-key parsing and address derivation for sweep verification.
 *
 * Step 1 of the sweep flow: take whatever the user pastes / scans, figure out
 * what format it is, derive the public address(es) it controls, and let the
 * caller compare against the expected "From" address before allowing the
 * destructive broadcast.
 *
 * No network calls. No storage. Pure functions over the input string.
 */

import { getPublicKey } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base58check, bech32 } from "@scure/base";
import { encodeCashAddr } from "./cashaddr";
import type { ChainId } from "./chains";


// ---------------------------------------------------------------------------
// Network params (WIF version byte + address prefix + bech32 HRP)
// ---------------------------------------------------------------------------

type BtcLikeParams = {
  /** WIF version byte */
  wifVersion: number;
  /** P2PKH version byte (legacy single-sig address) */
  p2pkhVersion: number;
  /** P2SH version byte (used for P2SH-wrapped segwit when supported) */
  p2shVersion: number;
  /** bech32 human-readable part, or null if chain has no segwit */
  bech32Hrp: string | null;
};

const BTC_PARAMS: Record<"btc" | "ltc" | "doge" | "bch" | "txc", BtcLikeParams> = {
  btc:  { wifVersion: 0x80, p2pkhVersion: 0x00, p2shVersion: 0x05, bech32Hrp: "bc"  },
  ltc:  { wifVersion: 0xb0, p2pkhVersion: 0x30, p2shVersion: 0x32, bech32Hrp: "ltc" },
  doge: { wifVersion: 0x9e, p2pkhVersion: 0x1e, p2shVersion: 0x16, bech32Hrp: null  },
  bch:  { wifVersion: 0x80, p2pkhVersion: 0x00, p2shVersion: 0x05, bech32Hrp: null  },
  // TEXITcoin — Bitcoin-derived fork. Params from chainparams.cpp in
  // blockchainmint1/texitcoin (mainnet): PUBKEY_ADDRESS=66 (0x42, "T…"),
  // SCRIPT_ADDRESS=5 (0x05), SECRET_KEY=193 (0xC1), bech32 hrp = "txc".
  // SCRIPT_ADDRESS2=65 (0x41) also exists as an alternate P2SH prefix.
  txc:  { wifVersion: 0xc1, p2pkhVersion: 0x42, p2shVersion: 0x05, bech32Hrp: "txc" },
};

const ALL_WIF_PREFIXES = Array.from(new Set(Object.values(BTC_PARAMS).map(p => p.wifVersion)));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type KeyFormat = "wif" | "hex" | "bip38" | "unknown";

export type KeyParseResult =
  | {
      ok: true;
      format: KeyFormat;
      /** Raw 32-byte private key, hex-encoded (no 0x prefix) */
      privateKeyHex: string;
      /** Whether the source WIF flagged compressed pubkeys (always true for hex) */
      compressed: boolean;
      /** Which chains we could plausibly sweep with this key */
      candidates: ChainId[];
      /** Per-chain addresses we derived from the key */
      addressesByChain: Partial<Record<ChainId, string[]>>;
    }
  | {
      ok: false;
      format: KeyFormat;
      error: string;
    };

/** Quick format sniff for live UI feedback while the user is still typing. */
export function sniffKeyFormat(input: string): KeyFormat {
  const s = input.trim();
  if (!s) return "unknown";
  if (/^6P[1-9A-HJ-NP-Za-km-z]{56}$/.test(s)) return "bip38";
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) return "hex";
  if (/^[5KL9c][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(s)) return "wif";
  return "unknown";
}

/**
 * Parse + derive. Never throws — returns `{ ok: false }` with a user-readable
 * error so the UI can show it inline.
 */
export function parsePrivateKey(input: string): KeyParseResult {
  const s = input.trim();
  if (!s) return { ok: false, format: "unknown", error: "Paste or scan a private key." };

  const format = sniffKeyFormat(s);

  if (format === "bip38") {
    return {
      ok: false,
      format,
      error: "Encrypted (BIP38) keys need a passphrase. Decryption support is coming next.",
    };
  }

  if (format === "hex") {
    const hex = s.replace(/^0x/i, "").toLowerCase();
    const privBytes = hexToBytes(hex);
    if (!isValidScalar(privBytes)) {
      return { ok: false, format, error: "That's not a valid 32-byte private key." };
    }
    return derivePublicAddresses(privBytes, /*compressed*/ true, "hex");
  }

  if (format === "wif") {
    try {
      const decoded = base58check(sha256).decode(s);
      // WIF layout: [version (1)] [priv (32)] [compressed flag (0|1)]
      if (decoded.length !== 33 && decoded.length !== 34) {
        return { ok: false, format, error: "WIF key has an unexpected length." };
      }
      const version = decoded[0];
      const privBytes = decoded.slice(1, 33);
      const compressed = decoded.length === 34 && decoded[33] === 0x01;
      if (!isValidScalar(privBytes)) {
        return { ok: false, format, error: "WIF decoded but the inner key is invalid." };
      }
      if (!ALL_WIF_PREFIXES.includes(version)) {
        return {
          ok: false,
          format,
          error: `Unrecognized WIF network byte (0x${version.toString(16).padStart(2, "0")}).`,
        };
      }
      return derivePublicAddresses(privBytes, compressed, "wif");
    } catch {
      return { ok: false, format, error: "That doesn't look like a valid WIF key (base58 check failed)." };
    }
  }

  return { ok: false, format: "unknown", error: "Unknown key format. Expecting WIF (5/K/L/c…) or 64-char hex." };
}

/**
 * Compare the addresses we derived from the key to the expected one. Case-
 * insensitive for hex chains; exact for base58/bech32 (the encodings already
 * carry checksums, so case mismatches mean different addresses).
 */
export function keyControlsAddress(
  parsed: KeyParseResult,
  chain: ChainId,
  expectedAddress: string,
): boolean {
  if (!parsed.ok) return false;
  const list = parsed.addressesByChain[chain] ?? [];
  const exp = expectedAddress.trim();
  if (chain === "eth") {
    return list.some(a => a.toLowerCase() === exp.toLowerCase());
  }
  return list.includes(exp);
}

// ---------------------------------------------------------------------------
// Derivation internals
// ---------------------------------------------------------------------------

function derivePublicAddresses(
  privBytes: Uint8Array,
  compressed: boolean,
  format: Exclude<KeyFormat, "unknown" | "bip38">,
): KeyParseResult {
  const pubCompressed = getPublicKey(privBytes, true);
  const pubUncompressed = getPublicKey(privBytes, false);

  const addressesByChain: Partial<Record<ChainId, string[]>> = {};

  // ETH — keccak256 of uncompressed pubkey, drop the 0x04 header, take last 20.
  const ethHash = keccak_256(pubUncompressed.slice(1));
  const ethAddress = "0x" + bytesToHex(ethHash.slice(-20));
  addressesByChain.eth = [ethAddress];

  // BTC-family — derive every reasonable address type. We always try BOTH
  // compressed and uncompressed pubkey hashes because old coins are sometimes
  // engraved with uncompressed keys.
  for (const chain of ["btc", "ltc", "doge", "bch", "txc"] as const) {
    const params = BTC_PARAMS[chain];
    const addrs: string[] = [];
    for (const pub of [pubCompressed, pubUncompressed]) {
      const pkh = ripemd160(sha256(pub));
      addrs.push(base58checkEncode(params.p2pkhVersion, pkh));
      if (params.bech32Hrp) {
        // P2WPKH only from compressed pubkey; uncompressed not allowed in segwit.
        if (pub === pubCompressed) addrs.push(bech32P2wpkh(params.bech32Hrp, pkh));
      }
    }
    addressesByChain[chain] = Array.from(new Set(addrs));
  }

  // Which chains is this key a plausible sweep candidate for? Everything we
  // derived for, ordered with hex-friendly chains first.
  const candidates: ChainId[] = ["eth", "btc", "ltc", "doge", "bch", "txc"];

  return {
    ok: true,
    format,
    privateKeyHex: bytesToHex(privBytes),
    compressed,
    candidates,
    addressesByChain,
  };
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function base58checkEncode(version: number, payload: Uint8Array): string {
  const data = new Uint8Array(1 + payload.length);
  data[0] = version;
  data.set(payload, 1);
  return base58check(sha256).encode(data);
}

function bech32P2wpkh(hrp: string, pkh20: Uint8Array): string {
  // witness v0 program — 5-bit groups, witness version prepended.
  const words = bech32.toWords(pkh20);
  return bech32.encode(hrp, [0, ...words], 90);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? "0" + hex : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

// secp256k1 group order — N. Private key must satisfy 1 <= k < N.
const SECP256K1_N = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
);

function isValidScalar(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  let k = 0n;
  for (const b of bytes) k = (k << 8n) | BigInt(b);
  return k > 0n && k < SECP256K1_N;
}
