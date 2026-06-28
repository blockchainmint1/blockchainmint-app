import { createServerFn } from "@tanstack/react-start";
import type { ChainId } from "@/lib/chains";

export type ShopProduct = {
  name: string;
  tagline: string;
  price: string;
  spec: string;
  url: string;
  imageUrl: string;
  chain: ChainId | null;
};

const COLLECTION_URL = "https://blockchainmint.com/products?collection=cold-storage";

function detectChain(slugOrName: string): ChainId | null {
  const s = slugOrName.toLowerCase();
  if (s.includes("bitcoin") || /\bbtc\b/.test(s)) return "btc";
  if (s.includes("ethereum") || /\beth\b/.test(s)) return "eth";
  if (s.includes("texit") || /\btxc\b/.test(s)) return "txc";
  if (s.includes("doge")) return "doge";
  if (s.includes("litecoin") || /\bltc\b/.test(s)) return "ltc";
  if (s.includes("bitcoin-cash") || /\bbch\b/.test(s)) return "bch";
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

const FALLBACK: ShopProduct[] = [
  { chain: "btc", name: "Bitcoin BTC Cold Storage Wallet", tagline: "Tamper-evident physical BTC wallet for true cold custody", price: "$19.95", spec: ".999 fine copper", url: "https://blockchainmint.com/product/bitcoin-cold-storage-wallet", imageUrl: "" },
  { chain: "eth", name: "Ethereum ETH Cold Storage Wallet", tagline: "Physical ETH wallet — your private key under hologram", price: "$19.95", spec: ".999 fine copper", url: "https://blockchainmint.com/product/ethereum-cold-storage-wallet", imageUrl: "" },
  { chain: "txc", name: "TEXITcoin TXC Cold Storage Wallet", tagline: "Sovereign-series TXC wallet — minted in the spirit of the Republic", price: "$19.95", spec: ".999 fine copper", url: "https://blockchainmint.com/product/texitcoin-cold-storage-wallet", imageUrl: "" },
  { chain: "doge", name: "DogeCoin DOGE Cold Storage Wallet", tagline: "Much wallet. Very cold. Such storage.", price: "$19.95", spec: ".999 fine copper", url: "https://blockchainmint.com/product/dogecoin-cold-storage-wallet", imageUrl: "" },
  { chain: "ltc", name: "Litecoin LTC Cold Storage Wallet", tagline: "Secure your Litecoin with a tangible, high-quality cold storage solution.", price: "$19.95", spec: ".999 fine copper", url: "https://blockchainmint.com/product/litecoin-ltc-cold-storage-wallet", imageUrl: "" },
];

type CacheEntry = { at: number; data: ShopProduct[] };
let cache: CacheEntry | null = null;
const TTL_MS = 60 * 60 * 1000; // 1 hour

async function scrapeCollection(): Promise<ShopProduct[]> {
  const res = await fetch(COLLECTION_URL, {
    headers: { "user-agent": "Mozilla/5.0 BlockchainMintApp/1.0" },
  });
  if (!res.ok) throw new Error(`Collection fetch failed: ${res.status}`);
  const html = await res.text();

  // Find every product card by anchor to /product/<slug>
  const products: ShopProduct[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a[^>]+href="(https:\/\/blockchainmint\.com\/product\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const url = m[1];
    if (seen.has(url)) continue;
    const inner = m[2];

    // Extract image
    const imgMatch = inner.match(/<img[^>]+src="([^"]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : "";

    // Strip tags then split lines
    const text = decodeEntities(
      inner
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<style[\s\S]*?<\/style>/g, "")
        .replace(/<[^>]+>/g, "\n"),
    );
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

    // Find name = first line that contains "Wallet" or "Terminal" or matches product
    const nameLine = lines.find(l => /Wallet|Terminal|Coin|Set/i.test(l) && l.length < 120 && !/View Details|Featured|New|Cold Storage Coins|TEXITcoin/i.test(l));
    if (!nameLine) continue;

    // Price = first $X line
    const priceLine = lines.find(l => /^\$\d/.test(l)) ?? "";

    // Tagline = the line after the name that isn't price/spec
    const nameIdx = lines.indexOf(nameLine);
    const tagline = lines.slice(nameIdx + 1).find(l => !/^\$\d/.test(l) && !/999 fine copper/i.test(l) && l.length > 8) ?? "";

    const specLine = lines.find(l => /999 fine copper/i.test(l));
    const spec = specLine ? ".999 fine copper" : "Accessory";

    const slug = url.split("/").pop() ?? "";
    const chain = detectChain(`${slug} ${nameLine}`);

    // Filter: only cold storage coins (must have a chain)
    if (!chain) continue;

    products.push({ name: nameLine, tagline, price: priceLine, spec, url, imageUrl, chain });
    seen.add(url);
  }

  return products.length ? products : FALLBACK;
}

export const listShopProducts = createServerFn({ method: "GET" }).handler(async () => {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;
  try {
    const data = await scrapeCollection();
    cache = { at: now, data };
    return data;
  } catch (err) {
    console.error("[shop] scrape failed, using fallback:", err);
    if (cache) return cache.data;
    return FALLBACK;
  }
});
