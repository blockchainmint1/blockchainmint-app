import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useVerifyMintRecord, useLookupAssetId } from "@/lib/api/backendClient";
import { useBackend } from "@/lib/backend";
import { CHAIN_OPTIONS, CHAINS, cscId, type ChainId } from "@/lib/chains";
import { ShieldCheck, Coins, Keyboard, QrCode, CheckCircle2, XCircle, ScanLine, Hash, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { QrScanner } from "@/components/QrScanner";
import { parseCoinPayload, detectChain } from "@/lib/parseCoinPayload";
import { parseSeedPhrase, parseSticker, type SeedParseResult } from "@/lib/seedToAddress";
import { addLocalCoin } from "@/lib/localPortfolio";
import { CoinLogo } from "@/components/CoinLogo";
import QRCode from "qrcode";

export const Route = createFileRoute("/_app/scan")({
  head: () => ({ meta: [{ title: "Scan — Blockchain Mint" }] }),
  component: ScanPage,
});

type CoinScan = { type: "coin"; chain: ChainId; address: string };
type SeedScan = { type: "seed"; result: SeedParseResult };
type ScannedResult = CoinScan | SeedScan;

type StickerMatch = {
  address: string;
  assetId: string;
  addressOk: boolean;
  assetIdOk: boolean;
};

function ScanPage() {
  const navigate = useNavigate();
  const [manual, setManual] = useState(false);
  const [scanned, setScanned] = useState<ScannedResult | null>(null);
  const [stickerMode, setStickerMode] = useState(false);
  const [stickerResult, setStickerResult] = useState<StickerMatch | null>(null);
  const [chain, setChain] = useState<ChainId>("btc");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [assetIdMode, setAssetIdMode] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const verifyFn = useVerifyMintRecord();

  const verify = useMutation({
    mutationFn: () => verifyFn({ data: { chain, address: address.trim() } }),
    onSuccess: () => {
      navigate({ to: "/verify/$chain/$address", params: { chain, address: address.trim() } });
    },
    onError: e => toast.error((e as Error).message),
  });

  function reset() {
    setScanned(null);
    setStickerMode(false);
    setStickerResult(null);
    setAddress("");
    setLabel("");
    setShowQr(false);
    setQrDataUrl(null);
  }

  function handleAdd() {
    const detected = detectChain(address.trim()) ?? { chain, address: address.trim() };
    const coin = addLocalCoin({ chain: detected.chain, address: detected.address, label: label.trim() || undefined });
    toast.success("Coin added to your portfolio.");
    navigate({ to: "/coin/$id", params: { id: coin.id } });
  }

  function handleScanned(text: string) {
    // If we are actively verifying a sticker, only accept sticker-format QRs.
    if (stickerMode) {
      const sticker = parseSticker(text);
      if (!sticker) {
        toast.error("That doesn't look like a sticker QR. Expected: address,AssetID");
        return;
      }
      if (scanned?.type !== "seed") {
        toast.error("Scan the coin's seed phrase first.");
        return;
      }
      // Match against the derived address for whichever chain the sticker is.
      const expected =
        scanned.result.candidates.find(c => c.chain === sticker.chain) ?? scanned.result;
      setStickerResult({
        address: sticker.address,
        assetId: sticker.assetId,
        addressOk: sticker.address === expected.address,
        assetIdOk: sticker.assetId === expected.assetId,
      });
      return;
    }

    // If something is already shown, don't keep scanning until reset.
    if (scanned) return;

    // 1. Try to interpret it as a BIP-39 seed phrase for TXC / ISK QA.
    const seed = parseSeedPhrase(text);
    if (seed.ok) {
      setScanned({ type: "seed", result: seed });
      setChain("txc");
      setAddress(seed.address);
      toast.success(`Detected ${seed.wordCount}-word seed phrase.`);
      return;
    }

    // 2. Fall back to normal coin address / BIP-21 URI parsing.
    const parsed = parseCoinPayload(text);
    if (!parsed) {
      toast.error("That doesn't look like a coin QR or seed phrase. Try again or enter the address.");
      return;
    }
    setScanned({ type: "coin", chain: parsed.chain, address: parsed.address });
    setChain(parsed.chain);
    setAddress(parsed.address);
  }

  function confirmScanned() {
    if (!scanned || scanned.type === "seed") return;
    const coin = addLocalCoin({ chain: scanned.chain, address: scanned.address, label: label.trim() || undefined });
    toast.success("Coin added.");
    navigate({ to: "/coin/$id", params: { id: coin.id } });
  }

  function verifyScanned() {
    if (!scanned) return;
    const { chain: verifyChain, address: verifyAddress } = scanned.type === "seed"
      ? { chain: "txc" as ChainId, address: scanned.result.address }
      : { chain: scanned.chain, address: scanned.address };
    navigate({ to: "/verify/$chain/$address", params: { chain: verifyChain, address: verifyAddress } });
  }

  function addDerivedTxc() {
    if (scanned?.type !== "seed") return;
    const coin = addLocalCoin({ chain: "txc", address: scanned.result.address, label: label.trim() || undefined });
    toast.success("TXC coin added.");
    navigate({ to: "/coin/$id", params: { id: coin.id } });
  }

  useEffect(() => {
    if (!scanned || !showQr) { setQrDataUrl(null); return; }
    const addr = scanned.type === "seed" ? scanned.result.address : scanned.address;
    let cancelled = false;
    QRCode.toDataURL(addr, { margin: 1, width: 320, color: { dark: "#000000", light: "#ffffff" } })
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
          <QrScanner onResult={handleScanned} paused={!!scanned && !stickerMode} />

          {scanned?.type === "seed" && (
            <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
              <div className="flex items-center gap-3">
                <CoinLogo chain="txc" size={40} />
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                    TXC {scanned.result.wordCount}-word seed
                  </p>
                  <p className="mt-0.5 break-all font-mono text-xs text-foreground">{scanned.result.address}</p>
                </div>
              </div>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Asset ID <span className="text-foreground">{scanned.result.assetId}</span>
              </p>

              <AuthenticityBadge chain="txc" address={scanned.result.address} />


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
                  onClick={() => { setStickerMode(true); setStickerResult(null); }}
                  className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-secondary/80"
                >
                  <ScanLine className="size-4" /> Verify sticker
                </button>
                <button
                  onClick={addDerivedTxc}
                  className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Coins className="size-4" /> Add coin
                </button>
              </div>
              <button
                onClick={() => verifyScanned()}
                className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
              >
                Verify mint record for this address
              </button>
              <button
                onClick={reset}
                className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
              >
                Scan a different coin
              </button>
            </div>
          )}

          {stickerMode && !stickerResult && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-sm font-medium text-foreground">Scan the sticker QR</p>
              <p className="mt-1 text-xs text-muted-foreground">Point the camera at the sticker to verify it matches this coin.</p>
            </div>
          )}

          {stickerResult && (
            <div className={`mt-4 rounded-xl border p-4 ${stickerResult.addressOk && stickerResult.assetIdOk ? "border-green-500/40 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}`}>
              <div className="flex items-center gap-2">
                {stickerResult.addressOk && stickerResult.assetIdOk ? (
                  <CheckCircle2 className="size-5 text-green-500" />
                ) : (
                  <XCircle className="size-5 text-destructive" />
                )}
                <p className={`text-sm font-semibold ${stickerResult.addressOk && stickerResult.assetIdOk ? "text-green-600" : "text-destructive"}`}>
                  {stickerResult.addressOk && stickerResult.assetIdOk ? "Sticker matches coin" : "MISMATCH — do not apply sticker"}
                </p>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <p className="text-muted-foreground">Sticker address: <span className="font-mono text-foreground">{stickerResult.address}</span></p>
                <p className="text-muted-foreground">Sticker Asset ID: <span className="font-mono text-foreground">{stickerResult.assetId}</span></p>
                {!stickerResult.addressOk && <p className="text-destructive">Address does not match derived address.</p>}
                {!stickerResult.assetIdOk && <p className="text-destructive">Asset ID does not match.</p>}
              </div>
              <button
                onClick={() => { setStickerResult(null); }}
                className="mt-3 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
              >
                Scan sticker again
              </button>
              <button
                onClick={reset}
                className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
              >
                Scan a different coin
              </button>
            </div>
          )}

          {scanned?.type === "coin" && (
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

              <AuthenticityBadge chain={scanned.chain} address={scanned.address} />


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
                  onClick={() => verifyScanned()}
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
                onClick={reset}
                className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
              >
                Scan a different coin
              </button>
            </div>
          )}

          {!scanned && (
            <button
              onClick={() => setManual(true)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Keyboard className="size-3.5" /> Enter address manually
            </button>
          )}
          {!scanned && (
            <button
              onClick={() => { setManual(true); setAssetIdMode(true); }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Hash className="size-3.5" /> Add by 6-digit Coin ID
            </button>
          )}
        </>
      )}

      {manual && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <AssetIdLookup
            open={assetIdMode}
            onToggle={() => setAssetIdMode(v => !v)}
            onResolved={(c, a) => { setChain(c); setAddress(a); setAssetIdMode(false); }}
          />

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

/**
 * Checks a scanned public key against the Blockchain Mint registry and shows
 * an "Authentic" badge the moment it comes back.
 */
function AuthenticityBadge({ chain, address }: { chain: ChainId; address: string }) {
  const verifyFn = useVerifyMintRecord();
  const { backend } = useBackend();
  const { data, isLoading } = useQuery({
    queryKey: ["mint-verify", backend, chain, address],
    queryFn: () => verifyFn({ data: { chain, address } }),
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Checking the mint registry…
      </div>
    );
  }
  if (!data) return null;

  if (data.authentic) {
    const assetId = "assetId" in data ? data.assetId : null;
    return (
      <div className="mt-3 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-500" />
          <p className="text-sm font-semibold text-green-600">Authentic Blockchain Mint coin</p>
        </div>
        {assetId && (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Asset ID <span className="text-foreground">{assetId}</span>
          </p>
        )}
        {"registry" in data && data.registry?.blockchainName && (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {data.registry.blockchainName}
            {data.registry.activationStatus === false ? " — not yet activated" : ""}
          </p>
        )}
      </div>
    );
  }

  if ("unavailable" in data && data.unavailable) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs text-muted-foreground">
        <ShieldAlert className="size-4 text-accent" /> Registry unreachable — try again shortly.
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
      <XCircle className="size-5 text-destructive" />
      <p className="text-xs font-medium text-destructive">
        Not found in the mint registry — this isn't a coin we manufactured.
      </p>
    </div>
  );
}

/** Manual entry of the six-digit Coin ID printed on the sticker. */
function AssetIdLookup({
  open,
  onToggle,
  onResolved,
}: {
  open: boolean;
  onToggle: () => void;
  onResolved: (chain: ChainId, address: string) => void;
}) {
  const [value, setValue] = useState("");
  const lookupFn = useLookupAssetId();

  const lookup = useMutation({
    mutationFn: () => lookupFn({ data: { assetId: value } }),
    onSuccess: res => {
      if (!res.found) {
        toast.error(
          res.reason === "invalid"
            ? "Coin IDs are 6 characters (letters and numbers)."
            : res.reason === "unavailable"
              ? "Couldn't reach the mint registry — try again in a moment."
              : "No coin with that ID in the mint registry. Double-check the characters (they're case-sensitive).",
        );
        return;
      }
      onResolved(res.chain, res.address);
      toast.success(res.authentic ? "Authentic coin found." : "Coin found.");
    },
    onError: e => toast.error((e as Error).message),
  });

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Hash className="size-3.5" /> Look up by 6-digit Coin ID
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Coin ID (6 characters on the sticker)
      </span>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={6}
          value={value}
          onChange={e => setValue(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
          placeholder="yEh4Mc"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] focus:border-ring focus:outline-none"
        />
        <button
          disabled={value.length !== 6 || lookup.isPending}
          onClick={() => lookup.mutate()}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {lookup.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Find
        </button>
      </div>
      <button onClick={onToggle} className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground">
        Cancel
      </button>
    </div>
  );
}
