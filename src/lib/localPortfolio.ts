/**
 * Local-first coin list. Lives in localStorage so the app works without auth.
 * Signing in lets us sync this list to the cloud as a backup; that wiring
 * lands when the user opts in via /settings.
 */
import { useEffect, useState, useCallback } from "react";
import type { ChainId } from "./chains";

export type LocalCoin = {
  id: string;
  chain: ChainId;
  address: string;
  label?: string;
  addedAt: number;
};

const KEY = "csc.portfolio.v1";

function read(): LocalCoin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as LocalCoin[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(coins: LocalCoin[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(coins));
  window.dispatchEvent(new CustomEvent("csc:portfolio-change"));
}

export function addLocalCoin(input: { chain: ChainId; address: string; label?: string }): LocalCoin {
  const coins = read();
  const existing = coins.find(c => c.chain === input.chain && c.address.toLowerCase() === input.address.toLowerCase());
  if (existing) return existing;
  const coin: LocalCoin = {
    id: crypto.randomUUID(),
    chain: input.chain,
    address: input.address,
    label: input.label,
    addedAt: Date.now(),
  };
  write([coin, ...coins]);
  return coin;
}

export function removeLocalCoin(id: string): void {
  write(read().filter(c => c.id !== id));
}

export function getLocalCoin(id: string): LocalCoin | undefined {
  return read().find(c => c.id === id);
}

export function useLocalPortfolio() {
  const [coins, setCoins] = useState<LocalCoin[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => setCoins(read()), []);

  useEffect(() => {
    refresh();
    setReady(true);
    const onChange = () => refresh();
    window.addEventListener("csc:portfolio-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("csc:portfolio-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  return { coins, ready, refresh };
}
