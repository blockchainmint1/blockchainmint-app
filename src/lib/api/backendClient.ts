/**
 * Backend-aware data client.
 *
 * Each hook returns a function with the SAME signature and result shape as the
 * matching `useServerFn(...)` call it replaces, so screens don't care which
 * backend is live. When "admin" is selected the call goes to the Cold Storage
 * Coins Admin `app-v1` REST API instead of this app's server functions.
 *
 * Admin API reference: {base}/api/public/app/v1
 *   POST /address/balance   { chain, address }
 *   POST /address/history   { chain, address }
 *   POST /coins/verify      { key, includeBalance? }
 *   POST /coins/activate    { key }
 *   GET  /health
 */

import { useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  lookupAddress,
  getTxHistory,
  verifyMintRecord,
  lookupAssetId,
  activateMintCoin,
  type AddressSummary,
  type TxRecord,
} from "@/lib/chains.functions";
import { CHAINS, type ChainId } from "@/lib/chains";
import { useBackend, getAdminBaseUrl } from "@/lib/backend";

const APP_VERSION = "5.0.3";

async function adminPost<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}/api/public/app/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-version": APP_VERSION },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!json) throw new Error(`Backend error ${res.status}`);
  return json as T;
}

export async function adminHealth(base = getAdminBaseUrl()) {
  const started = Date.now();
  const res = await fetch(`${base}/api/public/app/v1/health`, {
    headers: { "x-app-version": APP_VERSION },
  });
  const json = (await res.json().catch(() => null)) as any;
  return {
    ok: res.ok && !!json?.ok,
    status: res.status,
    ms: Date.now() - started,
    apiVersion: json?.apiVersion ?? null,
    service: json?.service ?? null,
  };
}

// ---------------------------------------------------------------- balances

export function useLookupAddress() {
  const { isAdmin, adminUrl } = useBackend();
  const legacy = useServerFn(lookupAddress);

  return useCallback(
    async ({ data }: { data: { chain: ChainId; address: string } }): Promise<AddressSummary> => {
      if (!isAdmin) return legacy({ data });
      const r = await adminPost<any>(adminUrl, "/address/balance", data);
      return {
        chain: data.chain,
        address: data.address,
        balance: Number(r.balance ?? 0),
        balanceFiat: r.balanceFiat ?? null,
        txCount: Number(r.txCount ?? 0),
        supported: r.supported ?? !!r.ok,
        tokens: r.tokens ?? undefined,
        error: r.ok ? r.error ?? undefined : r.message ?? r.error ?? "Backend error",
      };
    },
    [isAdmin, adminUrl, legacy],
  );
}

export function useTxHistory() {
  const { isAdmin, adminUrl } = useBackend();
  const legacy = useServerFn(getTxHistory);

  return useCallback(
    async ({ data }: { data: { chain: ChainId; address: string } }): Promise<TxRecord[]> => {
      if (!isAdmin) return legacy({ data });
      const r = await adminPost<any>(adminUrl, "/address/history", data);
      return Array.isArray(r?.transactions) ? (r.transactions as TxRecord[]) : [];
    },
    [isAdmin, adminUrl, legacy],
  );
}

// ---------------------------------------------------------------- registry

type VerifyResult = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof verifyMintRecord>>>>;

export function useVerifyMintRecord() {
  const { isAdmin, adminUrl } = useBackend();
  const legacy = useServerFn(verifyMintRecord);

  return useCallback(
    async ({ data }: { data: { chain: ChainId; address: string } }): Promise<VerifyResult> => {
      if (!isAdmin) return legacy({ data });
      try {
        const r = await adminPost<any>(adminUrl, "/coins/verify", {
          key: data.address,
          includeBalance: false,
        });
        if (r?.authentic && r?.coin) {
          return {
            authentic: true,
            source: "registry",
            assetId: r.coin.assetId ?? null,
            registry: r.coin,
            displayValues: r.displayValues ?? [],
          } as VerifyResult;
        }
        return { authentic: false } as VerifyResult;
      } catch (e) {
        return { authentic: false, unavailable: true, error: (e as Error).message } as VerifyResult;
      }
    },
    [isAdmin, adminUrl, legacy],
  );
}

type AssetIdResult = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof lookupAssetId>>>>;

export function useLookupAssetId() {
  const { isAdmin, adminUrl } = useBackend();
  const legacy = useServerFn(lookupAssetId);

  return useCallback(
    async ({ data }: { data: { assetId: string } }): Promise<AssetIdResult> => {
      if (!isAdmin) return legacy({ data });
      const assetId = data.assetId.trim();
      if (!/^[0-9A-Za-z]{6}$/.test(assetId)) {
        return { found: false, reason: "invalid" } as AssetIdResult;
      }
      try {
        const r = await adminPost<any>(adminUrl, "/coins/verify", { key: assetId, includeBalance: false });
        if (!r?.authentic || !r?.coin) {
          return { found: false, reason: "unknown", assetId } as AssetIdResult;
        }
        const code = String(r.coin.blockchainCode || r.coin.cryptoCurrency || "").toLowerCase();
        const chain = (code in CHAINS ? code : "btc") as ChainId;
        return {
          found: true,
          assetId: r.coin.assetId ?? assetId,
          chain,
          address: r.coin.publicKey,
          authentic: true,
          registry: r.coin,
        } as AssetIdResult;
      } catch (e) {
        return { found: false, reason: "unavailable", assetId, error: (e as Error).message } as AssetIdResult;
      }
    },
    [isAdmin, adminUrl, legacy],
  );
}

export function useActivateCoin() {
  const { isAdmin, adminUrl } = useBackend();
  const legacy = useServerFn(activateMintCoin);

  return useCallback(
    async ({ data }: { data: { address: string } }): Promise<{ ok: boolean; message: string }> => {
      if (!isAdmin) return legacy({ data });
      const r = await adminPost<any>(adminUrl, "/coins/activate", { key: data.address });
      return { ok: !!r?.ok, message: r?.message ?? "" };
    },
    [isAdmin, adminUrl, legacy],
  );
}
