import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Blockchain Mint — Cold Storage Coins" },
      { name: "description", content: "Verify, watch, and sweep physical crypto coins from Cold Storage Coins." },
    ],
  }),
  component: Index,
});

function Index() {
  const { ready, user } = useAuth();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="medallion-gold size-16 animate-pulse rounded-full" aria-label="Loading" />
      </div>
    );
  }
  if (user) return <Navigate to="/home" />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="medallion-gold relative mb-8 size-32 rounded-full">
          <div
            className="absolute inset-[8%] flex items-center justify-center rounded-full"
            style={{ boxShadow: "inset 0 0 0 1px oklch(0 0 0 / 0.25), inset 0 0 0 2px oklch(1 0 0 / 0.18)" }}
          >
            <span className="font-serif text-4xl font-semibold" style={{ color: "oklch(0.22 0.02 60)" }}>BM</span>
          </div>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Cold Storage Coins</p>
        <h1 className="mt-3 max-w-md text-center font-serif text-5xl leading-tight text-foreground sm:text-6xl">
          The companion to your physical coin.
        </h1>
        <p className="mt-4 max-w-md text-center text-base text-muted-foreground">
          Verify authenticity. Watch balances across eleven chains. Sweep when you're ready. Your keys never touch a server.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href="/auth" className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
            Create your vault
          </a>
          <a href="/auth?mode=signin" className="inline-flex items-center justify-center rounded-md border border-border px-6 py-3 text-sm font-medium text-foreground transition hover:bg-secondary">
            Sign in
          </a>
        </div>
      </main>
      <Footer />
    </div>
  );
}
