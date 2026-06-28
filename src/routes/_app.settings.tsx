import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { LogOut, FileText, Shield, BookOpen, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Blockchain Mint" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "signin" } });
  }
  return (
    <div className="px-5 pt-10">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Settings</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">{user?.email}</h1>
      </header>

      <ul className="space-y-2">
        <SettingLink to="/about" icon={<BookOpen className="size-4" />} title="About" />
        <SettingLink to="/manifesto" icon={<FileText className="size-4" />} title="Manifesto" />
        <SettingLink to="/terms" icon={<FileText className="size-4" />} title="Terms" />
        <SettingLink to="/privacy" icon={<Shield className="size-4" />} title="Privacy" />
        <li>
          <a href="https://honest.money" target="_blank" rel="noopener noreferrer"
             className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition hover:border-primary/40">
            <span className="flex items-center gap-3 text-sm"><ExternalLink className="size-4" /> honest.money</span>
            <span className="text-[11px] text-muted-foreground">visit</span>
          </a>
        </li>
      </ul>

      <button
        onClick={signOut}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-md border border-destructive/40 px-4 py-2.5 text-sm font-medium text-destructive transition hover:bg-destructive/10"
      >
        <LogOut className="size-4" /> Sign out
      </button>

      <Footer />
    </div>
  );
}

function SettingLink({ to, icon, title }: { to: string; icon: React.ReactNode; title: string }) {
  return (
    <li>
      <Link to={to} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition hover:border-primary/40">
        <span className="flex items-center gap-3 text-sm">{icon} {title}</span>
        <span className="text-[11px] text-muted-foreground">›</span>
      </Link>
    </li>
  );
}
