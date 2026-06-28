import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { verifyMintRecord } from "@/lib/chains.functions";
import { CHAIN_OPTIONS, CHAINS, type ChainId } from "@/lib/chains";
import { ShieldCheck, Coins, Keyboard, QrCode } from "lucide-react";
import { toast } from "sonner";
import { QrScanner } from "@/components/QrScanner";
import { parseCoinPayload, detectChain } from "@/lib/parseCoinPayload";
import { addLocalCoin } from "@/lib/localPortfolio";
import { CoinLogo } from "@/components/CoinLogo";
import QRCode from "qrcode";

export const Route = createFileRoute("/_app/scan")({
  head: () => ({ meta: [{ title: "Scan — Blockchain Mint" }] }),
  component: ScanPage,
});

function ScanPage() {
  const navigate = useNavigate();
  const [manual, setManual] = useState(false);
  const [scanned, setScanned] = useState<{ chain: ChainId; address: string } | null>(null);
  const [chain, setChain] = useState<ChainId>("btc");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const verifyFn = useServerFn(verifyMintRecord);

  const verify = useMutation({
    mutationFn: () => verifyFn({ data: { chain, address: address.trim() } }),
    onSuccess: () => {
      navigate({ to: "/verify/$chain/$address", params: { chain, address: address.trim() } });
    },
    onError: e => toast.error((e as Error).message),
  });

  function handleAdd() {
    const detected = detectChain(address.trim()) ?? { chain, address: address.trim() };
    const coin = addLocalCoin({ chain: detected.chain, address: detected.address, label: label.trim() || undefined });
    toast.success("Coin added to your portfolio.");
    navigate({ to: "/coin/$id", params: { id: coin.id } });
  }

  function handleScanned(text: string) {
    if (scanned) return;
    const parsed = parseCoinPayload(text);
    if (!parsed) {
      toast.error("That doesn't look like a coin QR. Try again or enter the address.");
      return;
    }
    setScanned(parsed);
    setChain(parsed.chain);
    setAddress(parsed.address);
  }

  function confirmScanned() {
    if (!scanned) return;
    const coin = addLocalCoin({ chain: scanned.chain, address: scanned.address, label: label.trim() || undefined });
    toast.success("Coin added.");
    navigate({ to: "/coin/$id", params: { id: coin.id } });
  }

  function verifyScanned() {
    if (!scanned) return;
    navigate({ to: "/verify/$chain/$address", params: { chain: scanned.chain, address: scanned.address } });
  }

  useEffect(() => {
    if (!scanned || !showQr) { setQrDataUrl(null); return; }
    let cancelled = false;
    QRCode.toDataURL(scanned.address, { margin: 1, width: 320, color: { dark: "#000000", light: "#ffffff" } })
      .then(url => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [scanned, showQr]);



  return (
    <div className="px-5 pt-10">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Add a coin</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Scan or enter</h1>
      </header>

      {!manual && (
        <>
          <QrScanner onResult={handleScanned} paused={!!scanned} />

          {scanned && (
            <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
              <div className="flex items-center gap-3">
                <CoinLogo chain={scanned.chain} size={40} />
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                    Detected {CHAINS[scanned.chain].name}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-xs text-foreground">{scanned.address}</p>
                </div>
              </div>

              <button
                onClick={() => setShowQr(v => !v)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <QrCode className="size-3.5" /> {showQr ? "Hide QR code" : "Show QR code"}
              </button>
              {showQr && qrDataUrl && (
                <div className="mt-3 flex justify-center rounded-lg bg-white p-3">
                  <img src={qrDataUrl} alt="Address QR code" className="size-56" />
                </div>
              )}

              <input
                type="text" value={label} onChange={e => setLabel(e.target.value)}
                placeholder="Label (optional) — e.g. 'Birthday 2024'"
                className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={verifyScanned}
                  className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-secondary/80"
                >
                  <ShieldCheck className="size-4" /> Verify
                </button>
                <button
                  onClick={confirmScanned}
                  className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Coins className="size-4" /> Add coin
                </button>
              </div>
              <button
                onClick={() => { setScanned(null); setAddress(""); setLabel(""); setShowQr(false); }}
                className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
              >
                Scan a different coin
              </button>
            </div>
          )}

          <button
            onClick={() => setManual(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Keyboard className="size-3.5" /> Enter address manually
          </button>
        </>
      )}

      {manual && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Chain</span>
            <select
              value={chain}
              onChange={e => setChain(e.target.value as ChainId)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            >
              {CHAIN_OPTIONS.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.ticker}){c.liveInPhase1 ? "" : " — Phase 3"}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Address</span>
            <input
              type="text" value={address} onChange={e => setAddress(e.target.value)}
              placeholder="Paste the public address engraved on the coin"
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-xs focus:border-ring focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Label (optional)</span>
            <input
              type="text" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. 'Birthday 2024'"
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              disabled={!address || verify.isPending}
              onClick={() => verify.mutate()}
              className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50"
            >
              <ShieldCheck className="size-4" /> Verify
            </button>
            <button
              disabled={!address}
              onClick={handleAdd}
              className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Coins className="size-4" /> Add coin
            </button>
          </div>

          <button
            onClick={() => setManual(false)}
            className="mt-1 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
          >
            Use camera instead
          </button>
        </div>
      )}
    </div>
  );
}
