/**
 * Seed-phrase → TEXITcoin address derivation for the QA scan flow.
 *
 * The laser engraves a BIP-39 mnemonic under the sticker. This module lets
 * the app's camera scan that mnemonic and derive the TXC public address that
 * should be printed on the sticker, so the operator can verify the match
 * before applying the sticker.
 *
 * Supports the 12-word and 24-word variants (TXC12 / TXC24).
 *
 * No network calls. No persistence. The mnemonic is processed in memory only,
 * long enough to compute the address, then discarded.
 */

import { validateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { base58check } from "@scure/base";

// TEXITcoin mainnet params (chainparams.cpp: PUBKEY_ADDRESS = 66 = 0x42).
const TXC_PUBKEY_VERSION = 0x42;
// Iskander Coin mainnet params (PUBKEY_ADDRESS = 45 = 0x2D -> "K…").
const ISK_PUBKEY_VERSION = 0x2d;

// TEXITcoin's registered SLIP-44 coin type is 696969 (see texitcoin.org/build
// and the TXC web wallet). Iskander Coin uses 969696. Legacy P2PKH accounts
// derive on standard BIP-44.
export const TXC_COIN_TYPE = 696969;
export const ISK_COIN_TYPE = 969696;
const TXC_DERIVATION_PATH = `m/44'/${TXC_COIN_TYPE}'/0'/0/0`;
const ISK_DERIVATION_PATH = `m/44'/${ISK_COIN_TYPE}'/0'/0/0`;

/** Chains this module can derive a legacy address for from a mnemonic. */
export type SeedChain = "txc" | "iskander";

const CHAIN_PARAMS: Record<SeedChain, { version: number; path: string }> = {
  txc: { version: TXC_PUBKEY_VERSION, path: TXC_DERIVATION_PATH },
  iskander: { version: ISK_PUBKEY_VERSION, path: ISK_DERIVATION_PATH },
};

export type SeedCandidate = {
  chain: SeedChain;
  /** Derived legacy address (T… for TXC, K… for ISK). */
  address: string;
  /** 6-character CSC Asset ID from the address. */
  assetId: string;
};

export type SeedParseResult = {
  ok: true;
  /** Normalized lower-case mnemonic. */
  seed: string;
  wordCount: number;
  /** Derived legacy TXC address (T…) — the default chain. */
  address: string;
  /** 6-character CSC Asset ID from the TXC address. */
  assetId: string;
  /** Every chain this seed could belong to, with its derived address. */
  candidates: SeedCandidate[];
};

export type SeedParseError = {
  ok: false;
  error: string;
};

/**
 * Detect whether `raw` looks like a 12- or 24-word BIP-39 English mnemonic.
 * If it does, validate the checksum and derive the account-0 address for
 * every supported chain (TXC and ISK).
 */
export function parseSeedPhrase(raw: string): SeedParseResult | SeedParseError {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const words = normalized.split(" ");

  if (words.length !== 12 && words.length !== 24) {
    return { ok: false, error: "Seed phrase must be 12 or 24 words." };
  }

  if (!validateMnemonic(normalized, wordlist)) {
    return { ok: false, error: "Invalid BIP-39 checksum." };
  }

  try {
    const seedBytes = mnemonicToSeedSync(normalized);
    const root = HDKey.fromMasterSeed(seedBytes);
    const candidates: SeedCandidate[] = [];
    for (const chain of ["txc", "iskander"] as const) {
      const { version, path } = CHAIN_PARAMS[chain];
      const child = root.derive(path);
      if (!child.publicKey) continue;
      const address = addressFromPublicKey(version, child.publicKey);
      candidates.push({ chain, address, assetId: address.slice(1, 7).toUpperCase() });
    }
    const primary = candidates.find(c => c.chain === "txc");
    if (!primary) {
      return { ok: false, error: "Derivation failed: no public key." };
    }
    return {
      ok: true,
      seed: normalized,
      wordCount: words.length,
      address: primary.address,
      assetId: primary.assetId,
      candidates,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Derivation failed." };
  }
}

/** True when the text is a valid BIP-39 English mnemonic (12 or 24 words). */
export function isSeedPhrase(text: string): boolean {
  return parseSeedPhrase(text).ok;
}

/**
 * Parse a sticker QR as printed by the keygen labels.txt file:
 *   "<address>,<6_char_asset_id>"
 * Returns null if it doesn't look like a sticker.
 */
export function parseSticker(
  text: string,
): { address: string; assetId: string; chain: SeedChain } | null {
  const trimmed = text.trim();
  const parts = trimmed.split(",");
  if (parts.length !== 2) return null;
  const [address, assetId] = parts.map(p => p.trim());
  const chain: SeedChain | null =
    /^T[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) ? "txc"
    : /^K[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) ? "iskander"
    : null;
  if (!chain) return null;
  if (!/^[A-Z0-9]{6}$/i.test(assetId)) return null;
  return { address, assetId: assetId.toUpperCase(), chain };
}

function txcAddressFromPublicKey(pubkeyCompressed: Uint8Array): string {
  const pkh20 = ripemd160(sha256(pubkeyCompressed));
  const payload = new Uint8Array(1 + pkh20.length);
  payload[0] = TXC_PUBKEY_VERSION;
  payload.set(pkh20, 1);
  return base58check(sha256).encode(payload);
}
