import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeftRight, CheckCircle2, Loader2 } from "lucide-react";
import { decodePayload, HANDOFF_ORIGINS } from "@/lib/handoff";
import { addLocalCoin, useLocalPortfolio } from "@/lib/localPortfolio";
import { CHAINS, type ChainId } from "@/lib/chains";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/recover")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Recover your coin list — Blockchain Mint" },
      {
        name: "description",
        content:
          "Moved to a new web address? Pull your saved coin list over from the Blockchain Mint domain you used before.",
      },
      { property: "og:title", content: "Recover your coin list — Blockchain Mint" },
      {
        property: "og:description",
        content: "Bring your saved coin list across from an older Blockchain Mint web address.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecoverPage,
});

function RecoverPage() {
  const { coins, refresh } = useLocalPortfolio();
  const [result, setResult] = useState<{ imported: number; skipped: number; from: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Returning from the old domain: the list rides in the URL fragment.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#d=")) return;
    const payload = decodePayload(hash.slice(3));
    history.replaceState(null, "", window.location.pathname);
    if (!payload) {
      setError("That transfer link could not be read. Try starting the transfer again.");
      return;
    }
    let imported = 0;
    let skipped = 0;
    for (const c of payload.coins) {
      const chain = c.chain.toLowerCase();
      if (!(chain in CHAINS) || !c.address) {
        skipped++;
        continue;
      }
      const before = coins.some(
        (x) => x.chain === chain && x.address.toLowerCase() === c.address.toLowerCase(),
      );
      addLocalCoin({ chain: chain as ChainId, address: c.address, label: c.label });
      if (before) skipped++;
      else imported++;
    }
    refresh();
    setResult({ imported, skipped, from: payload.from });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startTransfer(origin: string) {
    setBusy(true);
    window.location.href = `${origin}/handoff?to=${encodeURIComponent(window.location.origin)}`;
  }

  const others = HANDOFF_ORIGINS.filter((o) => {
    try {
      return new URL(o).origin !== window.location.origin;
    } catch {
      return true;
    }
  });

  return (
    <div className="mx-auto max-w-md px-5 pt-12">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Recover</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Bring your coin list over</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your coin list is stored in your browser, and browsers keep that storage separate per web
          address. If you used the app at an older address, your list is still there — pull it across
          below. Nothing but the public addresses and nicknames moves.
        </p>
      </header>

      {result && (
        <section className="mb-6 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 text-primary" />
            <div>
              <p className="text-sm text-foreground">
                {result.imported > 0
                  ? `Recovered ${result.imported} ${result.imported === 1 ? "coin" : "coins"}.`
                  : "Nothing new to recover."}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                From {result.from}
                {result.skipped > 0 && ` · ${result.skipped} already on this device or unsupported`}
              </p>
            </div>
          </div>
          <Link
            to="/home"
            className="mt-3 block rounded-md bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            View my coins
          </Link>
        </section>
      )}

      {error && (
        <p className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Where did you use the app before?
      </p>
      <ul className="space-y-2">
        {others.map((origin) => (
          <li key={origin}>
            <button
              onClick={() => startTransfer(origin)}
              disabled={busy}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-primary/40 disabled:opacity-60"
            >
              <span className="flex items-center gap-3 text-sm text-foreground">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeftRight className="size-4" />}
                {new URL(origin).hostname}
              </span>
              <span className="text-[11px] text-muted-foreground">transfer</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] text-muted-foreground">
        You currently have {coins.length} {coins.length === 1 ? "coin" : "coins"} on this device. The
        transfer only adds coins — nothing already here is removed or overwritten.
      </p>

      <Footer />
    </div>
  );
}
