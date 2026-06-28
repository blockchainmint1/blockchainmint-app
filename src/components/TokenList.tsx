import { useMemo, useState } from "react";
import { type Layer2Token } from "@/lib/chains.functions";
import { fmtAmount } from "@/lib/chains";
import { useHiddenTokens } from "@/lib/hiddenTokens";
import { Layers, ChevronDown, EyeOff, Eye, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TOKEN_PALETTE = [
  "#E5B80B", "#A8A29E", "#CD7F32", "#3B82F6",
  "#10B981", "#F59E0B", "#EC4899", "#8B5CF6",
];

function tokenMonogram(name: string) {
  return name.split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase();
}
function tokenColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return TOKEN_PALETTE[Math.abs(hash) % TOKEN_PALETTE.length];
}

const COLLAPSED_COUNT = 5;

export function TokenList({ tokens, chain }: { tokens: Layer2Token[]; chain: string }) {
  const { isHidden, hide, unhide } = useHiddenTokens(chain);
  const [expanded, setExpanded] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const { visible, hidden } = useMemo(() => {
    const visible: Layer2Token[] = [];
    const hidden: Layer2Token[] = [];
    for (const t of tokens) (isHidden(t.id) ? hidden : visible).push(t);
    return { visible, hidden };
  }, [tokens, isHidden]);

  if (tokens.length === 0) return null;

  const collapsible = visible.length > COLLAPSED_COUNT;
  const shown = collapsible && !expanded ? visible.slice(0, COLLAPSED_COUNT) : visible;
  const hiddenCount = visible.length - shown.length;

  return (
    <div className="mt-6 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="size-3.5 text-muted-foreground" />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Layer-2 tokens · {chain.toUpperCase()} · {visible.length}
          </p>
        </div>
        {hidden.length > 0 && (
          <button
            onClick={() => setShowHidden(v => !v)}
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {showHidden ? "Hide archived" : `${hidden.length} archived`}
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {shown.map(t => (
          <TokenRow key={t.id} t={t} onHide={() => hide(t.id)} />
        ))}
      </ul>

      {collapsible && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
        >
          <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Show fewer" : `Show ${hiddenCount} more`}
        </button>
      )}

      {showHidden && hidden.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Archived</p>
          <ul className="space-y-2">
            {hidden.map(t => (
              <TokenRow key={t.id} t={t} archived onUnhide={() => unhide(t.id)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TokenRow({
  t, archived, onHide, onUnhide,
}: {
  t: Layer2Token;
  archived?: boolean;
  onHide?: () => void;
  onUnhide?: () => void;
}) {
  const color = tokenColor(t.name);
  return (
    <li
      className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
        archived
          ? "border-border/40 bg-secondary/20 opacity-60 hover:opacity-100"
          : "border-border/60 bg-secondary/40 hover:border-primary/30 hover:bg-secondary/70"
      }`}
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
          {t.ticker ? `${t.ticker} · ` : ""}
          {t.type === "omni" ? `#${t.id}` : `${t.id.slice(0, 6)}…${t.id.slice(-4)}`}
        </p>
      </div>
      <p className="num shrink-0 font-mono text-sm text-foreground">
        {fmtAmount(t.balance, t.divisible ? 8 : 0, 6)}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Token actions"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <MoreVertical className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {archived ? (
            <DropdownMenuItem onSelect={onUnhide}>
              <Eye className="size-4" /> Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onHide}>
              <EyeOff className="size-4" /> Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
