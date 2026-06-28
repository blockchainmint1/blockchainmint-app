import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { Footer } from "@/components/Footer";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Back up your coins — Blockchain Mint" },
      { name: "description", content: "Optional sign-in to back up your coin list across devices." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<null | "google" | "apple">(null);

  async function signInWith(provider: "google" | "apple") {
    setBusy(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin + "/settings",
      });
      if (result.error) {
        toast.error(result.error.message);
        setBusy(null);
        return;
      }
      if (result.redirected) return;
      // Wait for session before redirecting away.
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate({ to: "/settings" });
      else setBusy(null);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Link to="/home" className="mb-6 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to your coins
        </Link>

        <div className="mb-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Cold Storage Coins</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">Back up your coins</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your coin list lives on this device. Sign in to back it up and reach it from any phone or browser.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-2xl">
          <div className="space-y-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => signInWith("apple")}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition hover:bg-secondary/80 disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M16.365 1.43c0 1.14-.46 2.23-1.23 3.02-.83.85-2.19 1.51-3.31 1.42-.14-1.12.4-2.29 1.18-3.03.84-.81 2.27-1.41 3.36-1.41zM20.5 17.36c-.55 1.28-.81 1.85-1.52 2.99-.99 1.59-2.4 3.58-4.13 3.6-1.55.02-1.95-1.01-4.06-1-2.12.01-2.55 1.02-4.1 1-1.74-.02-3.06-1.81-4.06-3.4C.2 17.43-.13 12.99 1.7 10.6c1.3-1.7 3.36-2.69 5.29-2.69 1.96 0 3.2 1.07 4.82 1.07 1.58 0 2.54-1.07 4.81-1.07 1.72 0 3.55.94 4.85 2.56-4.26 2.33-3.57 8.42-.97 9.89z"/></svg>
              {busy === "apple" ? "Opening Apple…" : "Continue with Apple"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => signInWith("google")}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition hover:bg-secondary/80 disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M23 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.18c-.27 1.4-1.08 2.58-2.3 3.38v2.8h3.72C21.78 18.5 23 15.66 23 12.27z"/>
                <path fill="#34A853" d="M12 23c3.1 0 5.7-1.03 7.6-2.78l-3.72-2.88c-1.03.7-2.36 1.1-3.88 1.1-2.98 0-5.5-2-6.4-4.72H1.74v2.96C3.63 20.53 7.5 23 12 23z"/>
                <path fill="#FBBC05" d="M5.6 13.72c-.22-.7-.35-1.43-.35-2.22s.13-1.52.35-2.22V6.32H1.74C.94 7.9.5 9.65.5 11.5s.44 3.6 1.24 5.18l3.86-2.96z"/>
                <path fill="#EA4335" d="M12 5.78c1.68 0 3.2.58 4.4 1.72l3.3-3.3C17.7 2.4 15.1 1.5 12 1.5 7.5 1.5 3.63 3.97 1.74 7.32l3.86 2.96C6.5 7.78 9.02 5.78 12 5.78z"/>
              </svg>
              {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </button>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-md border border-border/60 bg-secondary/40 p-3 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              We never see your coin's private key. Backup syncs only the public list — chain, address, and label.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
