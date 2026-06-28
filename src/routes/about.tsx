import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Blockchain Mint" },
      { name: "description", content: "Blockchain Mint mints physical Cold Storage Coins. The app is the digital twin of the coin in your hand." },
      { property: "og:title", content: "About Blockchain Mint" },
      { property: "og:description", content: "The digital twin of the coin in your hand." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Home
      </Link>
      <h1 className="mt-6 font-serif text-4xl text-foreground">About Blockchain Mint</h1>
      <div className="prose prose-invert mt-6 space-y-4 text-muted-foreground">
        <p>
          Blockchain Mint strikes physical coins that carry real cryptocurrency value. Each coin is loaded with a private key, sealed under a tamper-evident hologram, and shipped honest weight in silver, gold, copper, or brass.
        </p>
        <p>
          This app is the digital twin of the coin in your hand. Use it to verify the coin's authenticity against the public mint registry, watch its balance across eleven blockchains, receive funds into it, get notified when something moves, and — when you're ready — sweep it on the device that never let your private key leave it.
        </p>
        <p>{"\n"}</p>
      </div>
      <Footer />
    </div>
  );
}
