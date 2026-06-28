import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — Blockchain Mint" },
      { name: "description", content: "How Blockchain Mint handles your data. Spoiler: as little as possible." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Home
      </Link>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Legal</p>
      <h1 className="mt-2 font-serif text-4xl text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-xs text-muted-foreground">Draft — last updated June 2026. Replace with your own legal review before submission.</p>

      <div className="prose prose-invert mt-6 space-y-4 text-sm text-muted-foreground">
        <h2 className="font-serif text-xl text-foreground">What we collect</h2>
        <ul className="list-disc pl-5">
          <li>Your email address and the public addresses you choose to watch.</li>
          <li>Order details (shipping address, items purchased) when you buy a Coin.</li>
          <li>Push notification device tokens, only if you enable alerts.</li>
        </ul>

        <h2 className="font-serif text-xl text-foreground">What we never collect</h2>
        <ul className="list-disc pl-5">
          <li>Private keys. Sweep signing happens on your device; keys never reach our servers, logs, or analytics.</li>
          <li>Behavioral analytics tied to your watched addresses.</li>
          <li>Location data.</li>
        </ul>

        <h2 className="font-serif text-xl text-foreground">Third parties</h2>
        <p>We query public block explorers (mempool.space, Blockscout, Blockchair, and per-chain RPC nodes) using only the public addresses you provide. We use Lovable Cloud (a managed Supabase backend) to store your account and a push notifications provider (FCM) to deliver alerts.</p>

        <h2 className="font-serif text-xl text-foreground">Your rights</h2>
        <p>You can delete your account at any time from Settings, which removes all stored watched addresses, alerts, and device tokens. Orders are retained for tax purposes.</p>

        <h2 className="font-serif text-xl text-foreground">Contact</h2>
        <p>mint@blockchainmint.com</p>
      </div>
      <Footer />
    </div>
  );
}
