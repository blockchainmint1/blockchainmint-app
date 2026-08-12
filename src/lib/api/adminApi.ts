/**
 * Cold Storage Coins Admin — `app-v1` REST client.
 *
 * Base: {adminUrl}/api/public/app/v1 — CORS open, JSON, no API key, and
 * nothing secret ever ships in the app. Every request carries `x-app-version`.
 *
 * Public:   GET /config, GET /health,
 *           POST /coins/verify, /coins/lookup, /coins/activate,
 *           POST /address/balance, /address/history
 * Authed:   GET|POST|DELETE /my-coins with `Authorization: Bearer <token>`
 *           (Supabase magic-link session, using the URL + publishable key
 *           returned by /config).
 */

import { getAdminBaseUrl } from "@/lib/backend";

export const APP_VERSION = "5.0.3";

function headers(token?: string | null): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-app-version": APP_VERSION,
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function url(path: string, base = getAdminBaseUrl()) {
  return `${base.replace(/\/+$/, "")}/api/public/app/v1${path}`;
}

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as any;
  if (json == null) throw new Error(`Backend error ${res.status}`);
  return json as T;
}

export async function apiGet<T>(path: string, opts: { base?: string; token?: string | null } = {}) {
  return parse<T>(await fetch(url(path, opts.base), { headers: headers(opts.token) }));
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  opts: { base?: string; token?: string | null } = {},
) {
  return parse<T>(
    await fetch(url(path, opts.base), {
      method: "POST",
      headers: headers(opts.token),
      body: JSON.stringify(body),
    }),
  );
}

export async function apiDelete<T>(
  path: string,
  body: unknown,
  opts: { base?: string; token?: string | null } = {},
) {
  return parse<T>(
    await fetch(url(path, opts.base), {
      method: "DELETE",
      headers: headers(opts.token),
      body: JSON.stringify(body),
    }),
  );
}

// ------------------------------------------------------------------ types

export type AdminChain = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl: string | null;
  explorerAddressUrl: string | null;
  priceUsd: number | null;
  active: boolean;
};

export type AdminConfig = {
  ok: boolean;
  apiVersion: string;
  baseUrl: string;
  auth: { provider: string; method: string; url: string | null; publishableKey: string | null };
  chains: AdminChain[];
};

export type AdminCoin = {
  assetId: string | null;
  publicKey: string;
  blockchainCode: string | null;
  blockchainName: string | null;
  cryptoCurrency: string | null;
  activationStatus: boolean | null;
  hasTokens: boolean;
  logoUrl: string | null;
  stickerImgUrl: string | null;
  publicKeyUrl: string | null;
};

export type AdminMyCoin = {
  id: string;
  chain: string | null;
  address: string;
  assetId: string | null;
  label: string | null;
  position: number | null;
  createdAt: string | null;
};

// ---------------------------------------------------------------- public

/** Launch call: chain catalog + the Supabase values the app signs in with. */
export function adminConfig(base?: string) {
  return apiGet<AdminConfig>("/config", { base });
}

export async function adminHealth(base = getAdminBaseUrl()) {
  const started = Date.now();
  const res = await fetch(url("/health", base), { headers: headers() });
  const json = (await res.json().catch(() => null)) as any;
  return {
    ok: res.ok && !!json?.ok,
    status: res.status,
    ms: Date.now() - started,
    apiVersion: json?.apiVersion ?? null,
    service: json?.service ?? null,
  };
}

/** Batch list refresh — one call per refresh, max 500 keys. */
export async function adminLookupCoins(keys: string[], base?: string) {
  const out: AdminCoin[] = [];
  for (let i = 0; i < keys.length; i += 500) {
    const r = await apiPost<{ ok: boolean; coins?: AdminCoin[] }>(
      "/coins/lookup",
      { keys: keys.slice(i, i + 500) },
      { base },
    );
    if (Array.isArray(r.coins)) out.push(...r.coins);
  }
  return out;
}

// ------------------------------------------------------------- my-coins

export async function myCoinsList(token: string, base?: string) {
  const r = await apiGet<{ ok: boolean; coins?: AdminMyCoin[] }>("/my-coins", { base, token });
  return r.coins ?? [];
}

/** Idempotent bulk append — safe to call on every launch. */
export async function myCoinsAppend(
  token: string,
  coins: Array<{ address: string; chain?: string | null; label?: string | null; assetId?: string | null }>,
  base?: string,
) {
  if (!coins.length) return { ok: true, added: 0 };
  return apiPost<{ ok: boolean; added: number }>("/my-coins", { coins }, { base, token });
}

export function myCoinsDelete(token: string, id: string, base?: string) {
  return apiDelete<{ ok: boolean }>("/my-coins", { id }, { base, token });
}
