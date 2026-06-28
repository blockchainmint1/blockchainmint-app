import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/manifesto")({
  head: () => ({
    meta: [
      { title: "Manifesto — Blockchain Mint" },
      { name: "description", content: "Why we strike honest coins, and what we promise the people who hold them." },
      { property: "og:title", content: "The Blockchain Mint Manifesto" },
      { property: "og:description", content: "Honest weight. Honest money. Honest custody." },
    ],
  }),
  component: Manifesto,
});

function Manifesto() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Home
      </Link>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Manifesto</p>
      <h1 className="mt-2 font-serif text-5xl text-foreground">Honest weight. Honest money.</h1>

      <div className="prose prose-invert mt-8 space-y-5 text-muted-foreground">
        <p className="text-lg text-foreground">We believe a coin should be heavy enough to mean something, and private enough to be yours.</p>

        <h2 className="mt-8 font-serif text-2xl text-foreground">We do not hold your keys.</h2>
        <p>The private key on the coin was generated on an air-gapped machine, loaded onto the coin, sealed under a tamper-evident hologram, and destroyed at the source. We do not have a copy. Neither do our servers, this app, or anyone else. The coin in your hand is the wallet.</p>

        <h2 className="mt-8 font-serif text-2xl text-foreground">We do not surveil your balances.</h2>
        <p>The app looks up public addresses through public block explorers, the same way anyone with a browser could. We don't sell your watched addresses, your activity, or your portfolio composition to anyone — not advertisers, not analytics vendors, not chain-analysis firms.</p>

        <h2 className="mt-8 font-serif text-2xl text-foreground">We honor the weight.</h2>
        <p>Every round is struck from real metal, weighed to its stated denomination, and shipped insured. If a coin arrives short, light, or compromised — we replace it. Honest weight is not a marketing line. It is the contract.</p>

        <h2 className="mt-8 font-serif text-2xl text-foreground">We answer to the holder.</h2>
        <p>Not to a regulator. Not to a payment processor. Not to a blockchain analytics partner. To the person holding the coin. Always.</p>

        <p className="pt-8 text-sm">{"\n"}</p>
      </div>
      <Footer />
    </div>
  );
}
