import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lookupAddress } from "@/lib/chains.functions";
import { CoinLogo } from "@/components/CoinLogo";
import { CHAINS, cscId, fmtAmount, fmtUsd, type ChainId } from "@/lib/chains";
import { ScanLine, Plus } from "lucide-react";
import { useLocalPortfolio } from "@/lib/localPortfolio";


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
  const { coins, ready } = useLocalPortfolio();
  const navigate = useNavigate();
  const lookup = useServerFn(lookupAddress);

  const summaries = useQueries({
    queries: coins.map(c => ({
      queryKey: ["summary", c.chain, c.address],
      queryFn: () => lookup({ data: { chain: c.chain, address: c.address } }),
      staleTime: 30_000,
    })),
  });

  const totalFiat = summaries.reduce((s, q) => s + (q.data?.balanceFiat ?? 0), 0);

  return (
    <div className="px-5 pt-10">
      <header className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Portfolio</p>
        <div className="num mt-1 font-serif text-5xl text-foreground">{fmtUsd(totalFiat)}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          across {coins.length} {coins.length === 1 ? "coin" : "coins"}
        </p>
      </header>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl text-foreground">Your coins</h2>
        <button
          onClick={() => navigate({ to: "/scan" })}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80"
        >
          <Plus className="size-3.5" /> Add
        </button>
      </div>

      {ready && coins.length === 0 && <EmptyState />}

      <ul className="space-y-3">
        {coins.map((coin, idx) => {
          const ch = CHAINS[coin.chain];
          const s = summaries[idx]?.data;
          return (
            <li key={coin.id}>
              <Link
                to="/coin/$id"
                params={{ id: coin.id }}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40"
              >
                <CoinLogo chain={coin.chain} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-base text-foreground">
                    <span className="font-mono text-sm tracking-wider text-foreground">{ch.ticker}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">#{cscId(coin.chain, coin.address)}</span>
                  </p>
                  {coin.label && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{coin.label}</p>
                  )}
                </div>

                <div className="text-right">
                  <p className="num font-serif text-base text-foreground">
                    {s ? fmtAmount(s.balance, ch.decimals, 6) : "—"}
                  </p>
                  <p className="num text-xs text-muted-foreground">{fmtUsd(s?.balanceFiat ?? 0)}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
      <ScanLine className="mx-auto size-8 text-muted-foreground" />
      <h3 className="mt-3 font-serif text-lg text-foreground">No coins yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">Scan the QR on the front of a coin to start watching it.</p>
      <Link to="/scan" className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        Scan a coin
      </Link>
    </div>
  );
}
