import { type OmniToken } from "@/lib/chains.functions";
import { fmtAmount } from "@/lib/chains";
import { Layers } from "lucide-react";

const TOKEN_PALETTE = [
  "#E5B80B", // gold
  "#A8A29E", // silver
  "#CD7F32", // bronze
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EC4899", // pink
  "#8B5CF6", // violet
];

function tokenMonogram(name: string) {
  return name.split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase();
}

function tokenColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return TOKEN_PALETTE[Math.abs(hash) % TOKEN_PALETTE.length];
}

export function TokenList({ tokens, chain }: { tokens: OmniToken[]; chain: string }) {
  if (tokens.length === 0) return null;

  return (
    <div className="mt-6 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="size-3.5 text-muted-foreground" />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Layer-2 tokens · {chain.toUpperCase()}
        </p>
      </div>

      <ul className="space-y-2">
        {tokens.map(t => {
          const color = tokenColor(t.name);
          return (
            <li
              key={t.propertyId}
              className="group flex items-center gap-3 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 transition hover:border-primary/30 hover:bg-secondary/70"
            >
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 font-mono text-[10px] font-semibold text-white shadow-sm"
                style={{ backgroundColor: color }}
                aria-hidden
              >
                {tokenMonogram(t.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-sm text-foreground">{t.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {t.ticker ? `${t.ticker} · ` : ""}#{t.propertyId}
                </p>
              </div>
              <p className="num shrink-0 font-mono text-sm text-foreground">
                {fmtAmount(t.balance, 8, 6)}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
