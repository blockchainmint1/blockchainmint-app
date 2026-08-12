/**
 * Cross-domain coin-list handoff.
 *
 * The coin list lives in localStorage, which is per-origin, so anyone who
 * built their list on an older domain (app.blockchainmint.com,
 * coldstoragecoins-app.lovable.app) sees an empty list on app.coldstoragecoins.com.
 *
 * Recovery is a top-level redirect round trip (an iframe would be blocked by
 * Safari's storage partitioning):
 *   new domain /recover  ->  old domain /handoff?to=<newOrigin>
 *   old domain reads localStorage, redirects back to <newOrigin>/recover#d=<payload>
 *
 * Only the coin list travels. No keys, no seeds — the app never stores those.
 */

export const HANDOFF_ORIGINS = [
  "https://app.coldstoragecoins.com",
  "https://app.blockchainmint.com",
  "https://coldstoragecoins-app.lovable.app",
] as const;

export type HandoffCoin = {
  chain: string;
  address: string;
  label?: string;
  addedAt?: number;
};

export type HandoffPayload = {
  v: 1;
  from: string;
  coins: HandoffCoin[];
};

/** Same app, different hostname — plus local dev and Lovable previews. */
export function isAllowedOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if ((HANDOFF_ORIGINS as readonly string[]).includes(u.origin)) return true;
    if (u.protocol === "https:" && u.hostname.endsWith(".lovable.app")) return true;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}

export function encodePayload(payload: HandoffPayload): string {
  return btoa(encodeURIComponent(JSON.stringify(payload)));
}

export function decodePayload(raw: string): HandoffPayload | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(atob(raw))) as HandoffPayload;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.coins)) return null;
    return parsed;
  } catch {
    return null;
  }
}
