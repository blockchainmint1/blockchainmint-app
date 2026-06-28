/**
 * Legacy Blockchain Mint (Expo/React Native v4) data importer.
 *
 * The old app stored everything in AsyncStorage under five keys:
 *   - wallets:           [{ assetId, publicKey, privateKey?, name?, balance, balanceUpdatedAt }]
 *   - names:             [{ publicKey, name }]
 *   - balances:          [{ publicKey, balance, fiatBalance, updatedAt }]
 *   - seenTransactions:  [{ publicKey, txid, seenAt }]   // we ignore — new app diffs server-side
 *   - notifications:     [...]                            // we ignore — new app has its own
 *
 * On native, the Capacitor wrapper exposes a custom plugin `LegacyDataBridge`
 * with one method, `read()`, that returns the raw JSON blob (or `null` when no
 * legacy install is present). On web we don't have AsyncStorage access, so the
 * /import screen accepts a pasted JSON blob from a manual export — useful for
 * testing the merge logic and for power users who want to migrate by hand.
 */

import type { ChainId } from "./chains";
import { parseCoinPayload } from "./parseCoinPayload";
import { addLocalCoin, renameLocalCoin } from "./localPortfolio";

/** Raw shape we accept from the bridge or paste. Each field is optional. */
export type LegacyBlob = {
  wallets?: Array<{
    assetId?: string;
    publicKey?: string;
    privateKey?: string | null;
    name?: string | null;
    balance?: number | string | null;
    balanceUpdatedAt?: string | number | null;
  }>;
  names?: Array<{ publicKey?: string; name?: string }>;
  balances?: Array<{ publicKey?: string; balance?: number | string }>;
  // anything else is ignored
};

export type LegacyImportPreview = {
  total: number;
  importable: Array<{ chain: ChainId; address: string; label?: string }>;
  unrecognized: Array<{ publicKey: string; reason: string }>;
};

const FLAG_DECLINED = "csc.legacy.declined.v1";
const FLAG_DONE = "csc.legacy.imported.v1";

/** Has the user already decided about the legacy prompt? */
export function legacyPromptDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return !!localStorage.getItem(FLAG_DECLINED) || !!localStorage.getItem(FLAG_DONE);
}

export function markLegacyDeclined(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FLAG_DECLINED, String(Date.now()));
}

export function markLegacyImported(count: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FLAG_DONE, JSON.stringify({ at: Date.now(), count }));
}

/** Try to read the legacy blob via the native Capacitor bridge. Web → null. */
export async function readLegacyBlobNative(): Promise<LegacyBlob | null> {
  if (typeof window === "undefined") return null;
  try {
    const capImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
    const core = (await capImport("@capacitor/core")) as {
      Capacitor: { isNativePlatform: () => boolean };
      registerPlugin: <T>(name: string) => T;
    };
    if (!core?.Capacitor?.isNativePlatform?.()) return null;
    type Bridge = { read: () => Promise<{ data: string | null }> };
    const Bridge = core.registerPlugin<Bridge>("LegacyDataBridge");
    const res = await Bridge.read();
    if (!res?.data) return null;
    return JSON.parse(res.data) as LegacyBlob;
  } catch {
    return null;
  }
}

/** Inspect a blob without writing anything. */
export function previewLegacyBlob(blob: LegacyBlob): LegacyImportPreview {
  const nameMap = new Map<string, string>();
  for (const n of blob.names ?? []) {
    if (n.publicKey && n.name) nameMap.set(n.publicKey.toLowerCase(), n.name);
  }

  const importable: LegacyImportPreview["importable"] = [];
  const unrecognized: LegacyImportPreview["unrecognized"] = [];
  const seen = new Set<string>();

  for (const w of blob.wallets ?? []) {
    const pk = (w.publicKey ?? "").trim();
    if (!pk) continue;
    const parsed = parseCoinPayload(pk);
    if (!parsed) {
      unrecognized.push({ publicKey: pk, reason: "Unrecognized address format" });
      continue;
    }
    const dedupKey = `${parsed.chain}|${parsed.address.toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const label = (w.name ?? nameMap.get(pk.toLowerCase()) ?? "").trim() || undefined;
    importable.push({ chain: parsed.chain, address: parsed.address, label });
  }

  return { total: (blob.wallets ?? []).length, importable, unrecognized };
}

/** Apply a preview to the local portfolio. Idempotent: duplicates are skipped by addLocalCoin. */
export function applyLegacyImport(preview: LegacyImportPreview): number {
  let added = 0;
  for (const item of preview.importable) {
    const coin = addLocalCoin({ chain: item.chain, address: item.address, label: item.label });
    if (item.label && !coin.label) renameLocalCoin(coin.id, item.label);
    added += 1;
  }
  markLegacyImported(added);
  return added;
}
