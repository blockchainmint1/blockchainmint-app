/**
 * Cloud backup of the user's coin list (`/my-coins`, magic-link session only).
 *
 * POST is an idempotent bulk append, so syncing on every launch is safe: we
 * push whatever is local, then pull the union back down and merge into
 * localStorage. Nothing here needs a secret — the bearer token is the user's
 * own Supabase session.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useBackend } from "@/lib/backend";
import { myCoinsList, myCoinsAppend } from "@/lib/api/adminApi";
import { addLocalCoin, useLocalPortfolio } from "@/lib/localPortfolio";
import { CHAINS, type ChainId } from "@/lib/chains";

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function useCloudBackup() {
  const { user } = useAuth();
  const { isAdmin, adminUrl } = useBackend();
  const { coins } = useLocalPortfolio();
  const [state, setState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const available = isAdmin && !!user;

  const sync = useCallback(async () => {
    const token = await accessToken();
    if (!token) {
      setState("error");
      setMessage("Sign in to back up your coins.");
      return;
    }
    setState("syncing");
    setMessage(null);
    try {
      await myCoinsAppend(
        token,
        coins.map(c => ({ address: c.address, chain: c.chain, label: c.label ?? null })),
        adminUrl,
      );
      const remote = await myCoinsList(token, adminUrl);
      let pulled = 0;
      for (const r of remote) {
        const code = String(r.chain ?? "").toLowerCase();
        if (!(code in CHAINS)) continue;
        const before = coins.some(
          c => c.chain === code && c.address.toLowerCase() === r.address.toLowerCase(),
        );
        if (!before) {
          addLocalCoin({ chain: code as ChainId, address: r.address, label: r.label ?? undefined });
          pulled++;
        }
      }
      setState("done");
      setMessage(
        `Saved ${coins.length} ${coins.length === 1 ? "coin" : "coins"}` +
          (pulled ? ` · restored ${pulled} from cloud` : ""),
      );
    } catch (e) {
      setState("error");
      setMessage((e as Error).message);
    }
  }, [coins, adminUrl]);

  // Idempotent append means a launch-time sync is safe.
  useEffect(() => {
    if (available) void sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  return { available, state, message, sync };
}
