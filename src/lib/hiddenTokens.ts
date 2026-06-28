import { useEffect, useState, useCallback } from "react";

const KEY = "csc.hiddenTokens.v1";
const EVT = "csc:hidden-tokens-change";

function tokenKey(chain: string, tokenId: string) {
  return `${chain}:${tokenId}`;
}

function read(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function write(set: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify([...set]));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function hideToken(chain: string, tokenId: string) {
  const s = read();
  s.add(tokenKey(chain, tokenId));
  write(s);
}

export function unhideToken(chain: string, tokenId: string) {
  const s = read();
  s.delete(tokenKey(chain, tokenId));
  write(s);
}

export function useHiddenTokens(chain: string) {
  const [set, setSet] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => setSet(read()), []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  return {
    isHidden: (tokenId: string) => set.has(tokenKey(chain, tokenId)),
    hide: (tokenId: string) => hideToken(chain, tokenId),
    unhide: (tokenId: string) => unhideToken(chain, tokenId),
  };
}
