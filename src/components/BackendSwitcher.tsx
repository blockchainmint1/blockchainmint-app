import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Server, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { BACKENDS, DEFAULT_ADMIN_URL, useBackend, type BackendId } from "@/lib/backend";
import { adminHealth } from "@/lib/api/backendClient";

/** Developer/tester switch between the legacy backend and the new Admin API. */
export function BackendSwitcher() {
  const { backend, adminUrl, select, setUrl } = useBackend();
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const url = draftUrl ?? adminUrl;

  const ping = useMutation({
    mutationFn: () => adminHealth(url.replace(/\/+$/, "")),
  });

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Server className="size-4 text-primary" />
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Backend</p>
      </div>

      <div className="mt-3 space-y-2">
        {(Object.keys(BACKENDS) as BackendId[]).map((id) => {
          const b = BACKENDS[id];
          const active = backend === id;
          return (
            <button
              key={id}
              onClick={() => select(id)}
              className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              <span
                className={`mt-1 size-3 shrink-0 rounded-full border ${
                  active ? "border-primary bg-primary" : "border-muted-foreground/50"
                }`}
              />
              <span className="min-w-0">
                <span className="block text-sm text-foreground">{b.label}</span>
                <span className="block text-[11px] text-muted-foreground">{b.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {backend === "admin" && (
        <div className="mt-4 space-y-2">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Admin API base URL
          </label>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setDraftUrl(e.target.value)}
              onBlur={() => {
                if (draftUrl !== null) setUrl(draftUrl);
                setDraftUrl(null);
              }}
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] text-foreground"
              placeholder={DEFAULT_ADMIN_URL}
            />
            <button
              onClick={() => {
                if (draftUrl !== null) {
                  setUrl(draftUrl);
                  setDraftUrl(null);
                }
                ping.mutate();
              }}
              className="shrink-0 rounded-md bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80"
            >
              {ping.isPending ? <Loader2 className="size-4 animate-spin" /> : "Test"}
            </button>
          </div>

          {ping.data && (
            <p className="flex items-center gap-2 text-[11px]">
              {ping.data.ok ? (
                <>
                  <CheckCircle2 className="size-4 text-green-500" />
                  <span className="text-muted-foreground">
                    {ping.data.service ?? "reachable"} · {ping.data.apiVersion ?? "?"} · {ping.data.ms}ms
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="size-4 text-destructive" />
                  <span className="text-muted-foreground">HTTP {ping.data.status} — not healthy</span>
                </>
              )}
            </p>
          )}
          {ping.isError && (
            <p className="flex items-center gap-2 text-[11px] text-destructive">
              <XCircle className="size-4" /> {(ping.error as Error).message}
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Affects balances, transaction history, coin verification and Coin ID lookups. Sweeping always
        signs locally and broadcasts through the legacy path.
      </p>
    </section>
  );
}
