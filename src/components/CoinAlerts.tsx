/**
 * Per-coin alert configuration: incoming toggle + balance/price thresholds.
 * Stored locally via useAlertRule; backend sync runs from useAlertsAutoSync.
 */
import { Bell } from "lucide-react";
import type { ChainId } from "@/lib/chains";
import { useAlertRule } from "@/lib/alertRules";

type Props = { chain: ChainId; address: string; ticker: string };

export function CoinAlerts({ chain, address, ticker }: Props) {
  const { rule, update } = useAlertRule(chain, address);

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <Bell className="size-4 text-primary" />
        <h2 className="font-serif text-base text-foreground">Notifications</h2>
      </header>

      <label className="mt-4 flex items-center justify-between text-sm">
        <span className="text-foreground">Incoming funds</span>
        <input
          type="checkbox"
          checked={rule.incoming}
          onChange={e => update({ incoming: e.target.checked })}
          className="size-4 accent-primary"
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <ThresholdField
          label={`Balance ≥ (${ticker})`}
          value={rule.balance_above}
          onChange={v => update({ balance_above: v })}
        />
        <ThresholdField
          label={`Balance ≤ (${ticker})`}
          value={rule.balance_below}
          onChange={v => update({ balance_below: v })}
        />
        <ThresholdField
          label="Price ≥ (USD)"
          value={rule.price_above}
          onChange={v => update({ price_above: v })}
        />
        <ThresholdField
          label="Price ≤ (USD)"
          value={rule.price_below}
          onChange={v => update({ price_below: v })}
        />
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Checked every 15 minutes. Push delivery turns on automatically once you install the app from the store.
      </p>
    </section>
  );
}

function ThresholdField({
  label, value, onChange,
}: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value ?? ""}
        placeholder="off"
        onChange={e => {
          const s = e.target.value.trim();
          onChange(s === "" ? null : Number(s));
        }}
        className="rounded-md border border-input bg-background px-2 py-1.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
