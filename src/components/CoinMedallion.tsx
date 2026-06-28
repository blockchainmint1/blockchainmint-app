import { CHAINS, type ChainId, type Metal, metalForChain } from "@/lib/chains";

/**
 * Struck round medallion with the chain ticker engraved in the center.
 * Sized by `size` (px). Uses CSS @utility metal classes from styles.css.
 */
export function CoinMedallion({
  chain,
  metal,
  size = 56,
  className = "",
}: {
  chain: ChainId;
  metal?: Metal;
  size?: number;
  className?: string;
}) {
  const m = metal ?? metalForChain(chain);
  const metalClass =
    m === "gold" ? "medallion-gold" :
    m === "silver" ? "medallion-silver" :
    m === "copper" ? "medallion-copper" : "medallion-brass";

  const fontSize = Math.max(10, Math.round(size * 0.28));
  return (
    <div
      className={`${metalClass} relative inline-flex items-center justify-center rounded-full ${className}`}
      style={{ width: size, height: size }}
      aria-label={`${CHAINS[chain].name} coin`}
    >
      {/* milled inner ring */}
      <span
        className="absolute inset-[6%] rounded-full"
        style={{
          boxShadow:
            "inset 0 0 0 1px oklch(0 0 0 / 0.25), inset 0 0 0 2px oklch(1 0 0 / 0.15)",
        }}
      />
      <span
        className="relative font-serif tracking-wider"
        style={{
          fontSize,
          color: m === "silver" ? "oklch(0.25 0 0)" : "oklch(0.2 0.02 60)",
          textShadow: "0 1px 0 oklch(1 0 0 / 0.35), 0 -1px 0 oklch(0 0 0 / 0.35)",
          fontWeight: 600,
        }}
      >
        {CHAINS[chain].ticker}
      </span>
    </div>
  );
}
