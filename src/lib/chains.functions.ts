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
    const out: Layer2Token[] = [];
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
        id: String(b.propertyid),
        type: "omni",
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
    const [balRes, countRes, tokens] = await Promise.all([
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }) }),
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getTransactionCount", params: [address, "latest"] }) }),
      ethTokens(address),
    ]);
    const bal = (await balRes.json()) as { result?: string };
    const cnt = (await countRes.json()) as { result?: string };
    const balance = Number(BigInt(bal.result ?? "0x0")) / 1e18;
    const txCount = cnt.result ? parseInt(cnt.result, 16) : 0;
    const price = await getPrice("eth");
    return { chain: "eth", address, balance, balanceFiat: price != null ? balance * price : null, txCount, supported: true, tokens };
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

async function ethTokens(address: string): Promise<Layer2Token[] | undefined> {
  const url = alchemyEthUrl();
  if (!url) return undefined;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getTokenBalances",
        params: [address, "erc20"],
      }),
    });
    const j = (await res.json()) as {
      result?: { tokenBalances?: Array<{ contractAddress: string; tokenBalance: string }> };
    };
    const balances = j.result?.tokenBalances ?? [];
    const out: Layer2Token[] = [];
    for (const b of balances) {
      const balanceHex = b.tokenBalance;
      if (!balanceHex || balanceHex === "0x" || BigInt(balanceHex) === 0n) continue;
      const metaRes = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "alchemy_getTokenMetadata",
          params: [b.contractAddress],
        }),
      });
      const meta = (await metaRes.json()) as {
        result?: { name?: string; symbol?: string; decimals?: number; logo?: string };
      };
      const decimals = meta.result?.decimals ?? 18;
      const balance = Number(BigInt(balanceHex) / BigInt(10 ** Math.max(0, decimals - 8))) / 1e8;
      out.push({
        id: b.contractAddress,
        type: "erc20",
        name: meta.result?.name ?? `ERC-20 ${b.contractAddress.slice(0, 6)}…`,
        ticker: meta.result?.symbol,
        balance,
        divisible: true,
      });
    }
    return out.length > 0 ? out : undefined;
  } catch { return undefined; }
}

// ---------- LTC / DOGE / BCH (multi-provider, free-tier) -------------------
//
// Blockchair's free tier rate-limits aggressively (HTTP 200 with
// `data: null` and a 430 error in the context envelope), so we hit
// dedicated explorers first and fall back to Blockchair only on failure.

const BLOCKCHAIR_SLUG: Partial<Record<ChainId, string>> = {
  ltc: "litecoin",
  doge: "dogecoin",
  bch: "bitcoin-cash",
};

type BalanceRow = { balance: number; txCount: number };

async function ltcLitecoinspace(address: string): Promise<BalanceRow | null> {
  try {
    const res = await fetch(`https://litecoinspace.org/api/address/${address}`);
    if (!res.ok) return null;
    const j = (await res.json()) as {
      chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
      mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
    };
    const sats =
      j.chain_stats.funded_txo_sum - j.chain_stats.spent_txo_sum +
      j.mempool_stats.funded_txo_sum - j.mempool_stats.spent_txo_sum;
    return { balance: sats / 1e8, txCount: j.chain_stats.tx_count + j.mempool_stats.tx_count };
  } catch { return null; }
}

async function blockcypherBalance(coin: "ltc" | "doge", address: string): Promise<BalanceRow | null> {
  try {
    const res = await fetch(`https://api.blockcypher.com/v1/${coin}/main/addrs/${address}/balance`);
    if (!res.ok) return null;
    const j = (await res.json()) as { final_balance?: number; final_n_tx?: number; error?: string };
    if (j.error) return null;
    return { balance: (j.final_balance ?? 0) / 1e8, txCount: j.final_n_tx ?? 0 };
  } catch { return null; }
}

async function haskoinBchBalance(address: string): Promise<BalanceRow | null> {
  try {
    const res = await fetch(`https://api.haskoin.com/bch/address/${address}/balance`);
    if (!res.ok) return null;
    const j = (await res.json()) as { confirmed?: number; unconfirmed?: number; txs?: number };
    const sats = (j.confirmed ?? 0) + (j.unconfirmed ?? 0);
    return { balance: sats / 1e8, txCount: j.txs ?? 0 };
  } catch { return null; }
}

async function blockchairBalance(chain: ChainId, address: string): Promise<BalanceRow | null> {
  const slug = BLOCKCHAIR_SLUG[chain];
  if (!slug) return null;
  try {
    const res = await fetch(`https://api.blockchair.com/${slug}/dashboards/address/${address}?limit=0`);
    if (!res.ok) return null;
    const j = (await res.json()) as {
      data?: Record<string, { address?: { balance?: number; transaction_count?: number } }> | null;
    };
    if (!j.data) return null;
    const row = Object.values(j.data)[0];
    return {
      balance: (row?.address?.balance ?? 0) / 1e8,
      txCount: row?.address?.transaction_count ?? 0,
    };
  } catch { return null; }
}

