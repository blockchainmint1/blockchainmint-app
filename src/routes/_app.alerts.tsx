import { createFileRoute } from "@tanstack/react-router";
import { Bell, BellOff } from "lucide-react";

export const Route = createFileRoute("/_app/alerts")({
  head: () => ({ meta: [{ title: "Alerts — Blockchain Mint" }] }),
  component: AlertsPage,
});

function AlertsPage() {
  return (
    <div className="px-5 pt-10">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Alerts</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Notifications</h1>
      </header>

      <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
        <BellOff className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-3 font-serif text-lg text-foreground">Push wiring lands in Phase 2</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Once the app is wrapped in Capacitor, your device registers a token here and you'll get a push every time a watched coin moves.
        </p>
      </div>

      <ul className="mt-6 space-y-3">
        {[
          { kind: "Incoming funds",   desc: "Any deposit into a watched coin" },
          { kind: "Outgoing funds",   desc: "Any spend from a watched coin (you should never see this unless someone is sweeping)" },
          { kind: "Balance threshold",desc: "When a coin crosses a balance you set" },
          { kind: "Price threshold",  desc: "When the chain price hits your target" },
        ].map(rule => (
          <li key={rule.kind} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
            <Bell className="mt-0.5 size-4 text-primary" />
            <div>
              <p className="font-serif text-sm text-foreground">{rule.kind}</p>
              <p className="text-xs text-muted-foreground">{rule.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
