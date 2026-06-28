import type { ChainId } from "./chains";

/**
 * Parse a payload scanned from a coin's QR. Accepts:
 *   - Plain address: "bc1q…", "0x…", "T…" (TXC)
 *   - BIP-21 URIs:  "bitcoin:bc1q…?amount=…"
 *   - "ethereum:0x…", "litecoin:…", "dogecoin:…"
 * Returns null if we can't recognize it.
 */
export function parseCoinPayload(raw: string): { chain: ChainId; address: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // URI form
  const uriMatch = trimmed.match(/^([a-zA-Z]+):([^?#]+)/);
  if (uriMatch) {
    const scheme = uriMatch[1].toLowerCase();
    const addr = decodeURIComponent(uriMatch[2]);
    const map: Record<string, ChainId> = {
      bitcoin: "btc",
      btc: "btc",
      ethereum: "eth",
      eth: "eth",
      litecoin: "ltc",
      dogecoin: "doge",
      bitcoincash: "bch",
      "bitcoin-cash": "bch",
      bsc: "bsc",
      cardano: "ada",
      solana: "sol",
      bnb: "bnb",
      texitcoin: "txc",
      txc: "txc",
    };
    const chain = map[scheme];
    if (chain) return { chain, address: addr };
  }

  // Bare address heuristics
  return detectChain(trimmed);
}

export function detectChain(addr: string): { chain: ChainId; address: string } | null {
  if (!addr) return null;
  const a = addr.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(a)) return { chain: "eth", address: a };
  if (/^(bc1|tb1)[a-z0-9]{20,87}$/i.test(a) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)) return { chain: "btc", address: a };
  if (/^(ltc1)[a-z0-9]{20,87}$/i.test(a) || /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/.test(a)) return { chain: "ltc", address: a };
  if (/^D[5-9A-HJ-NP-U][a-km-zA-HJ-NP-Z1-9]{32}$/.test(a)) return { chain: "doge", address: a };
  // BCH: cashaddr (bitcoincash:q… or bare q…/p…) — try before generic legacy
  // since 1… is ambiguous with BTC.
  if (/^bitcoincash:[qp][qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/i.test(a)) return { chain: "bch", address: a };
  if (/^[qp][qpzry9x8gf2tvdw0s3jn54khce6mua7l]{41,}$/.test(a)) return { chain: "bch", address: `bitcoincash:${a}` };
  // TXC: bech32 (txc1…) and legacy base58 (T…)
  if (/^txc1[a-z0-9]{20,87}$/i.test(a)) return { chain: "txc", address: a };
  if (/^T[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)) return { chain: "txc", address: a };
  // Cardano Shelley (addr1…) and testnet (addr_test1…)
  if (/^addr1[a-z0-9]{50,}$/i.test(a) || /^addr_test1[a-z0-9]{50,}$/i.test(a)) return { chain: "ada", address: a };
  return null;
}

