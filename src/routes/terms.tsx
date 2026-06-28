import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms — Blockchain Mint" },
      { name: "description", content: "Terms of service for Blockchain Mint and the Cold Storage Coins app." },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Home
      </Link>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Legal</p>
      <h1 className="mt-2 font-serif text-4xl text-foreground">Terms of Service</h1>
      <p className="mt-2 text-xs text-muted-foreground">Draft — last updated June 2026. Replace with your own legal review before submission.</p>

      <div className="prose prose-invert mt-6 space-y-4 text-sm text-muted-foreground">
        <h2 className="font-serif text-xl text-foreground">1. The product</h2>
        <p>Blockchain Mint sells physical coins (the "Coins") that contain a cryptocurrency private key. The accompanying mobile and web app (the "App") helps you verify authenticity, monitor public address activity, and optionally broadcast a sweep transaction using a key you provide.</p>

        <h2 className="font-serif text-xl text-foreground">2. Custody</h2>
        <p>Blockchain Mint is not a custodian. We do not hold, store, or have access to the private keys loaded onto your Coins. Loss of a Coin, destruction of a Coin, or removal of the tamper seal may result in irrecoverable loss of the funds it controls. You are solely responsible for the security of your Coins and any keys you reveal from them.</p>

        <h2 className="font-serif text-xl text-foreground">3. No financial advice</h2>
        <p>Nothing in the App or on our packaging is investment, tax, or legal advice. Cryptocurrency values fluctuate.</p>

        <h2 className="font-serif text-xl text-foreground">4. The App</h2>
        <p>The App provides read-only blockchain information via public explorers and a key-handling sweep flow that runs entirely on your device. We make commercially reasonable efforts to keep balance data accurate but do not warrant it.</p>

        <h2 className="font-serif text-xl text-foreground">5. Acceptable use</h2>
        <p>You agree not to use the App to facilitate illegal activity, to misrepresent the authenticity of a Coin you do not own, or to abuse the verification registry.</p>

        <h2 className="font-serif text-xl text-foreground">6. Liability</h2>
        <p>To the maximum extent permitted by law, Blockchain Mint's liability is limited to the purchase price of the Coin in question. We disclaim all consequential damages.</p>

        <h2 className="font-serif text-xl text-foreground">7. Contact</h2>
        <p>Questions: mint@blockchainmint.com</p>
      </div>
      <Footer />
    </div>
  );
}
