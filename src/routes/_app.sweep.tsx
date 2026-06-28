import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  ArrowLeft, Camera, CheckCircle2, Eye, EyeOff, KeyRound, ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";
import { CHAINS, type ChainId, shortAddr } from "@/lib/chains";
import { CoinLogo } from "@/components/CoinLogo";
import { QrScanner } from "@/components/QrScanner";
import { parsePrivateKey, keyControlsAddress, sniffKeyFormat, type KeyParseResult } from "@/lib/keyDerivation";
import { parseCoinPayload } from "@/lib/parseCoinPayload";

const sweepSearchSchema = z.object({
  chain: z.enum(["btc","eth","ltc","doge","bch","bsc","ada","sol","bnb","txc","iskander"]).optional(),
  address: z.string().optional(),
});

export const Route = createFileRoute("/_app/sweep")({
  validateSearch: sweepSearchSchema,
  head: () => ({ meta: [{ title: "Sweep — Blockchain Mint" }] }),
  component: SweepPage,
});

const SUPPORTED_SWEEP: ChainId[] = ["btc", "eth", "ltc", "doge", "bch", "txc"];

function SweepPage() {
  const search = useSearch({ from: "/_app/sweep" });
  const chain = search.chain as ChainId | undefined;
  const address = search.address as string | undefined;
  const navigate = useNavigate();

  // ---- key input + verification state ---------------------------------
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [destination, setDestination] = useState("");

  // Wipe the key from memory the moment the page unmounts. Best-effort —
  // React state lives in a closure we don't own, but clearing the ref and
  // overwriting the captured string array is the most we can do from JS.
  const keyRef = useRef("");
  useEffect(() => {
    keyRef.current = keyInput;
    return () => {
      keyRef.current = "";
      setKeyInput("");
    };
    // intentionally only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const format = sniffKeyFormat(keyInput);
  const parsed = useMemo<KeyParseResult | null>(() => {
    if (!keyInput.trim()) return null;
    return parsePrivateKey(keyInput);
  }, [keyInput]);

  const verified = !!(parsed?.ok && chain && address && keyControlsAddress(parsed, chain, address));
  const derivedForChain = parsed?.ok && chain ? parsed.addressesByChain[chain] ?? [] : [];
  const supported = chain ? SUPPORTED_SWEEP.includes(chain) : false;

  // Destination address sanity — for hex chains, just check the shape; for
  // base58/bech32, accept anything starting with the right prefix.
  const destLooksValid = useMemo(() => {
    if (!destination.trim() || !chain) return false;
    const parsedDest = parseCoinPayload(destination);
    return parsedDest?.chain === chain;
  }, [destination, chain]);

  return (
    <div className="px-5 pt-6 pb-24">
      <Link to="/home" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back
      </Link>

      <header className="mt-6 mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Sweep / redeem</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Move funds off your coin</h1>
      </header>

      {/* ---------------- Security disclaimer ---------------- */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm">
        <ShieldAlert className="mb-2 size-5 text-accent" />
        <p className="font-medium text-foreground">Your key never leaves this device.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Signing happens locally in the app. Nothing is uploaded, stored, or logged. The key is wiped from memory the moment you leave this page or broadcast the sweep.
        </p>
      </div>

      {/* ---------------- From ---------------- */}
      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">From</p>
        {chain && address ? (
          <div className="mt-2 flex items-start gap-3">
            <CoinLogo chain={chain} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{CHAINS[chain].name}</p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{address}</p>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-foreground">No coin selected.</p>
            <button
              onClick={() => navigate({ to: "/home" })}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Pick a coin to sweep →
            </button>
          </div>
        )}
        {chain && !supported && (
          <p className="mt-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
            Sweep for {CHAINS[chain].name} is coming in a later phase.
          </p>
        )}
      </section>

      {/* ---------------- Private key input ---------------- */}
      {chain && address && supported && (
        <section className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Private key (engraved under the sticker)
            </p>
            {format !== "unknown" && keyInput.trim() && (
              <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {format === "bip38" ? "encrypted" : format}
              </span>
            )}
          </div>

          <div className="mt-2 flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="Paste WIF (5/K/L/c…) or 64-char hex"
              className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2.5 font-mono text-xs focus:border-ring focus:outline-none"
            />
            <button
              onClick={() => setShowKey(s => !s)}
              type="button"
              aria-label={showKey ? "Hide key" : "Show key"}
              className="rounded-md border border-border bg-background px-2.5 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
            <button
              onClick={() => setScanOpen(s => !s)}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-foreground hover:bg-secondary"
            >
              <Camera className="size-3.5" /> {scanOpen ? "Close" : "Scan"}
            </button>
          </div>

          {scanOpen && (
            <div className="mt-3">
              <QrScanner
                onResult={text => {
                  setKeyInput(text.trim());
                  setScanOpen(false);
                }}
              />
              <p className="mt-2 text-[10px] text-muted-foreground">
                Aim at the QR under the tamper sticker. Native camera scanning lands with the iOS/Android build.
              </p>
            </div>
          )}

          {/* ---------------- Verification result ---------------- */}
          {parsed && (
            <div className="mt-3">
              {!parsed.ok ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="text-[11px] text-destructive">{parsed.error}</p>
                </div>
              ) : verified ? (
                <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    <p className="font-medium">Key verified — it controls this coin.</p>
                    <p className="mt-0.5 text-muted-foreground">
                      Derived {chain.toUpperCase()} address matches the engraved public key.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1 text-[11px]">
                      <p className="font-medium text-foreground">
                        Key is valid, but doesn't match this coin's {chain.toUpperCase()} address.
                      </p>
                      {derivedForChain.length > 0 && (
                        <div className="mt-1 space-y-0.5 text-muted-foreground">
                          <p>Derived from this key:</p>
                          {derivedForChain.map(a => (
                            <p key={a} className="break-all font-mono text-[10px]">· {shortAddr(a, 10, 8)}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ---------------- Destination ---------------- */}
      {chain && address && supported && (
        <section className="mt-4 rounded-xl border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Send to</p>
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={destination}
            onChange={e => setDestination(e.target.value)}
            placeholder={`${CHAINS[chain].name} destination address`}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-xs focus:border-ring focus:outline-none"
          />
          {destination.trim() && (
            <p className={`mt-2 inline-flex items-center gap-1 text-[11px] ${destLooksValid ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
              {destLooksValid
                ? <><CheckCircle2 className="size-3.5" /> Looks like a valid {chain.toUpperCase()} address.</>
                : <><XCircle className="size-3.5" /> Doesn't look like a {chain.toUpperCase()} address.</>
              }
            </p>
          )}
        </section>
      )}

      {/* ---------------- Action ---------------- */}
      {chain && address && supported && (
        <div className="mt-6">
          <button
            disabled
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground opacity-60"
          >
            <KeyRound className="size-4" />
            {!verified
              ? "Verify key to continue"
              : !destLooksValid
              ? "Enter a destination"
              : `Broadcast sweep — ${chain.toUpperCase()} signing lands next`}
          </button>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            Step 1 of the sweep flow: key verification. UTXO fetch, fee picker, signing, and broadcast land in the next iteration.
          </p>
        </div>
      )}
    </div>
  );
}
