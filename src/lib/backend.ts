/**
 * Backend selection.
 *
 * The app can talk to two backends:
 *   - "legacy": this app's own TanStack server functions, which proxy the old
 *     api.blockchainmint.com registry plus direct chain indexers.
 *   - "admin":  the new Cold Storage Coins Admin backend (`app-v1` API).
 *
 * The choice lives in localStorage so testers can flip it in Settings without
 * a rebuild. Nothing here is a secret — the admin API's public endpoints need
 * no key.
 */

import { useCallback, useEffect, useState } from "react";

export type BackendId = "legacy" | "admin";

export const BACKENDS: Record<BackendId, { id: BackendId; label: string; description: string; baseUrl: string | null }> = {
  admin: {
    id: "admin",
    label: "Admin API (default)",
    description: "Cold Storage Coins Admin backend — app-v1 endpoints.",
    baseUrl: "https://admin.coldstoragecoins.com",
  },
  legacy: {
    id: "legacy",
    label: "Legacy (retired)",
    description: "Old Blockchain Mint registry path — kept for fallback testing only.",
    baseUrl: null,
  },
};

const KEY = "csc.backend.v1";
const URL_KEY = "csc.backend.adminUrl.v1";
const EVENT = "csc:backend-changed";

export const DEFAULT_ADMIN_URL = BACKENDS.admin.baseUrl!;

export function getBackend(): BackendId {
  if (typeof window === "undefined") return "admin";
  const v = localStorage.getItem(KEY);
  return v === "legacy" ? "legacy" : "admin";
}

export function getAdminBaseUrl(): string {
  if (typeof window === "undefined") return DEFAULT_ADMIN_URL;
  const v = localStorage.getItem(URL_KEY)?.trim();
  return v ? v.replace(/\/+$/, "") : DEFAULT_ADMIN_URL;
}

export function setBackend(id: BackendId) {
  localStorage.setItem(KEY, id);
  window.dispatchEvent(new Event(EVENT));
}

export function setAdminBaseUrl(url: string) {
  const clean = url.trim().replace(/\/+$/, "");
  if (clean) localStorage.setItem(URL_KEY, clean);
  else localStorage.removeItem(URL_KEY);
  window.dispatchEvent(new Event(EVENT));
}

/** Reactive access to the current backend selection. */
export function useBackend() {
  const [backend, setBackendState] = useState<BackendId>("admin");
  const [adminUrl, setAdminUrlState] = useState<string>(DEFAULT_ADMIN_URL);

  useEffect(() => {
    const sync = () => {
      setBackendState(getBackend());
      setAdminUrlState(getAdminBaseUrl());
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const select = useCallback((id: BackendId) => setBackend(id), []);
  const setUrl = useCallback((url: string) => setAdminBaseUrl(url), []);

  return { backend, adminUrl, select, setUrl, isAdmin: backend === "admin" };
}
