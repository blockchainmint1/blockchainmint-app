/**
 * Blockchain Mint registry client.
 *
 * Reverse-engineered from the legacy React Native app (`src/redux/wallets/saga.ts`,
 * `src/components/ModalActivateCoin.tsx`). Base URL comes from the legacy
 * `CONFIG.SERVER_URL`.
 *
 *   POST {base}/v5/coin-details          { publicKey, cryptoBalance }  -> coin record | 404
 *   POST {base}/v5/coins?fiat-currency=X [ { publicKey, cryptoBalance } ] -> list + totals
 *   POST {base}/v5/coins/activate        { publicKey }                -> { message }
 *   GET  {base}/v5/coin-tokens?public_key=X
 *   GET  {base}/v5/coin-tokens/nft?public_key=X
 *
 * A 404 with type `ObjectNotFoundException` means the address is NOT in the
 * mint registry — i.e. not a coin we manufactured.
 */

const DEFAULT_BASE = "https://api.blockchainmint.com/api";
const TIMEOUT_MS = 12_000;

function baseUrl() {
  return (process.env.BM_REGISTRY_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

export type RegistryCoin = {
  assetId: string | null;
  publicKey: string;
  blockchainCode: string | null;
  blockchainName: string | null;
  cryptoCurrency: string | null;
  cryptoBalance: number | null;
  activationStatus: boolean | null;
  hasTokens: boolean;
  logoUrl: string | null;
  stickerImgUrl: string | null;
  publicKeyUrl: string | null;
};

export type RegistryLookup =
  | { found: true; coin: RegistryCoin; displayValues: { fieldTitle: string; fieldValue: string; link?: string }[] }
  | { found: false; reason: "not_found" }
  | { found: false; reason: "unavailable"; error: string };

async function post(path: string, body: unknown, signal: AbortSignal) {
  return fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

/** Look up a manufactured coin by its public key (the address on the sticker). */
export async function lookupCoinDetails(publicKey: string): Promise<RegistryLookup> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await post("/v5/coin-details", { publicKey, cryptoBalance: "" }, ac.signal);
    const json = (await res.json().catch(() => null)) as any;

    if (res.status === 404) return { found: false, reason: "not_found" };
    if (!res.ok) {
      return { found: false, reason: "unavailable", error: json?.message || `Registry error ${res.status}` };
    }
    const c = json?.coin;
    if (!c?.publicKey) return { found: false, reason: "not_found" };

    return {
      found: true,
      coin: {
        assetId: c.assetId ?? null,
        publicKey: c.publicKey,
        blockchainCode: c.blockchainCode ?? null,
        blockchainName: c.blockchainName ?? null,
        cryptoCurrency: c.cryptoCurrency ?? null,
        cryptoBalance: c.cryptoBalance ?? null,
        activationStatus: typeof c.activationStatus === "boolean" ? c.activationStatus : null,
        hasTokens: !!c.hasTokens,
        logoUrl: c.logoUrl ?? c.logo ?? null,
        stickerImgUrl: c.stickerImgUrl ?? null,
        publicKeyUrl: c.publicKeyUrl ?? null,
      },
      displayValues: Array.isArray(json?.displayValues)
        ? json.displayValues
            .filter((d: any) => d?.fieldTitle && d?.fieldValue)
            .map((d: any) => ({ fieldTitle: String(d.fieldTitle), fieldValue: String(d.fieldValue), link: d.link || undefined }))
        : [],
    };
  } catch (e) {
    return { found: false, reason: "unavailable", error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

/** Mark a coin as activated in the registry. */
export async function activateCoin(publicKey: string): Promise<{ ok: boolean; message: string }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await post("/v5/coins/activate", { publicKey }, ac.signal);
    const json = (await res.json().catch(() => null)) as any;
    const message = json?.message ?? (res.ok ? "Activation success" : `Registry error ${res.status}`);
    return { ok: res.ok && message === "Activation success", message };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}
