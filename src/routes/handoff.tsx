import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { encodePayload, isAllowedOrigin, type HandoffCoin } from "@/lib/handoff";

export const Route = createFileRoute("/handoff")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Transfer coin list — Blockchain Mint" },
      {
        name: "description",
        content: "Hand your saved coin list from an older Blockchain Mint domain over to the current app.",
      },
      { property: "og:title", content: "Transfer coin list — Blockchain Mint" },
      {
        property: "og:description",
        content: "Move your locally saved coin list from an older Blockchain Mint web address.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HandoffPage,
});

const PORTFOLIO_KEY = "csc.portfolio.v1";

function readLocalCoins(): HandoffCoin[] {
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c: any) => c && typeof c.address === "string" && typeof c.chain === "string")
      .map((c: any) => ({
        chain: String(c.chain),
        address: String(c.address),
        label: typeof c.label === "string" ? c.label : undefined,
        addedAt: typeof c.addedAt === "number" ? c.addedAt : undefined,
      }));
  } catch {
    return [];
  }
}

function HandoffPage() {
  const [status, setStatus] = useState<"working" | "blocked" | "empty">("working");
  const [count, setCount] = useState(0);

  useEffect(() => {
    const to = new URLSearchParams(window.location.search).get("to") ?? "";
    if (!to || !isAllowedOrigin(to)) {
      setStatus("blocked");
      return;
    }
    const coins = readLocalCoins();
    setCount(coins.length);
    const payload = encodePayload({ v: 1, from: window.location.origin, coins });
    const target = new URL(to);
    // Fragment, not query: the list never touches a server log.
    window.location.replace(`${target.origin}/recover#d=${payload}`);
  }, []);

  return (
    <div className="mx-auto max-w-md px-5 py-16 text-center">
      <h1 className="font-serif text-2xl text-foreground">
        {status === "blocked" ? "Transfer not allowed" : "Sending your coin list…"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {status === "blocked"
          ? "This transfer link is missing a valid destination. Start the transfer from the app you want to move your list into."
          : `Handing ${count} saved ${count === 1 ? "coin" : "coins"} back to the app. This page redirects on its own.`}
      </p>
    </div>
  );
}
