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
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { base58check } from "@scure/base";

// TEXITcoin mainnet params (chainparams.cpp: PUBKEY_ADDRESS = 66 = 0x42).
const TXC_PUBKEY_VERSION = 0x42;

// TXC has no registered SLIP-44 coin type, so the keygen plugins derive on
// Bitcoin's path (coin type 0) and re-encode with TXC version bytes.
const TXC_DERIVATION_PATH = "m/44'/0'/0'/0/0";

export type SeedParseResult = {
  ok: true;
  /** Normalized lower-case mnemonic. */
  seed: string;
  wordCount: number;
  /** Derived legacy TXC address (T…). */
  address: string;
  /** 6-character CSC Asset ID from the address. */
  assetId: string;
};

export type SeedParseError = {
  ok: false;
  error: string;
};

/**
 * Detect whether `raw` looks like a 12- or 24-word BIP-39 English mnemonic.
 * If it does, validate the checksum and derive the TXC account-0 address.
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
    const child = root.derive(TXC_DERIVATION_PATH);
    if (!child.publicKey) {
      return { ok: false, error: "Derivation failed: no public key." };
    }
    const address = txcAddressFromPublicKey(child.publicKey);
    return {
      ok: true,
      seed: normalized,
      wordCount: words.length,
      address,
      assetId: address.slice(1, 7).toUpperCase(),
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
 *   "<txc_address>,<6_char_asset_id>"
 * Returns null if it doesn't look like a sticker.
 */
export function parseSticker(text: string): { address: string; assetId: string } | null {
  const trimmed = text.trim();
  const parts = trimmed.split(",");
  if (parts.length !== 2) return null;
  const [address, assetId] = parts.map(p => p.trim());
  if (!/^T[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return null;
  if (!/^[A-Z0-9]{6}$/i.test(assetId)) return null;
  return { address, assetId: assetId.toUpperCase() };
}

function txcAddressFromPublicKey(pubkeyCompressed: Uint8Array): string {
  const pkh20 = ripemd160(sha256(pubkeyCompressed));
  const payload = new Uint8Array(1 + pkh20.length);
  payload[0] = TXC_PUBKEY_VERSION;
  payload.set(pkh20, 1);
  return base58check(sha256).encode(payload);
}
