/**
 * Server functions for chain lookups + watched address CRUD + verification.
 * Phase 1: BTC via mempool.space, ETH via blockscout (no API key), TXC mocked.
 * Phase 3 will add adapters for the remaining chains behind the same shape.
 *
 * All chain APIs are called from the server so the client never has to know
 * about rate limits or alternate explorer fallbacks.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAINS, type ChainId } from "./chains";

const ChainIdSchema = z.enum([
  "btc","eth","ltc","doge","bch","bsc","ada","sol","bnb","txc","iskander",
] as const);

export type AddressSummary = {
  chain: ChainId;
  address: string;
  balance: number;       // human units (e.g. BTC, ETH)
  balanceFiat: number | null; // USD if we know a price
  txCount: number;
  supported: boolean;
  error?: string;
};

export type TxRecord = {
  hash: string;
  direction: "in" | "out" | "self";
  amount: number;        // human units, signed by direction
  fee: number | null;
  timestamp: number | null; // unix seconds
  confirmed: boolean;
  url: string;           // explorer link
};

// ---------- Price helpers ----------------------------------------------------

const PRICE_IDS: Partial<Record<ChainId, string>> = {
  btc: "bitcoin",
  eth: "ethereum",
  ltc: "litecoin",
  doge: "dogecoin",
  bch: "bitcoin-cash",
  bsc: "binancecoin",
  ada: "cardano",
  sol: "solana",
  bnb: "binancecoin",
};

async function priceUsd(chain: ChainId): Promise<number | null> {
  const id = PRICE_IDS[chain];
  if (!id) return null;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    return data[id]?.usd ?? null;
  } catch {
    return null;
  }
}

// ---------- Esplora/mempool.space-compatible REST (BTC + TXC) ---------------
//
// mempool.texitcoin.org mirrors the mempool.space / Esplora REST spec
// (see https://texitcoin.org/build#api), so the same shapes work for both.

type EsploraConfig = {
  chain: ChainId;
  base: string;            // e.g. https://mempool.space
  txUrl: (txid: string) => string;
  priceKey: "btc" | null;  // CoinGecko id; null = no fiat lookup
};

const ESPLORA: Record<"btc" | "txc", EsploraConfig> = {
  btc: {
    chain: "btc",
    base: "https://mempool.space",
    txUrl: (txid) => `https://mempool.space/tx/${txid}`,
    priceKey: "btc",
  },
  txc: {
    chain: "txc",
    base: "https://mempool.texitcoin.org",
    txUrl: (txid) => `https://mempool.texitcoin.org/tx/${txid}`,
    priceKey: null, // TXC isn't on CoinGecko yet — show native balance only
  },
};

async function esploraSummary(cfg: EsploraConfig, address: string): Promise<AddressSummary> {
  try {
    const res = await fetch(`${cfg.base}/api/address/${address}`);
    if (!res.ok) throw new Error(`${cfg.chain} ${res.status}`);
    const j = (await res.json()) as {
      chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
      mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
    };
    const sats =
      j.chain_stats.funded_txo_sum -
      j.chain_stats.spent_txo_sum +
      j.mempool_stats.funded_txo_sum -
      j.mempool_stats.spent_txo_sum;
    const balance = sats / 1e8;
    const price = cfg.priceKey ? await priceUsd(cfg.priceKey) : null;
    return {
      chain: cfg.chain, address, balance,
      balanceFiat: price != null ? balance * price : null,
      txCount: j.chain_stats.tx_count + j.mempool_stats.tx_count,
      supported: true,
    };
  } catch (e) {
    return { chain: cfg.chain, address, balance: 0, balanceFiat: null, txCount: 0, supported: true, error: (e as Error).message };
  }
}

async function esploraHistory(cfg: EsploraConfig, address: string): Promise<TxRecord[]> {
  try {
    const res = await fetch(`${cfg.base}/api/address/${address}/txs`);
    if (!res.ok) return [];
    const txs = (await res.json()) as Array<{
      txid: string;
      status: { confirmed: boolean; block_time?: number };
      vin: Array<{ prevout?: { scriptpubkey_address?: string; value: number } }>;
      vout: Array<{ scriptpubkey_address?: string; value: number }>;
      fee: number;
    }>;
    return txs.slice(0, 25).map(tx => {
      const inSum = tx.vin.filter(v => v.prevout?.scriptpubkey_address === address).reduce((s, v) => s + (v.prevout?.value ?? 0), 0);
      const outSum = tx.vout.filter(v => v.scriptpubkey_address === address).reduce((s, v) => s + v.value, 0);
      const net = outSum - inSum;
      const direction: TxRecord["direction"] = net > 0 ? "in" : net < 0 ? "out" : "self";
      return {
        hash: tx.txid,
        direction,
        amount: net / 1e8,
        fee: tx.fee / 1e8,
        timestamp: tx.status.block_time ?? null,
        confirmed: tx.status.confirmed,
        url: cfg.txUrl(tx.txid),
      };
    });
  } catch {
    return [];
  }
}

// ---------- ETH via blockscout (public, no key) -----------------------------

async function ethSummary(address: string): Promise<AddressSummary> {
  try {
    const balRes = await fetch(`https://eth.blockscout.com/api?module=account&action=balance&address=${address}`);
    const balJson = (await balRes.json()) as { status: string; result: string };
    const balanceWei = BigInt(balJson.result || "0");
    const balance = Number(balanceWei) / 1e18;
    const txRes = await fetch(`https://eth.blockscout.com/api/v2/addresses/${address}/transactions?filter=to%20%7C%20from`);
    let txCount = 0;
    if (txRes.ok) {
      const tj = (await txRes.json()) as { items?: unknown[] };
      txCount = tj.items?.length ?? 0;
    }
    const price = await priceUsd("eth");
    return {
      chain: "eth", address, balance,
      balanceFiat: price != null ? balance * price : null,
      txCount, supported: true,
    };
  } catch (e) {
    return { chain: "eth", address, balance: 0, balanceFiat: null, txCount: 0, supported: true, error: (e as Error).message };
  }
}

async function ethHistory(address: string): Promise<TxRecord[]> {
  try {
    const res = await fetch(`https://eth.blockscout.com/api/v2/addresses/${address}/transactions`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{
        hash: string;
        from?: { hash: string };
        to?: { hash: string };
        value: string;
        fee?: { value?: string };
        timestamp?: string;
        status?: string;
      }>;
    };
    const items = data.items ?? [];
    return items.slice(0, 25).map(tx => {
      const isOut = tx.from?.hash?.toLowerCase() === address.toLowerCase();
      const isIn = tx.to?.hash?.toLowerCase() === address.toLowerCase();
      const direction: TxRecord["direction"] = isOut && isIn ? "self" : isOut ? "out" : "in";
      const amt = Number(BigInt(tx.value || "0")) / 1e18;
      return {
        hash: tx.hash,
        direction,
        amount: direction === "out" ? -amt : amt,
        fee: tx.fee?.value ? Number(BigInt(tx.fee.value)) / 1e18 : null,
        timestamp: tx.timestamp ? Math.floor(new Date(tx.timestamp).getTime() / 1000) : null,
        confirmed: tx.status === "ok",
        url: `https://eth.blockscout.com/tx/${tx.hash}`,
      };
    });
  } catch {
    return [];
  }
}

// ---------- Dispatch --------------------------------------------------------

async function summarize(chain: ChainId, address: string): Promise<AddressSummary> {
  if (chain === "btc") return esploraSummary(ESPLORA.btc, address);
  if (chain === "txc") return esploraSummary(ESPLORA.txc, address);
  if (chain === "eth") return ethSummary(address);
  return {
    chain, address, balance: 0, balanceFiat: null, txCount: 0,
    supported: false,
    error: `${CHAINS[chain].name} live lookup arrives in Phase 3.`,
  };
}

async function history(chain: ChainId, address: string): Promise<TxRecord[]> {
  if (chain === "btc") return esploraHistory(ESPLORA.btc, address);
  if (chain === "txc") return esploraHistory(ESPLORA.txc, address);
  if (chain === "eth") return ethHistory(address);
  return [];
}


// ============================================================================
// PUBLIC server functions
// ============================================================================

/** Public lookup for verify + scan flows. No auth required. */
export const lookupAddress = createServerFn({ method: "POST" })
  .inputValidator((input: { chain: ChainId; address: string }) =>
    z.object({ chain: ChainIdSchema, address: z.string().min(8).max(120) }).parse(input),
  )
  .handler(async ({ data }) => summarize(data.chain, data.address));

