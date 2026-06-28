import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProducts } from "@/lib/shop.functions";
import { CoinMedallion } from "@/components/CoinMedallion";
import { CHAINS, type ChainId } from "@/lib/chains";

export const Route = createFileRoute("/_app/shop")({
  head: () => ({
    meta: [
      { title: "Shop — Blockchain Mint" },
      { name: "description", content: "Physical Cold Storage Coins, struck in silver, gold, copper, and brass." },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const fetchProducts = useServerFn(listProducts);
  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="px-5 pt-10">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Shop</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Order a coin</h1>
        <p className="mt-2 text-sm text-muted-foreground">Honest weight. Honest money.</p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0,1,2].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-card" />)}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {(products ?? []).map(p => (
            <li key={p.id}>
              <Link
                to="/shop/$slug" params={{ slug: p.slug }}
                className="flex h-full flex-col rounded-xl border border-border bg-card p-3 transition hover:border-primary/40"
              >
                <div className="flex h-28 items-center justify-center">
                  <CoinMedallion chain={p.chain as ChainId} size={88} />
                </div>
                <p className="mt-2 font-serif text-sm leading-tight text-foreground">{p.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{p.denomination} · {p.metal}</p>
                <div className="mt-2 flex items-end justify-between">
                  <span className="num font-mono text-sm text-primary">${(p.price_cents/100).toFixed(2)}</span>
                  {!p.in_stock && <span className="text-[10px] uppercase tracking-wider text-destructive">Sold out</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Part of the{" "}
        <a href="https://honest.money" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          honest.money
        </a>{" "}
        ecosystem.
      </p>
    </div>
  );
}
