import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { KeyRound, ShieldAlert, ArrowLeft } from "lucide-react";

const sweepSearchSchema = z.object({
  chain: z.enum(["btc","eth","ltc","doge","bch","bsc","ada","sol","bnb","txc","iskander"]).optional(),
  address: z.string().optional(),
});

export const Route = createFileRoute("/_app/sweep")({
  validateSearch: sweepSearchSchema,
  head: () => ({ meta: [{ title: "Sweep — Blockchain Mint" }] }),
  component: SweepPage,
});

function SweepPage() {
  const { chain, address } = useSearch({ from: "/_app/sweep" });

  return (
    <div className="px-5 pt-6">
      <Link to="/home" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back
      </Link>

      <header className="mt-6 mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Sweep / redeem</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Move funds off your coin</h1>
      </header>

      <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm">
        <ShieldAlert className="mb-2 size-5 text-accent" />
        <p className="font-medium text-foreground">Your key never leaves this device.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          When you scan or paste the private key from under the tamper sticker, the signing happens inside the app. Nothing is uploaded, stored, or logged. The instant the sweep is broadcast, the key is wiped from memory.
        </p>
      </div>

      <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">From</p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">{address ?? "Select a coin to sweep"}</p>
          {chain && <p className="text-[11px] text-muted-foreground">{chain.toUpperCase()}</p>}
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Private key (WIF / hex)</p>
          <input
            type="password" placeholder="Paste or scan the engraved key"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-xs focus:border-ring focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Camera scanning unlocks on the native build. Until then you can type the key manually.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Send to</p>
          <input
            type="text" placeholder="Destination address on the same chain"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-xs focus:border-ring focus:outline-none"
          />
        </div>

        <button
          disabled
          className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground opacity-60"
        >
          <KeyRound className="size-4" /> Broadcast sweep (live in Phase 1.5)
        </button>
        <p className="text-center text-[10px] text-muted-foreground">
          Signing libraries are wiring up — BTC and ETH sweep go live in the next iteration.
        </p>
      </div>
    </div>
  );
}
