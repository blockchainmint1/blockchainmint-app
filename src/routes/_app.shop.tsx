import { createFileRoute } from "@tanstack/react-router";
import { CoinMedallion } from "@/components/CoinMedallion";
import { ExternalLink, Cpu } from "lucide-react";
import type { ChainId } from "@/lib/chains";

export const Route = createFileRoute("/_app/shop")({
  head: () => ({
    meta: [
      { title: "Shop — Blockchain Mint" },
      { name: "description", content: "Physical Cold Storage Coins, struck in fine copper. Order directly from blockchainmint.com." },
    ],
  }),
  component: ShopPage,
});

type ShopItem = {
  name: string;
  tagline: string;
  price: string;
  spec: string;
  url: string;
} & ({ kind: "coin"; chain: ChainId } | { kind: "accessory" });

const ITEMS: ShopItem[] = [
  { kind: "coin", chain: "btc", name: "Bitcoin Cold Storage Wallet", tagline: "Tamper-evident physical BTC wallet for true cold custody", price: "$19.95", spec: ".999 fine copper", url: "https://blockchainmint.com/product/bitcoin-cold-storage-wallet" },
  { kind: "coin", chain: "eth", name: "Ethereum Cold Storage Wallet", tagline: "Physical ETH wallet — your private key under hologram", price: "$19.95", spec: ".999 fine copper", url: "https://blockchainmint.com/product/ethereum-cold-storage-wallet" },
  { kind: "coin", chain: "txc", name: "TEXITcoin Cold Storage Wallet", tagline: "Sovereign-series TXC wallet — minted in the spirit of the Republic", price: "$19.95", spec: ".999 fine copper", url: "https://blockchainmint.com/product/texitcoin-cold-storage-wallet" },
  { kind: "coin", chain: "doge", name: "Dogecoin Cold Storage Wallet", tagline: "Much wallet. Very cold. Such storage.", price: "$19.95", spec: ".999 fine copper", url: "https://blockchainmint.com/product/dogecoin-cold-storage-wallet" },
  { kind: "coin", chain: "ltc", name: "Litecoin Cold Storage Wallet", tagline: "Secure your Litecoin with a tangible, high-quality cold storage solution.", price: "$19.95", spec: ".999 fine copper", url: "https://blockchainmint.com/product/litecoin-ltc-cold-storage-wallet" },
  { kind: "accessory", name: "Nectar.Pay Mobile POS Terminal", tagline: "Accept crypto payments anywhere — secure, portable, user-friendly.", price: "$250", spec: "Accessory", url: "https://blockchainmint.com/product/nectar-pay-mobile-pos-terminal" },
];

function ShopPage() {
  return (
    <div className="px-5 pt-10">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Shop</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Order a coin</h1>
        <p className="mt-2 text-sm text-muted-foreground">Honest weight. Honest money. Checkout opens on blockchainmint.com.</p>
      </header>

      <ul className="grid grid-cols-2 gap-3">
        {ITEMS.map(item => (
          <li key={item.url}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-full flex-col rounded-xl border border-border bg-card p-3 transition hover:border-primary/40"
            >
              <div className="flex h-28 items-center justify-center">
                {item.kind === "coin" ? (
                  <CoinMedallion chain={item.chain} size={88} />
                ) : (
                  <div className="flex size-[88px] items-center justify-center rounded-full border border-border bg-muted/40">
                    <Cpu className="size-10 text-muted-foreground" />
                  </div>
                )}
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
