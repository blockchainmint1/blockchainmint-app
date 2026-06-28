import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addWatched, verifyMintRecord } from "@/lib/chains.functions";
import { CHAIN_OPTIONS, type ChainId } from "@/lib/chains";
import { ScanLine, ShieldCheck, Coins } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/scan")({
  head: () => ({ meta: [{ title: "Scan — Blockchain Mint" }] }),
  component: ScanPage,
});

function ScanPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [chain, setChain] = useState<ChainId>("btc");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");

  const verifyFn = useServerFn(verifyMintRecord);
  const watchFn = useServerFn(addWatched);

  const verify = useMutation({
    mutationFn: () => verifyFn({ data: { chain, address: address.trim() } }),
    onSuccess: () => {
      navigate({ to: "/verify/$chain/$address", params: { chain, address: address.trim() } });
    },
    onError: e => toast.error((e as Error).message),
  });

  const watch = useMutation({
    mutationFn: () => watchFn({ data: { chain, address: address.trim(), label: label.trim() || undefined } }),
    onSuccess: row => {
      toast.success("Coin added to your portfolio.");
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      navigate({ to: "/coin/$id", params: { id: row.id } });
    },
    onError: e => toast.error((e as Error).message),
  });

  return (
    <div className="px-5 pt-10">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Scan a coin</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Verify or add</h1>
      </header>

      {/* Camera placeholder — native plugin wires up in Phase 2 */}
      <div className="relative mb-6 aspect-square w-full overflow-hidden rounded-2xl border border-border bg-secondary">
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <ScanLine className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-2 px-6 text-xs text-muted-foreground">
              Camera scanning unlocks when the app is installed via App&nbsp;Store / Play&nbsp;Store. For now, type or paste the address engraved on your coin.
            </p>
          </div>
        </div>
        {/* engraved corner reticles */}
        <div className="pointer-events-none absolute inset-4 rounded-xl border-2 border-primary/60" style={{ clipPath: "polygon(0 0,30% 0,30% 2px,2px 2px,2px 30%,0 30%,0 70%,2px 70%,2px calc(100% - 2px),30% calc(100% - 2px),30% 100%,0 100%,0 100%,70% 100%,70% calc(100% - 2px),calc(100% - 2px) calc(100% - 2px),calc(100% - 2px) 70%,100% 70%,100% 30%,calc(100% - 2px) 30%,calc(100% - 2px) 2px,70% 2px,70% 0)" }} />
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Chain</span>
          <select
            value={chain}
            onChange={e => setChain(e.target.value as ChainId)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
          >
            {CHAIN_OPTIONS.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.ticker}){c.liveInPhase1 ? "" : " — Phase 3"}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Address</span>
          <input
            type="text" value={address} onChange={e => setAddress(e.target.value)}
            placeholder="Paste the public address engraved on the coin"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-xs focus:border-ring focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Label (optional)</span>
          <input
            type="text" value={label} onChange={e => setLabel(e.target.value)}
            placeholder="e.g. 'Birthday 2024'"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            disabled={!address || verify.isPending}
            onClick={() => verify.mutate()}
            className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50"
          >
            <ShieldCheck className="size-4" /> Verify
          </button>
          <button
            disabled={!address || watch.isPending}
            onClick={() => watch.mutate()}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Coins className="size-4" /> Add coin
          </button>
        </div>
      </div>
    </div>
  );
}
