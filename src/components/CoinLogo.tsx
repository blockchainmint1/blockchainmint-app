import { useState } from "react";
import { CoinMedallion } from "./CoinMedallion";
import type { ChainId } from "@/lib/chains";
import txcIcon from "@/assets/txc-icon.png.asset.json";

/**
 * Small color logo for a chain. Sourced from the open-source
 * spothq/cryptocurrency-icons set via jsdelivr. TXC uses the official
 * TEXITcoin star mark struck into a copper medallion. Chains without an
 * icon fall back to the struck medallion.
 */
const LOGO_SLUG: Partial<Record<ChainId, string>> = {
  btc: "btc",
  eth: "eth",
  ltc: "ltc",
  doge: "doge",
  bch: "bch",
  bsc: "bnb",
  bnb: "bnb",
  ada: "ada",
  sol: "sol",
};

export function CoinLogo({
  chain,
  size = 40,
  className = "",
}: {
  chain: ChainId;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);

  if (chain === "txc") {
    return (
      <div
        className={`medallion-copper relative inline-flex items-center justify-center rounded-full ${className}`}
        style={{ width: size, height: size }}
        aria-label="TEXITcoin"
      >
        <span
          className="absolute inset-[6%] rounded-full"
          style={{
            boxShadow:
              "inset 0 0 0 1px oklch(0 0 0 / 0.25), inset 0 0 0 2px oklch(1 0 0 / 0.15)",
          }}
        />
        <img
          src={txcIcon.url}
          alt="TEXITcoin"
          className="relative"
          style={{ width: size * 0.62, height: size * 0.62, objectFit: "contain" }}
          loading="lazy"
        />
      </div>
    );
  }

  const slug = LOGO_SLUG[chain];
  if (!slug || errored) {
    return <CoinMedallion chain={chain} size={size} className={className} />;
  }
  return (
    <img
      src={`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${slug}.svg`}
      alt={`${chain} logo`}
      width={size}
      height={size}
      className={`shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size }}
      onError={() => setErrored(true)}
      loading="lazy"
    />
  );
}
