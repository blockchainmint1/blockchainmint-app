/**
 * Debounced background sync of the local portfolio + alert rules to the backend.
 * Runs whenever either changes; safe to call many times — server fn is idempotent.
 */
import { useEffect } from "react";
import { getDeviceId } from "./deviceId";
import { getAllAlertRules } from "./alertRules";
import { syncDeviceWatched } from "./devices.functions";
import type { LocalCoin } from "./localPortfolio";

let timer: number | null = null;

function readPortfolio(): LocalCoin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("csc.portfolio.v1");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function schedule(): void {
  if (typeof window === "undefined") return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => { void run(); }, 1500);
}

async function run(): Promise<void> {
  const device_id = getDeviceId();
  if (!device_id) return;
  const coins = readPortfolio();
  const rules = getAllAlertRules();
  const addresses = coins.map(c => {
    const r = rules[`${c.chain}|${c.address.toLowerCase()}`];
    return {
      chain: c.chain,
      address: c.address,
      nickname: c.label ?? null,
      incoming_enabled: r?.incoming ?? true,
      balance_above: r?.balance_above ?? null,
      balance_below: r?.balance_below ?? null,
      price_above: r?.price_above ?? null,
      price_below: r?.price_below ?? null,
    };
  });
  try {
    await syncDeviceWatched({ data: { device_id, addresses } });
  } catch (e) {
    console.warn("[alertsSync] failed", e);
  }
}

/** Wire change listeners once at app boot. */
export function useAlertsAutoSync(): void {
  useEffect(() => {
    const onChange = () => schedule();
    window.addEventListener("csc:portfolio-change", onChange);
    window.addEventListener("csc:alerts-change", onChange);
    // initial sync
    schedule();
    return () => {
      window.removeEventListener("csc:portfolio-change", onChange);
      window.removeEventListener("csc:alerts-change", onChange);
    };
  }, []);
}