async function blockchairSummary(chain: ChainId, address: string): Promise<AddressSummary> {
  let row: BalanceRow | null = null;
  if (chain === "ltc") row = await ltcLitecoinspace(address) ?? await blockcypherBalance("ltc", address);
  else if (chain === "doge") row = await blockcypherBalance("doge", address);
  else if (chain === "bch") row = await haskoinBchBalance(address);
  if (!row) row = await blockchairBalance(chain, address);
  if (!row) {
    return { chain, address, balance: 0, balanceFiat: null, txCount: 0, supported: true, error: "Explorer unavailable. Try again in a moment." };
  }
  const price = await getPrice(chain);
  return {
    chain, address, balance: row.balance,
    balanceFiat: price != null ? row.balance * price : null,
    txCount: row.txCount, supported: true,
  };
}

async function blockchairHistory(chain: ChainId, address: string): Promise<TxRecord[]> {
  const slug = BLOCKCHAIR_SLUG[chain];
  if (!slug) return [];
  try {
    const res = await fetch(`https://api.blockchair.com/${slug}/dashboards/address/${address}?limit=25`);
    if (!res.ok) return [];
    const j = (await res.json()) as {
      data?: Record<string, { transactions?: string[] }> | null;
    };
    if (!j.data) return [];
    const row = Object.values(j.data)[0];
    const hashes = row?.transactions ?? [];
    return hashes.slice(0, 25).map(h => ({
      hash: h, direction: "in" as const, amount: 0, fee: null, timestamp: null,
      confirmed: true, url: `https://blockchair.com/${slug}/transaction/${h}`,
    }));
  } catch { return []; }
}


// ---------- Cardano via Koios (no API key required) ------------------------

async function adaSummary(address: string): Promise<AddressSummary> {
  try {
    const res = await fetch("https://api.koios.rest/api/v1/address_info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ _addresses: [address] }),
    });
    if (!res.ok) throw new Error(`ada ${res.status}`);
    const j = (await res.json()) as Array<{ balance?: string; utxo_set?: unknown[] }>;
    const row = j[0];
    const lovelace = row?.balance ? BigInt(row.balance) : 0n;
    const balance = Number(lovelace) / 1e6;
    const price = await getPrice("ada");
    return {
      chain: "ada", address, balance,
      balanceFiat: price != null ? balance * price : null,
      txCount: row?.utxo_set?.length ?? 0,
      supported: true,
    };
  } catch (e) {
    return { chain: "ada", address, balance: 0, balanceFiat: null, txCount: 0, supported: true, error: (e as Error).message };
  }
}

async function adaHistory(address: string): Promise<TxRecord[]> {
  try {
    const res = await fetch("https://api.koios.rest/api/v1/address_txs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ _addresses: [address] }),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as Array<{ tx_hash: string; block_time?: number }>;
    return j.slice(0, 25).map(t => ({
      hash: t.tx_hash,
      direction: "in" as const,
      amount: 0,
      fee: null,
      timestamp: t.block_time ?? null,
      confirmed: true,
      url: `https://cardanoscan.io/transaction/${t.tx_hash}`,
    }));
  } catch { return []; }
}

// ---------- Solana via public RPC (with fallbacks) -------------------------

const SOL_RPCS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
  "https://solana.drpc.org",
];

async function solRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  for (const url of SOL_RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          "user-agent": "BlockchainMint/1.0",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { result?: T; error?: unknown };
      if (j.error) continue;
      return (j.result ?? null) as T | null;
    } catch { /* try next */ }
  }
  return null;
}

async function solSummary(address: string): Promise<AddressSummary> {
  try {
    const bal = await solRpc<{ value: number }>("getBalance", [address]);
    const balance = (bal?.value ?? 0) / 1e9;
    const sigs = await solRpc<Array<{ signature: string }>>(
      "getSignaturesForAddress",
      [address, { limit: 1 }],
    );
    const price = await getPrice("sol");
    return {
      chain: "sol", address, balance,
      balanceFiat: price != null ? balance * price : null,
      txCount: sigs?.length ? 1 : 0, // RPC doesn't expose total; placeholder
      supported: true,
    };
  } catch (e) {
    return { chain: "sol", address, balance: 0, balanceFiat: null, txCount: 0, supported: true, error: (e as Error).message };
  }
}

