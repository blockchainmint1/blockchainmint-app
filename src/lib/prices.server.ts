/**
 * Unified USD price service.
 * Primary: CoinMarketCap (CMC_API).  Fallback: CoinGecko (no key).
 * In-memory 60s cache so a portfolio render only fans out once.
 *
 * Server-only — imported from server function handlers via dynamic import.
 */

import type { ChainId } from "./chains";

// CMC symbol per chain. Omitted chains fall back to CoinGecko id.
const CMC_SYMBOLS: Partial<Record<ChainId, string>> = {
  btc: "BTC",
  eth: "ETH",
  ltc: "LTC",
  doge: "DOGE",
  bch: "BCH",
  bsc: "BNB",
  bnb: "BNB",
  ada: "ADA",
  sol: "SOL",
  txc: "TXC",
};

const CG_IDS: Partial<Record<ChainId, string>> = {
  btc: "bitcoin",
  eth: "ethereum",
  ltc: "litecoin",
  doge: "dogecoin",
  bch: "bitcoin-cash",
  bsc: "binancecoin",
  bnb: "binancecoin",
  ada: "cardano",
  sol: "solana",
  txc: "texitcoin",
};

type CacheEntry = { price: number | null; expires: number };
const cache = new Map<ChainId, CacheEntry>();
const TTL_MS = 60_000;

let cmcInflight: Promise<Map<string, number>> | null = null;

async function fetchCmcBatch(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const key = process.env.CMC_API;
  if (!key || symbols.length === 0) return out;
  try {
    const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${symbols.join(",")}&convert=USD`;
    const res = await fetch(url, { headers: { "X-CMC_PRO_API_KEY": key, accept: "application/json" } });
    if (!res.ok) return out;
    const json = (await res.json()) as {
      data?: Record<string, Array<{ quote?: { USD?: { price?: number } } }>>;
    };
    for (const [sym, arr] of Object.entries(json.data ?? {})) {
      const p = arr?.[0]?.quote?.USD?.price;
      if (typeof p === "number") out.set(sym.toUpperCase(), p);
    }
  } catch {
    /* fall through to CoinGecko */
  }
  return out;
}

async function fetchCoinGecko(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return out;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    for (const [id, v] of Object.entries(data)) {
      if (typeof v.usd === "number") out.set(id, v.usd);
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** Resolve USD price for a single chain (cached, batched). */
export async function priceUsd(chain: ChainId): Promise<number | null> {
  const now = Date.now();
  const hit = cache.get(chain);
  if (hit && hit.expires > now) return hit.price;

  // Batch all chains we know about in one CMC call to amortize the key spend.
  if (!cmcInflight) {
    const allChains = Object.keys(CMC_SYMBOLS) as ChainId[];
    const symbols = allChains.map(c => CMC_SYMBOLS[c]!).filter(Boolean);
    cmcInflight = fetchCmcBatch(symbols);
    // Clear after this microtask batch.
    queueMicrotask(() => { cmcInflight = null; });
  }
  const cmc = await cmcInflight;

  // Anything CMC didn't return → try CoinGecko in one batched call.
  const missing: ChainId[] = [];
  for (const c of Object.keys(CMC_SYMBOLS) as ChainId[]) {
    const sym = CMC_SYMBOLS[c];
    if (sym && cmc.has(sym)) continue;
    if (CG_IDS[c]) missing.push(c);
  }
  const cg = missing.length ? await fetchCoinGecko(missing.map(c => CG_IDS[c]!)) : new Map();

  // Hydrate cache for every chain we tried, so subsequent calls hit cache.
  for (const c of Object.keys(CMC_SYMBOLS) as ChainId[]) {
    const sym = CMC_SYMBOLS[c];
    const id = CG_IDS[c];
    const price = (sym && cmc.get(sym)) ?? (id ? cg.get(id) ?? null : null);
    cache.set(c, { price, expires: now + TTL_MS });
  }
  return cache.get(chain)?.price ?? null;
}
