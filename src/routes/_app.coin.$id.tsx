import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTxHistory, lookupAddress } from "@/lib/chains.functions";
import { CoinMedallion } from "@/components/CoinMedallion";
import { CHAINS, fmtAmount, fmtUsd } from "@/lib/chains";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Copy, ExternalLink, ShieldCheck, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { getLocalCoin, removeLocalCoin, type LocalCoin } from "@/lib/localPortfolio";

export const Route = createFileRoute("/_app/coin/$id")({
  head: () => ({ meta: [{ title: "Coin — Blockchain Mint" }] }),
  component: CoinPage,
});

function CoinPage() {
  const { id } = useParams({ from: "/_app/coin/$id" });
  const navigate = useNavigate();
  const [coin, setCoin] = useState<LocalCoin | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCoin(getLocalCoin(id));
    setLoaded(true);
  }, [id]);

  const summaryFn = useServerFn(lookupAddress);
  const txFn = useServerFn(getTxHistory);

  const { data: summary } = useQuery({
    queryKey: ["coin-summary", coin?.chain, coin?.address],
    queryFn: () => summaryFn({ data: { chain: coin!.chain, address: coin!.address } }),
    enabled: !!coin,
  });
  const { data: txs } = useQuery({
    queryKey: ["coin-txs", coin?.chain, coin?.address],
    queryFn: () => txFn({ data: { chain: coin!.chain, address: coin!.address } }),
    enabled: !!coin,
  });

  if (!loaded) return <div className="px-5 pt-10 text-sm text-muted-foreground">Loading…</div>;
  if (!coin) {
    return (
      <div className="px-5 pt-10 text-center">
        <p className="text-sm text-muted-foreground">Coin not found in this device's portfolio.</p>
        <Link to="/home" className="mt-4 inline-block text-sm text-primary hover:underline">Back to portfolio</Link>
      </div>
    );
  }
  const ch = CHAINS[coin.chain];

  function handleRemove() {
    if (!confirm("Remove this coin from your portfolio? The coin itself is unaffected — only its watch entry is deleted.")) return;
    removeLocalCoin(id);
    toast.success("Coin removed.");
    navigate({ to: "/home" });
  }

  return (
    <div className="px-5 pt-6">
      <Link to="/home" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Portfolio
      </Link>

      <div className="mt-6 flex flex-col items-center text-center">
        <CoinMedallion chain={coin.chain} size={140} />
        <h1 className="mt-5 font-serif text-2xl text-foreground">{coin.label || `${ch.name} coin`}</h1>
        <p className="num mt-3 font-serif text-4xl text-foreground">
          {summary ? fmtAmount(summary.balance, ch.decimals, 6) : "—"} <span className="text-base text-muted-foreground">{ch.ticker}</span>
        </p>
        {summary?.balanceFiat != null && (
          <p className="num mt-0.5 text-sm text-muted-foreground">{fmtUsd(summary.balanceFiat)}</p>
        )}
        {summary?.error && <p className="mt-2 text-xs text-accent">{summary.error}</p>}
      </div>

      <ReceiveBlock address={coin.address} explorerUrl={ch.explorer(coin.address)} />

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          to="/verify/$chain/$address" params={{ chain: coin.chain, address: coin.address }}
          className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-secondary/80"
        >
          <ShieldCheck className="size-4" /> Verify
        </Link>
        <Link
          to="/sweep" search={{ chain: coin.chain, address: coin.address }}
          className="flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
        >
          <KeyRound className="size-4" /> Sweep
        </Link>
      </div>

      <h2 className="mt-8 mb-3 font-serif text-lg text-foreground">Recent activity</h2>
      {(txs ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions yet.</p>
      ) : (
        <ul className="space-y-2">
          {(txs ?? []).map(tx => (
            <li key={tx.hash}>
              <a href={tx.url} target="_blank" rel="noopener noreferrer"
                 className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/40">
                <div className="flex items-center gap-3">
                  {tx.direction === "in"
                    ? <ArrowDownLeft className="size-4 text-primary" />
                    : <ArrowUpRight className="size-4 text-accent" />}
                  <div>
                    <p className="font-mono text-[11px] text-muted-foreground">{tx.hash.slice(0, 10)}…</p>
                    <p className="text-[11px] text-muted-foreground">{tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleDateString() : "pending"}</p>
                  </div>
                </div>
                <p className={`num font-mono text-sm ${tx.direction === "in" ? "text-primary" : "text-foreground"}`}>
                  {tx.amount > 0 ? "+" : ""}{fmtAmount(tx.amount, ch.decimals, 6)}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={handleRemove}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-md border border-destructive/40 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="size-4" /> Remove coin
      </button>
    </div>
  );
}

function ReceiveBlock({ address, explorerUrl }: { address: string; explorerUrl: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Receive address</p>
      <p className="mt-2 break-all font-mono text-xs text-foreground">{address}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={copy} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium hover:bg-secondary/80">
          <Copy className="size-3.5" /> {copied ? "Copied" : "Copy"}
        </button>
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
           className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium hover:bg-secondary/80">
          <ExternalLink className="size-3.5" /> Explorer
        </a>
      </div>
    </div>
  );
}