async function solHistory(address: string): Promise<TxRecord[]> {
  try {
    const sigs = await solRpc<Array<{ signature: string; blockTime?: number | null; err?: unknown }>>(
      "getSignaturesForAddress",
      [address, { limit: 25 }],
    );
    if (!sigs) return [];
    return sigs.map(s => ({
      hash: s.signature,
      direction: "in" as const,
      amount: 0,
      fee: null,
      timestamp: s.blockTime ?? null,
      confirmed: !s.err,
      url: `https://solscan.io/tx/${s.signature}`,
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
  if (chain === "ada") return adaSummary(address);
  if (chain === "sol") return solSummary(address);
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
  if (chain === "ada") return adaHistory(address);
  if (chain === "sol") return solHistory(address);
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

// ============================================================================
// SWEEP support: UTXOs, fee rate, broadcast
// ============================================================================

const SweepChainSchema = z.enum(["btc", "ltc", "doge", "txc", "bch"] as const);
type SweepChain = z.infer<typeof SweepChainSchema>;


export type SweepUtxo = { txid: string; vout: number; value: number };

async function esploraUtxos(base: string, address: string): Promise<SweepUtxo[]> {
  const res = await fetch(`${base}/api/address/${address}/utxo`);
  if (!res.ok) throw new Error(`UTXO fetch failed: ${res.status}`);
  const j = (await res.json()) as Array<{ txid: string; vout: number; value: number; status?: { confirmed?: boolean } }>;
  return j
    .filter(u => u.status?.confirmed !== false)
    .map(u => ({ txid: u.txid, vout: u.vout, value: u.value }));
}

async function blockchairUtxos(slug: string, address: string): Promise<SweepUtxo[]> {
  const res = await fetch(`https://api.blockchair.com/${slug}/dashboards/address/${address}?limit=1000`);
  if (!res.ok) throw new Error(`UTXO fetch failed: ${res.status}`);
  const j = (await res.json()) as {
    data?: Record<string, { utxo?: Array<{ transaction_hash: string; index: number; value: number; block_id?: number }> }>;
  };
  const row = j.data ? Object.values(j.data)[0] : undefined;
  const utxos = row?.utxo ?? [];
  // Block confirmed only (block_id > 0); blockchair uses -1 for mempool.
  return utxos
    .filter(u => (u.block_id ?? 0) > 0)
    .map(u => ({ txid: u.transaction_hash, vout: u.index, value: u.value }));
}

async function esploraFeeRate(base: string): Promise<number> {
  try {
    const res = await fetch(`${base}/api/v1/fees/recommended`);
    if (!res.ok) return 2;
    const j = (await res.json()) as { halfHourFee?: number; hourFee?: number; fastestFee?: number };
    return Math.max(1, Math.round(j.halfHourFee ?? j.hourFee ?? j.fastestFee ?? 2));
  } catch { return 2; }
}

export const getSweepUtxos = createServerFn({ method: "POST" })
  .inputValidator((input: { chain: SweepChain; address: string }) =>
    z.object({ chain: SweepChainSchema, address: z.string().min(8).max(120) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ utxos: SweepUtxo[]; feeRate: number }> => {
    const { chain, address } = data;
    if (chain === "btc") {
      const [utxos, feeRate] = await Promise.all([
        esploraUtxos("https://mempool.space", address),
        esploraFeeRate("https://mempool.space"),
      ]);
      return { utxos, feeRate };
    }
    if (chain === "txc") {
      const [utxos, feeRate] = await Promise.all([
        esploraUtxos("https://mempool.texitcoin.org", address),
        esploraFeeRate("https://mempool.texitcoin.org"),
      ]);
      return { utxos, feeRate };
    }
    if (chain === "ltc") {
      // litecoinspace.org is Esplora-compatible.
      const [utxos, feeRate] = await Promise.all([
        esploraUtxos("https://litecoinspace.org", address).catch(() => blockchairUtxos("litecoin", address)),
        esploraFeeRate("https://litecoinspace.org"),
      ]);
      return { utxos, feeRate };
    }
    if (chain === "doge") {
      // DOGE: blockchair only; relay min ~1000 sat/vB.
      const utxos = await blockchairUtxos("dogecoin", address);
      return { utxos, feeRate: 1000 };
    }
    // BCH: blockchair only. Network fee target ~1 sat/vB.
    const utxos = await blockchairUtxos("bitcoin-cash", address);
    return { utxos, feeRate: 1 };
  });


export const broadcastSweep = createServerFn({ method: "POST" })
  .inputValidator((input: { chain: SweepChain; rawHex: string }) =>
    z.object({
      chain: SweepChainSchema,
      rawHex: z.string().regex(/^[0-9a-fA-F]+$/).min(20).max(200_000),
    }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; txid: string } | { ok: false; error: string }> => {
    const { chain, rawHex } = data;
    try {
      if (chain === "btc" || chain === "txc" || chain === "ltc") {
        const base =
          chain === "btc" ? "https://mempool.space" :
          chain === "txc" ? "https://mempool.texitcoin.org" :
                            "https://litecoinspace.org";
        const res = await fetch(`${base}/api/tx`, {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: rawHex,
        });
        const text = await res.text();
        if (!res.ok) return { ok: false, error: text || `Broadcast failed (${res.status})` };
        return { ok: true, txid: text.trim() };
      }
      // DOGE / BCH via Blockchair push endpoint.
      const slug = chain === "doge" ? "dogecoin" : "bitcoin-cash";
      const res = await fetch(`https://api.blockchair.com/${slug}/push/transaction`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: rawHex }).toString(),
      });
      const j = (await res.json()) as { data?: { transaction_hash?: string }; context?: { error?: string } };
      if (!res.ok || j.context?.error) return { ok: false, error: j.context?.error ?? `Broadcast failed (${res.status})` };
      const txid = j.data?.transaction_hash;
      if (!txid) return { ok: false, error: "Broadcast accepted but no txid returned." };
      return { ok: true, txid };

    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

// ============================================================================
// ETH sweep support: nonce, balance, fees, ERC-20 metadata, broadcast
// ============================================================================

export type EthSweepToken = {
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  /** raw integer balance, decimal string */
  balanceRaw: string;
};

export type EthSweepContext = {
  chainId: number;
  nonce: number;
  /** wei, hex */
  balanceWei: string;
  /** wei per gas, hex */
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  tokens: EthSweepToken[];
};

async function alchemyRpc<T>(method: string, params: unknown[]): Promise<T> {
  const url = alchemyEthUrl();
  if (!url) throw new Error("ETH provider not configured (ALCHEMY_API missing).");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await res.json()) as { result?: T; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message ?? "RPC error");
  return j.result as T;
}

export const getEthSweepContext = createServerFn({ method: "POST" })
  .inputValidator((input: { address: string }) =>
    z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(input),
  )
  .handler(async ({ data }): Promise<EthSweepContext> => {
    const addr = data.address;
    const [balHex, nonceHex, feeHist, tokensRaw] = await Promise.all([
      alchemyRpc<string>("eth_getBalance", [addr, "latest"]),
      alchemyRpc<string>("eth_getTransactionCount", [addr, "pending"]),
      alchemyRpc<{ baseFeePerGas: string[]; reward?: string[][] }>(
        "eth_feeHistory", ["0x5", "latest", [50]],
      ),
      alchemyRpc<{ tokenBalances?: Array<{ contractAddress: string; tokenBalance: string }> }>(
        "alchemy_getTokenBalances", [addr, "erc20"],
      ),
    ]);

    // Fee: base fee (latest pending block) + priority tip from history p50.
    const baseFees = feeHist.baseFeePerGas ?? [];
    const nextBase = BigInt(baseFees[baseFees.length - 1] ?? "0x0");
    const tips = (feeHist.reward ?? []).map(r => BigInt(r[0] ?? "0x0")).filter(x => x > 0n);
    const tipMedian = tips.length
      ? tips.sort((a, b) => (a < b ? -1 : 1))[Math.floor(tips.length / 2)]
      : 1_000_000_000n; // 1 gwei fallback
    const maxPriorityFeePerGas = tipMedian;
    // headroom: 2x base + tip
    const maxFeePerGas = nextBase * 2n + maxPriorityFeePerGas;

    // Token metadata for non-zero balances
    const balances = (tokensRaw.tokenBalances ?? []).filter(
      b => b.tokenBalance && b.tokenBalance !== "0x" && BigInt(b.tokenBalance) > 0n,
    );
    const tokens: EthSweepToken[] = [];
    for (const b of balances) {
      try {
        const meta = await alchemyRpc<{ name?: string; symbol?: string; decimals?: number }>(
          "alchemy_getTokenMetadata", [b.contractAddress],
        );
        tokens.push({
          contractAddress: b.contractAddress,
          name: meta.name ?? "Unknown token",
          symbol: meta.symbol ?? "?",
          decimals: meta.decimals ?? 18,
          balanceRaw: BigInt(b.tokenBalance).toString(),
        });
      } catch { /* skip token if metadata fails */ }
    }

    return {
      chainId: 1,
      nonce: parseInt(nonceHex, 16),
      balanceWei: "0x" + BigInt(balHex).toString(16),
      maxFeePerGas: "0x" + maxFeePerGas.toString(16),
      maxPriorityFeePerGas: "0x" + maxPriorityFeePerGas.toString(16),
      tokens,
    };
  });

export const broadcastEthSweep = createServerFn({ method: "POST" })
  .inputValidator((input: { rawHex: string }) =>
    z.object({
      rawHex: z.string().regex(/^0x[0-9a-fA-F]+$/).min(20).max(200_000),
    }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; txid: string } | { ok: false; error: string }> => {
    try {
      const hash = await alchemyRpc<string>("eth_sendRawTransaction", [data.rawHex]);
      return { ok: true, txid: hash };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });


