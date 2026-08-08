import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";
import { ArrowLeft, Download, ShieldCheck, Terminal } from "lucide-react";

export const Route = createFileRoute("/downloads")({
  head: () => ({
    meta: [
      { title: "CSC Mint Downloads — Blockchain Mint" },
      {
        name: "description",
        content:
          "Download CSC Mint, the offline keygen and QA station used to strike Blockchain Mint Cold Storage Coins. Verify the SHA-256 checksum before you run it.",
      },
      { property: "og:title", content: "CSC Mint Downloads" },
      {
        property: "og:description",
        content: "Offline keygen and QA station for Blockchain Mint Cold Storage Coins.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Downloads,
});

const VERSION = "1.2.0";
const RELEASE_URL = "https://github.com/blockchainmint/blockchain-mint/releases/latest";

function Downloads() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Home
      </Link>

      <h1 className="mt-6 font-serif text-4xl text-foreground">CSC Mint</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The offline keygen and QA station that strikes every Blockchain Mint Cold Storage Coin.
        It has zero network code. It is meant to run on an air-gapped PC and nowhere else.
      </p>

      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-xl text-foreground">Windows (64-bit)</h2>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            v{VERSION}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          A single self-contained <code className="text-foreground">CSCMint.exe</code>. Nothing to
          install on the offline machine.
        </p>
        <a
          href={RELEASE_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Download className="size-4" /> Get the latest release
        </a>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 font-serif text-xl text-foreground">
          <ShieldCheck className="size-4" /> Verify before you trust it
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This program generates live private keys. Confirm the file you downloaded matches the
          SHA-256 published on the release page before running it on the mint station:
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs text-foreground">
          <code>certutil -hashfile CSCMint.exe SHA256</code>
        </pre>
        <p className="mt-3 text-sm text-muted-foreground">
          If the hash does not match, delete the file. Do not run it.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 font-serif text-xl text-foreground">
          <Terminal className="size-4" /> Build it yourself
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The source is public and the exe is reproducible from it. Clone the repo and run{" "}
          <code className="text-foreground">desktop\build_windows.bat</code> on any Windows PC with
          Python 3.11. Full instructions live in{" "}
          <code className="text-foreground">desktop/WINPC_BUILD.md</code>, and the air-gapped path
          is in <code className="text-foreground">desktop/OFFLINE_BUILD.md</code>.
        </p>
      </div>

      <Footer />
    </div>
  );
}