/** Recent transactions for a public address. */
export const getTxHistory = createServerFn({ method: "POST" })
  .inputValidator((input: { chain: ChainId; address: string }) =>
    z.object({ chain: ChainIdSchema, address: z.string().min(8).max(120) }).parse(input),
  )
  .handler(async ({ data }) => history(data.chain, data.address));

/** Authenticity check against the public mint registry. */
export const verifyMintRecord = createServerFn({ method: "POST" })
  .inputValidator((input: { chain: ChainId; address: string }) =>
    z.object({ chain: ChainIdSchema, address: z.string().min(8).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: rec, error } = await supabase
      .from("verification_records")
      .select("chain,address,serial,mint_year,denomination,metal,product_slug,notes")
      .eq("chain", data.chain)
      .eq("address", data.address)
      .maybeSingle();
    if (error) return { authentic: false as const, error: error.message };
    if (!rec)  return { authentic: false as const };
    return { authentic: true as const, record: rec };
  });

// ---------- Authenticated: watched_addresses & alerts ----------------------

export const listWatched = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("watched_addresses")
      .select("id,chain,address,label,mint_year,denomination,metal,serial,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const addWatched = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    chain: ChainId; address: string; label?: string;
    mint_year?: number; denomination?: string; metal?: string; serial?: string;
  }) =>
    z.object({
      chain: ChainIdSchema,
      address: z.string().min(8).max(120),
      label: z.string().max(80).optional(),
      mint_year: z.number().int().min(2000).max(2100).optional(),
      denomination: z.string().max(40).optional(),
      metal: z.string().max(40).optional(),
      serial: z.string().max(60).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("watched_addresses")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeWatched = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("watched_addresses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Combined home payload: every watched coin + its current summary. */
export const homePortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: coins, error } = await context.supabase
      .from("watched_addresses")
      .select("id,chain,address,label,denomination,metal,serial,mint_year,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const summaries = await Promise.all(
      (coins ?? []).map(async c => ({ ...c, summary: await summarize(c.chain as ChainId, c.address) })),
    );
    const totalFiat = summaries.reduce((s, c) => s + (c.summary.balanceFiat ?? 0), 0);
    return { coins: summaries, totalFiat };
  });
