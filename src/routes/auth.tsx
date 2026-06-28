import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { Footer } from "@/components/Footer";
import { Loader2 } from "lucide-react";

const authSearchSchema = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: authSearchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Blockchain Mint" },
      { name: "description", content: "Sign in to your Blockchain Mint vault." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/home` },
        });
        if (error) throw error;
        toast.success("Vault created. Check your email to confirm if required, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/home" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signInWith(provider: "google" | "apple") {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin + "/home",
      });
      if (result.error) {
        toast.error(result.error.message);
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/home" });
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Cold Storage Coins</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">
            {mode === "signup" ? "Create your vault" : "Open your vault"}
          </h1>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-2xl">
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => signInWith("apple")}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition hover:bg-secondary/80 disabled:opacity-50"
            >
              {/* Apple glyph */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M16.365 1.43c0 1.14-.46 2.23-1.23 3.02-.83.85-2.19 1.51-3.31 1.42-.14-1.12.4-2.29 1.18-3.03.84-.81 2.27-1.41 3.36-1.41zM20.5 17.36c-.55 1.28-.81 1.85-1.52 2.99-.99 1.59-2.4 3.58-4.13 3.6-1.55.02-1.95-1.01-4.06-1-2.12.01-2.55 1.02-4.1 1-1.74-.02-3.06-1.81-4.06-3.4C.2 17.43-.13 12.99 1.7 10.6c1.3-1.7 3.36-2.69 5.29-2.69 1.96 0 3.2 1.07 4.82 1.07 1.58 0 2.54-1.07 4.81-1.07 1.72 0 3.55.94 4.85 2.56-4.26 2.33-3.57 8.42-.97 9.89z"/></svg>
              Continue with Apple
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => signInWith("google")}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition hover:bg-secondary/80 disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M23 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.18c-.27 1.4-1.08 2.58-2.3 3.38v2.8h3.72C21.78 18.5 23 15.66 23 12.27z"/>
                <path fill="#34A853" d="M12 23c3.1 0 5.7-1.03 7.6-2.78l-3.72-2.88c-1.03.7-2.36 1.1-3.88 1.1-2.98 0-5.5-2-6.4-4.72H1.74v2.96C3.63 20.53 7.5 23 12 23z"/>
                <path fill="#FBBC05" d="M5.6 13.72c-.22-.7-.35-1.43-.35-2.22s.13-1.52.35-2.22V6.32H1.74C.94 7.9.5 9.65.5 11.5s.44 3.6 1.24 5.18l3.86-2.96z"/>
                <path fill="#EA4335" d="M12 5.78c1.68 0 3.2.58 4.4 1.72l3.3-3.3C17.7 2.4 15.1 1.5 12 1.5 7.5 1.5 3.63 3.97 1.74 7.32l3.86 2.96C6.5 7.78 9.02 5.78 12 5.78z"/>
              </svg>
              Continue with Google
            </button>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or email <span className="h-px flex-1 bg-border" />
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <input
              type="email" required autoComplete="email" placeholder="you@honest.money"
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
            <input
              type="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="Password (min 8 chars)"
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "signup" ? "Create vault" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            {mode === "signup" ? "Already minted?" : "New here?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="text-primary hover:underline"
            >
              {mode === "signup" ? "Sign in instead" : "Create a vault"}
            </button>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
