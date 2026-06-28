/**
 * Per-coin alert rules, stored locally and synced to the backend.
 * Keyed by `${chain}|${address}` so a coin keeps its config across rename/delete.
 */
import { useCallback, useEffect, useState } from "react";
import type { ChainId } from "./chains";

export type AlertRule = {
  incoming: boolean;
  balance_above: number | null;
  balance_below: number | null;
  price_above: number | null;
  price_below: number | null;
};

const KEY = "csc.alert_rules.v1";
const DEFAULT: AlertRule = {
  incoming: true,
  balance_above: null,
  balance_below: null,
  price_above: null,
  price_below: null,
};

function keyFor(chain: ChainId, address: string): string {
  return `${chain}|${address.toLowerCase()}`;
}

function readAll(): Record<string, AlertRule> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, AlertRule>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("csc:alerts-change"));
}

export function getAlertRule(chain: ChainId, address: string): AlertRule {
  return readAll()[keyFor(chain, address)] ?? { ...DEFAULT };
}

export function setAlertRule(chain: ChainId, address: string, rule: AlertRule): void {
  const all = readAll();
  all[keyFor(chain, address)] = rule;
  writeAll(all);
}

export function getAllAlertRules(): Record<string, AlertRule> {
  return readAll();
}

export function useAlertRule(chain: ChainId | undefined, address: string | undefined) {
  const [rule, setRule] = useState<AlertRule>(DEFAULT);

  useEffect(() => {
    if (!chain || !address) return;
    setRule(getAlertRule(chain, address));
    const onChange = () => setRule(getAlertRule(chain, address));
    window.addEventListener("csc:alerts-change", onChange);
    return () => window.removeEventListener("csc:alerts-change", onChange);
  }, [chain, address]);

  const update = useCallback((patch: Partial<AlertRule>) => {
    if (!chain || !address) return;
    const next = { ...getAlertRule(chain, address), ...patch };
    setAlertRule(chain, address, next);
  }, [chain, address]);

  return { rule, update };
}
