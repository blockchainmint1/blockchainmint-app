/**
 * Local cache for chain data per coin address. Stored on device so history and
 * balances appear instantly on cold open, then refresh in the background.
 * The cache is keyed by chain + address and is never synced to the server —
 * it stays on this device only.
 */

import type { ChainId } from "./chains";
import type { AddressSummary, TxRecord } from "./chains.functions";

const KEY = "csc.history.v1";

export type CachedHistory = {
  summary: AddressSummary;
  txs: TxRecord[];
  fetchedAt: number;
};

export type CoinHistoryStore = Partial<Record<ChainId, Record<string, CachedHistory>>>;

function read(): CoinHistoryStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CoinHistoryStore;
  } catch {
    return {};
  }
}

function write(store: CoinHistoryStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent("csc:history-change"));
}

export function cacheCoinHistory(
  chain: ChainId,
  address: string,
  patch: Partial<CachedHistory>,
): CachedHistory {
  const store = read();
  const bucket = store[chain] ?? {};
  const existing = bucket[address];
  const next: CachedHistory = {
    summary: existing?.summary ?? {
      chain,
      address,
      balance: 0,
      balanceFiat: null,
      txCount: 0,
      supported: true,
    },
    txs: existing?.txs ?? [],
    fetchedAt: existing?.fetchedAt ?? 0,
    ...patch,
    fetchedAt: Date.now(),
  };
  store[chain] = { ...bucket, [address]: next };
  write(store);
  return next;
}

export function getCachedHistory(chain: ChainId, address: string): CachedHistory | undefined {
  return read()[chain]?.[address];
}

export function clearCachedHistory(chain: ChainId, address: string): void {
  const store = read();
  if (store[chain]) {
    delete store[chain]![address];
    write(store);
  }
}

export function useHistoryCache() {
  return { cache: cacheCoinHistory, read: getCachedHistory, clear: clearCachedHistory };
}
