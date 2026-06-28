import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lookupAddress, verifyMintRecord } from "@/lib/chains.functions";
import { CoinMedallion } from "@/components/CoinMedallion";
import { CHAINS, fmtAmount, fmtUsd, type ChainId } from "@/lib/chains";
import { ArrowLeft, ShieldCheck, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/verify/$chain/$address")({
  head: () => ({ meta: [{ title: "Verify — Blockchain Mint" }] }),
  component: VerifyPage,
});

function VerifyPage() {
  const { chain, address } = useParams({ from: "/_app/verify/$chain/$address" });
  const verifyFn = useServerFn(verifyMintRecord);
  const summaryFn = useServerFn(lookupAddress);
  const c = chain as ChainId;

  const { data: verify, isLoading: vL } = useQuery({
    queryKey: ["verify", chain, address],
    queryFn: () => verifyFn({ data: { chain: c, address } }),
  });
  const { data: summary } = useQuery({
    queryKey: ["verify-summary", chain, address],
    queryFn: () => summaryFn({ data: { chain: c, address } }),
  });

  const ch = CHAINS[c];

  return (
    <div className="px-5 pt-6">
      <Link to="/scan" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Scan
      </Link>

      <div className="mt-6 flex flex-col items-center text-center">
        <CoinMedallion chain={c} size={140} />
        <h1 className="mt-5 font-serif text-2xl text-foreground">{ch.name} coin</h1>
        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{address}</p>
      </div>

      <div className="mt-6">
        {vL ? (
          <div className="h-24 animate-pulse rounded-xl bg-card" />
        ) : verify?.authentic ? (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-5 text-center">
            <ShieldCheck className="mx-auto size-8 text-primary" />
            <p className="mt-2 font-serif text-xl text-foreground">Authentic</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This address is in the Blockchain Mint registry.
            </p>
            {verify.record && (
              <dl className="mt-4 space-y-1 text-left text-xs">
                {verify.record.serial && <Row label="Serial">{verify.record.serial}</Row>}
                {verify.record.mint_year && <Row label="Minted">{verify.record.mint_year}</Row>}
                {verify.record.denomination && <Row label="Denomination">{verify.record.denomination}</Row>}
                {verify.record.metal && <Row label="Metal">{verify.record.metal}</Row>}
              </dl>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-5 text-center">
            <ShieldAlert className="mx-auto size-8 text-accent" />
            <p className="mt-2 font-serif text-xl text-foreground">Not in our registry</p>
            <p className="mt-1 text-xs text-muted-foreground">
              We don't have a mint record for this address. It may be an older coin, or it may not be from Blockchain&nbsp;Mint. You can still watch it.
            </p>
          </div>
        )}
      </div>

      {summary && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">On-chain balance</p>
          <p className="num mt-1 font-serif text-2xl text-foreground">
            {fmtAmount(summary.balance, ch.decimals, 6)} <span className="text-sm text-muted-foreground">{ch.ticker}</span>
          </p>
          {summary.balanceFiat != null && <p className="num text-xs text-muted-foreground">{fmtUsd(summary.balanceFiat)}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{summary.txCount} transactions</p>
          {summary.error && <p className="mt-2 text-[11px] text-accent">{summary.error}</p>}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1 last:border-0">
      <dt className="font-mono uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}
