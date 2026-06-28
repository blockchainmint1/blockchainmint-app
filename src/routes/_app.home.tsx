import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { homePortfolio } from "@/lib/chains.functions";
import { CoinMedallion } from "@/components/CoinMedallion";
import { CHAINS, fmtAmount, fmtUsd, shortAddr, type ChainId } from "@/lib/chains";
import { ScanLine, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/home")({
  head: () => ({
    meta: [
      { title: "Your coins — Blockchain Mint" },
      { name: "description", content: "Your watched physical coins and total holdings." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const fetchPortfolio = useServerFn(homePortfolio);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => fetchPortfolio(),
    staleTime: 30_000,
  });

  return (
    <div className="px-5 pt-10">
      <header className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Portfolio</p>
        <div className="mt-1 num font-serif text-5xl text-foreground">
          {isLoading ? "—" : fmtUsd(data?.totalFiat ?? 0)}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          across {data?.coins.length ?? 0} {data?.coins.length === 1 ? "coin" : "coins"}
        </p>
      </header>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl text-foreground">Your coins</h2>
        <Link to="/scan" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80">
          <Plus className="size-3.5" /> Add
        </Link>
      </div>

      {isError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{(error as Error).message}</p>
      )}

      {!isLoading && (data?.coins.length ?? 0) === 0 && (
        <EmptyState />
      )}

      <ul className="space-y-3">
        {(data?.coins ?? []).map(coin => (
          <li key={coin.id}>
            <Link
              to="/coin/$id"
              params={{ id: coin.id }}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40"
            >
              <CoinMedallion chain={coin.chain as ChainId} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-serif text-base text-foreground">
                    {coin.label || `${CHAINS[coin.chain as ChainId].name} coin`}
                  </p>
                  <span className="rounded-sm bg-secondary px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{CHAINS[coin.chain as ChainId].ticker}</span>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{shortAddr(coin.address)}</p>
              </div>
              <div className="text-right">
                <p className="num font-serif text-base text-foreground">
                  {fmtAmount(coin.summary.balance, CHAINS[coin.chain as ChainId].decimals, 6)}
                </p>
                <p className="num text-xs text-muted-foreground">{fmtUsd(coin.summary.balanceFiat ?? 0)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
      <ScanLine className="mx-auto size-8 text-muted-foreground" />
      <h3 className="mt-3 font-serif text-lg text-foreground">No coins yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">Scan the address on the front of a coin to start watching it.</p>
      <Link to="/scan" className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        Scan a coin
      </Link>
    </div>
  );
}
