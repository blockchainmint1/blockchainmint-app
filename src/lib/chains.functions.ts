/**
 * Server functions for chain lookups + watched address CRUD + verification.
 *
 * Live coverage:
 *   - BTC, TXC via Esplora-compatible REST (mempool.space, mempool.texitcoin.org)
 *   - ETH via Alchemy JSON-RPC + asset transfers
 *   - LTC, DOGE, BCH via Blockchair dashboards
 *   - TXC Omni layer-2 token balances via TEXITcoin RPC
 * Prices: CoinMarketCap → CoinGecko fallback, 60s in-memory cache (prices.server.ts)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAINS, type ChainId } from "./chains";

const ChainIdSchema = z.enum([
  "btc","eth","ltc","doge","bch","bsc","ada","sol","bnb","txc","iskander",
] as const);

export type Layer2Token = {
  id: string;                // propertyId for Omni, contractAddress for ERC20
  type: "omni" | "erc20";
  name: string;
  ticker?: string;
  balance: number;             // human units
  reserved?: number;
  divisible?: boolean;
};

// Backwards-compat alias
export type OmniToken = Layer2Token;

export type AddressSummary = {
  chain: ChainId;
  address: string;
  balance: number;
  balanceFiat: number | null;
  txCount: number;
  supported: boolean;
  tokens?: OmniToken[];   // populated for TXC when Omni RPC is configured
  error?: string;
};

export type TxRecord = {
  hash: string;
  direction: "in" | "out" | "self";
  amount: number;
  fee: number | null;
  timestamp: number | null;
  confirmed: boolean;
  url: string;
};

async function getPrice(chain: ChainId): Promise<number | null> {
  const { priceUsd } = await import("./prices.server");
  return priceUsd(chain);
}

// ---------- Esplora (BTC + TXC base layer) ---------------------------------

type EsploraConfig = {
  chain: ChainId;
  base: string;
  txUrl: (txid: string) => string;
};

const ESPLORA: Record<"btc" | "txc", EsploraConfig> = {
  btc: { chain: "btc", base: "https://mempool.space",          txUrl: t => `https://mempool.space/tx/${t}` },
  txc: { chain: "txc", base: "https://mempool.texitcoin.org",  txUrl: t => `https://mempool.texitcoin.org/tx/${t}` },
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
      j.chain_stats.funded_txo_sum - j.chain_stats.spent_txo_sum +
      j.mempool_stats.funded_txo_sum - j.mempool_stats.spent_txo_sum;
    const balance = sats / 1e8;
    const price = await getPrice(cfg.chain);
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
      const inSum  = tx.vin.filter(v => v.prevout?.scriptpubkey_address === address).reduce((s, v) => s + (v.prevout?.value ?? 0), 0);
      const outSum = tx.vout.filter(v => v.scriptpubkey_address === address).reduce((s, v) => s + v.value, 0);
      const net = outSum - inSum;
      const direction: TxRecord["direction"] = net > 0 ? "in" : net < 0 ? "out" : "self";
      return {
        hash: tx.txid, direction, amount: net / 1e8,
        fee: tx.fee / 1e8,
        timestamp: tx.status.block_time ?? null,
        confirmed: tx.status.confirmed,
        url: cfg.txUrl(tx.txid),
      };
    });
  } catch { return []; }
}

// ---------- TXC Omni layer-2 tokens ----------------------------------------

async function txcRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const url  = process.env.TXC_RPC_ADDRESS;
  const user = process.env.TXC_RPC_USER;
  const pass = process.env.TXC_RPC_PASSWORD;
  if (!url || !user || !pass) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
      },
      body: JSON.stringify({ jsonrpc: "1.0", id: "csc", method, params }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: T; error?: { message?: string } };
    if (j.error) return null;
    return (j.result ?? null) as T | null;
  } catch { return null; }
}

async function omniTokensForAddress(address: string): Promise<OmniToken[] | undefined> {
  type Raw = Array<{ propertyid: number; balance: string; reserved?: string; frozen?: string }>;
  const balances = await txcRpc<Raw>("omni_getallbalancesforaddress", [address]);
  if (!balances || balances.length === 0) return undefined;
  const out: OmniToken[] = [];
  for (const b of balances) {
    // Fetch property metadata for name/divisibility (best-effort)
    const meta = await txcRpc<{ name?: string; ticker?: string; divisible?: boolean }>(
      "omni_getproperty", [b.propertyid],
    );
    const divisible = meta?.divisible !== false;
    // Omni returns balances as decimal strings already in human units for
    // divisible properties; indivisible properties are integer strings.
    const bal = divisible ? Number(b.balance) : Number(b.balance);
    out.push({
      propertyId: b.propertyid,
      name: meta?.name ?? `Property ${b.propertyid}`,
      ticker: meta?.ticker,
      balance: bal,
      reserved: b.reserved ? Number(b.reserved) : undefined,
      divisible,
    });
  }
  return out;
}

// ---------- ETH via Alchemy ------------------------------------------------

function alchemyEthUrl(): string | null {
  const key = process.env.ALCHEMY_API;
  return key ? `https://eth-mainnet.g.alchemy.com/v2/${key}` : null;
}

async function ethSummary(address: string): Promise<AddressSummary> {
  const url = alchemyEthUrl();
  if (!url) return { chain: "eth", address, balance: 0, balanceFiat: null, txCount: 0, supported: true, error: "ETH provider not configured" };
  try {
    const [balRes, countRes] = await Promise.all([
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }) }),
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getTransactionCount", params: [address, "latest"] }) }),
    ]);
    const bal = (await balRes.json()) as { result?: string };
    const cnt = (await countRes.json()) as { result?: string };
    const balance = Number(BigInt(bal.result ?? "0x0")) / 1e18;
    const txCount = cnt.result ? parseInt(cnt.result, 16) : 0;
    const price = await getPrice("eth");
    return { chain: "eth", address, balance, balanceFiat: price != null ? balance * price : null, txCount, supported: true };
  } catch (e) {
    return { chain: "eth", address, balance: 0, balanceFiat: null, txCount: 0, supported: true, error: (e as Error).message };
  }
}

async function ethHistory(address: string): Promise<TxRecord[]> {
  const url = alchemyEthUrl();
  if (!url) return [];
  try {
    const body = (direction: "from" | "to") => ({
      jsonrpc: "2.0", id: direction, method: "alchemy_getAssetTransfers",
      params: [{
        fromBlock: "0x0", toBlock: "latest",
        [direction === "from" ? "fromAddress" : "toAddress"]: address,
        category: ["external", "internal", "erc20"],
        withMetadata: true, maxCount: "0x19", order: "desc",
      }],
    });
    const [outRes, inRes] = await Promise.all([
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body("from")) }),
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body("to")) }),
    ]);
    type Transfer = {
      hash: string; from: string; to: string | null; value: number | null;
      asset?: string; metadata?: { blockTimestamp?: string };
    };
    const outJ = (await outRes.json()) as { result?: { transfers?: Transfer[] } };
    const inJ  = (await inRes.json())  as { result?: { transfers?: Transfer[] } };
    const all = [...(outJ.result?.transfers ?? []), ...(inJ.result?.transfers ?? [])];
    const seen = new Set<string>();
    const txs: TxRecord[] = [];
    for (const t of all) {
      if (seen.has(t.hash)) continue;
      seen.add(t.hash);
      const isOut = t.from?.toLowerCase() === address.toLowerCase();
      const isIn  = t.to?.toLowerCase() === address.toLowerCase();
      const direction: TxRecord["direction"] = isOut && isIn ? "self" : isOut ? "out" : "in";
      const amt = t.value ?? 0;
      txs.push({
        hash: t.hash, direction,
        amount: direction === "out" ? -amt : amt,
        fee: null,
        timestamp: t.metadata?.blockTimestamp ? Math.floor(new Date(t.metadata.blockTimestamp).getTime() / 1000) : null,
        confirmed: true,
        url: `https://etherscan.io/tx/${t.hash}`,
      });
    }
    txs.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    return txs.slice(0, 25);
  } catch { return []; }
}

// ---------- Blockchair (LTC, DOGE, BCH) ------------------------------------

const BLOCKCHAIR_SLUG: Partial<Record<ChainId, string>> = {
  ltc: "litecoin",
  doge: "dogecoin",
  bch: "bitcoin-cash",
};

async function blockchairSummary(chain: ChainId, address: string): Promise<AddressSummary> {
  const slug = BLOCKCHAIR_SLUG[chain];
  if (!slug) return { chain, address, balance: 0, balanceFiat: null, txCount: 0, supported: false };
  try {
    const res = await fetch(`https://api.blockchair.com/${slug}/dashboards/address/${address}?limit=0`);
    if (!res.ok) throw new Error(`${chain} ${res.status}`);
    const j = (await res.json()) as {
      data?: Record<string, { address?: { balance?: number; transaction_count?: number } }>;
    };
    const row = j.data ? Object.values(j.data)[0] : undefined;
    const balance = (row?.address?.balance ?? 0) / 1e8;
    const price = await getPrice(chain);
    return {
      chain, address, balance,
      balanceFiat: price != null ? balance * price : null,
      txCount: row?.address?.transaction_count ?? 0,
      supported: true,
    };
  } catch (e) {
    return { chain, address, balance: 0, balanceFiat: null, txCount: 0, supported: true, error: (e as Error).message };
  }
}

async function blockchairHistory(chain: ChainId, address: string): Promise<TxRecord[]> {
  const slug = BLOCKCHAIR_SLUG[chain];
  if (!slug) return [];
  try {
    const res = await fetch(`https://api.blockchair.com/${slug}/dashboards/address/${address}?limit=25`);
    if (!res.ok) return [];
    const j = (await res.json()) as {
      data?: Record<string, { transactions?: string[] }>;
    };
    const row = j.data ? Object.values(j.data)[0] : undefined;
    const hashes = row?.transactions ?? [];
    return hashes.slice(0, 25).map(h => ({
      hash: h, direction: "in" as const, amount: 0, fee: null, timestamp: null,
      confirmed: true, url: `https://blockchair.com/${slug}/transaction/${h}`,
    }));
  } catch { return []; }
}

// ---------- Dispatch --------------------------------------------------------

async function summarize(chain: ChainId, address: string): Promise<AddressSummary> {
  if (chain === "btc") return esploraSummary(ESPLORA.btc, address);
  if (chain === "txc") {
    const base = await esploraSummary(ESPLORA.txc, address);
    const tokens = await omniTokensForAddress(address).catch(() => undefined);
    return tokens ? { ...base, tokens } : base;
  }
  if (chain === "eth") return ethSummary(address);
  if (chain === "ltc" || chain === "doge" || chain === "bch") return blockchairSummary(chain, address);
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
  if (chain === "ltc" || chain === "doge" || chain === "bch") return blockchairHistory(chain, address);
  return [];
}

// ============================================================================
// PUBLIC server functions
// ============================================================================

export const lookupAddress = createServerFn({ method: "POST" })
  .inputValidator((input: { chain: ChainId; address: string }) =>
    z.object({ chain: ChainIdSchema, address: z.string().min(8).max(120) }).parse(input),
  )
  .handler(async ({ data }) => summarize(data.chain, data.address));

export const getTxHistory = createServerFn({ method: "POST" })
  .inputValidator((input: { chain: ChainId; address: string }) =>
    z.object({ chain: ChainIdSchema, address: z.string().min(8).max(120) }).parse(input),
  )
  .handler(async ({ data }) => history(data.chain, data.address));

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

// ---------- Authenticated: watched_addresses ------------------------------

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
