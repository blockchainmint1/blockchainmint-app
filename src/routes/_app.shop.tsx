import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CoinMedallion } from "@/components/CoinMedallion";
import { ExternalLink } from "lucide-react";
import { listShopProducts } from "@/lib/shop.functions";

export const Route = createFileRoute("/_app/shop")({
  head: () => ({
    meta: [
      { title: "Shop — Blockchain Mint" },
      { name: "description", content: "Physical Cold Storage Coins, struck in fine copper. Order directly from blockchainmint.com." },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const fetchProducts = useServerFn(listShopProducts);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["shop", "cold-storage"],
    queryFn: () => fetchProducts(),
    staleTime: 60 * 60 * 1000,
  });

  return (
    <div className="px-5 pt-10">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Shop</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Cold Storage Coins</h1>
        <p className="mt-2 text-sm text-muted-foreground">Honest weight. Honest money. Checkout opens on blockchainmint.com.</p>
      </header>

      {isLoading ? (
        <ul className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="h-56 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {items.map(item => (
            <li key={item.url}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full flex-col rounded-xl border border-border bg-card p-3 transition hover:border-primary/40"
              >
                <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-muted/30">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-full w-full object-contain" />
                  ) : item.chain ? (
                    <CoinMedallion chain={item.chain} size={88} />
                  ) : null}
                </div>
                <p className="mt-2 font-serif text-sm leading-tight text-foreground">{item.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{item.spec}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground/80">{item.tagline}</p>
                <div className="mt-2 flex items-end justify-between">
                  <span className="num font-mono text-sm text-primary">{item.price}</span>
                  <ExternalLink className="size-3.5 text-muted-foreground transition group-hover:text-primary" />
                </div>
              </a>
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
