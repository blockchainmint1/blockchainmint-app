/**
 * Chain metadata and formatters shared across client and server.
 * Phase 1 launches BTC, ETH, TXC with live lookups. The rest are listed so
 * UI surfaces (filters, dropdowns, shop) work end-to-end; their adapters
 * land in Phase 3.
 */

export type ChainId =
  | "btc"
  | "eth"
  | "ltc"
  | "doge"
  | "bch"
  | "bsc"
  | "ada"
  | "sol"
  | "bnb"
  | "txc"
  | "iskander";

export type Metal = "gold" | "silver" | "copper" | "brass";

export const CHAINS: Record<
  ChainId,
  {
    id: ChainId;
    name: string;
    ticker: string;
    decimals: number;
    color: string; // for chain dot, hex for SSR consistency
    explorer: (addr: string) => string;
    liveInPhase1: boolean;
  }
> = {
  btc:      { id: "btc",      name: "Bitcoin",     ticker: "BTC", decimals: 8,  color: "#f7931a", explorer: a => `https://mempool.space/address/${a}`,       liveInPhase1: true  },
  eth:      { id: "eth",      name: "Ethereum",    ticker: "ETH", decimals: 18, color: "#627eea", explorer: a => `https://etherscan.io/address/${a}`,         liveInPhase1: true  },
  ltc:      { id: "ltc",      name: "Litecoin",    ticker: "LTC", decimals: 8,  color: "#bfbbbb", explorer: a => `https://blockchair.com/litecoin/address/${a}`, liveInPhase1: false },
  doge:     { id: "doge",     name: "Dogecoin",    ticker: "DOGE",decimals: 8,  color: "#c2a633", explorer: a => `https://blockchair.com/dogecoin/address/${a}`, liveInPhase1: false },
  bch:      { id: "bch",      name: "Bitcoin Cash",ticker: "BCH", decimals: 8,  color: "#0ac18e", explorer: a => `https://blockchair.com/bitcoin-cash/address/${a}`, liveInPhase1: false },
  bsc:      { id: "bsc",      name: "BNB Smart Chain", ticker: "BNB", decimals: 18, color: "#f0b90b", explorer: a => `https://bscscan.com/address/${a}`,       liveInPhase1: false },
  ada:      { id: "ada",      name: "Cardano",     ticker: "ADA", decimals: 6,  color: "#0033ad", explorer: a => `https://cardanoscan.io/address/${a}`,        liveInPhase1: false },
  sol:      { id: "sol",      name: "Solana",      ticker: "SOL", decimals: 9,  color: "#9945ff", explorer: a => `https://solscan.io/account/${a}`,            liveInPhase1: false },
  bnb:      { id: "bnb",      name: "BNB Beacon",  ticker: "BNB", decimals: 8,  color: "#f0b90b", explorer: a => `https://explorer.bnbchain.org/address/${a}`, liveInPhase1: false },
  txc:      { id: "txc",      name: "TEXITcoin",   ticker: "TXC", decimals: 8,  color: "#bf2e1e", explorer: a => `https://explorer.texitcoin.org/address/${a}`, liveInPhase1: true  },
  iskander: { id: "iskander", name: "Iskander",    ticker: "ISK", decimals: 8,  color: "#2e8bbf", explorer: a => `#`,                                          liveInPhase1: false },
};

export const CHAIN_OPTIONS = Object.values(CHAINS);

export function shortAddr(addr: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function fmtAmount(amount: number, decimals = 8, max = 6): string {
  if (!isFinite(amount)) return "—";
  const fixed = amount.toFixed(Math.min(decimals, max));
  // Trim trailing zeros but keep at least 2 decimals for currency-like feel
  return fixed.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, ".00");
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 ? 0 : 2,
  });
}

export function metalForChain(c: ChainId): Metal {
  switch (c) {
    case "btc": return "gold";
    case "eth": return "silver";
    case "txc": return "copper";
    case "doge": return "brass";
    case "sol": return "silver";
    case "ltc": return "silver";
    case "bch": return "silver";
    case "ada": return "silver";
    case "bsc": return "brass";
    case "bnb": return "brass";
    case "iskander": return "copper";
  }
}
