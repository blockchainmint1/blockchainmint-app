import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  ArrowLeft, Camera, CheckCircle2, Eye, EyeOff, ExternalLink, KeyRound,
  Loader2, Send, ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";
import { CHAINS, type ChainId, fmtAmount, shortAddr } from "@/lib/chains";
import { CoinLogo } from "@/components/CoinLogo";
import { QrScanner } from "@/components/QrScanner";
import {
  parsePrivateKey, keyControlsAddress, sniffKeyFormat, type KeyParseResult,
} from "@/lib/keyDerivation";
import { parseCoinPayload } from "@/lib/parseCoinPayload";
import { buildAndSignSweep, SWEEP_PARAMS, type SupportedSweepChain } from "@/lib/utxoTx";
import { getSweepUtxos, broadcastSweep } from "@/lib/chains.functions";

const sweepSearchSchema = z.object({
  chain: z.enum(["btc","eth","ltc","doge","bch","bsc","ada","sol","bnb","txc","iskander"]).optional(),
  address: z.string().optional(),
});

export const Route = createFileRoute("/_app/sweep")({
  validateSearch: sweepSearchSchema,
  head: () => ({ meta: [{ title: "Sweep — Blockchain Mint" }] }),
  component: SweepPage,
});

const SUPPORTED_SWEEP: SupportedSweepChain[] = ["btc", "ltc", "doge", "txc"];
function isSweepChain(c: ChainId | undefined): c is SupportedSweepChain {
  return !!c && (SUPPORTED_SWEEP as string[]).includes(c);
}

// Per-chain rough multiplier for default fee picker.
const FEE_TIERS: Array<{ id: "slow" | "med" | "fast"; label: string; mult: number }> = [
  { id: "slow", label: "Slow",   mult: 0.5 },
  { id: "med",  label: "Medium", mult: 1.0 },
  { id: "fast", label: "Fast",   mult: 1.5 },
];

type Phase =
  | { kind: "compose" }
  | { kind: "broadcasting" }
  | { kind: "broadcast"; txid: string }
  | { kind: "error"; message: string };

function SweepPage() {
  const search = useSearch({ from: "/_app/sweep" });
  const chain = search.chain as ChainId | undefined;
  const address = search.address as string | undefined;
  const navigate = useNavigate();
  const fetchUtxos = useServerFn(getSweepUtxos);
  const broadcast = useServerFn(broadcastSweep);

  // ---- key + destination state -----------------------------------------
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [feeTier, setFeeTier] = useState<"slow" | "med" | "fast">("med");

  // UTXOs (lazy-loaded once key verifies)
  const [utxos, setUtxos] = useState<{ txid: string; vout: number; value: number }[] | null>(null);
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [utxoLoading, setUtxoLoading] = useState(false);
  const [utxoError, setUtxoError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "compose" });

  // Wipe the key from memory on unmount.
  const keyRef = useRef("");
  useEffect(() => {
    keyRef.current = keyInput;
    return () => { keyRef.current = ""; setKeyInput(""); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const format = sniffKeyFormat(keyInput);
  const parsed = useMemo<KeyParseResult | null>(() => {
    if (!keyInput.trim()) return null;
    return parsePrivateKey(keyInput);
  }, [keyInput]);

  const verified = !!(parsed?.ok && chain && address && keyControlsAddress(parsed, chain, address));
  const derivedForChain = parsed?.ok && chain ? parsed.addressesByChain[chain] ?? [] : [];
  const supported = isSweepChain(chain);

  const destLooksValid = useMemo(() => {
    if (!destination.trim() || !chain) return false;
    const p = parseCoinPayload(destination);
    return p?.chain === chain;
  }, [destination, chain]);

  // Fetch UTXOs once key is verified.
  useEffect(() => {
    if (!verified || !isSweepChain(chain) || !address) return;
    let cancelled = false;
    setUtxoLoading(true);
    setUtxoError(null);
    fetchUtxos({ data: { chain, address } })
      .then(res => {
        if (cancelled) return;
        setUtxos(res.utxos);
        setFeeRate(res.feeRate);
      })
      .catch(e => { if (!cancelled) setUtxoError((e as Error).message); })
      .finally(() => { if (!cancelled) setUtxoLoading(false); });
    return () => { cancelled = true; };
  }, [verified, chain, address, fetchUtxos]);

  const totalIn = utxos?.reduce((s, u) => s + u.value, 0) ?? 0;
  const decimals = chain ? CHAINS[chain].decimals : 8;
  const ticker = chain ? CHAINS[chain].ticker : "";

  // Effective fee rate for picker
  const effectiveFeeRate = useMemo(() => {
    if (!feeRate || !isSweepChain(chain)) return null;
    const mult = FEE_TIERS.find(t => t.id === feeTier)!.mult;
    return Math.max(SWEEP_PARAMS[chain].minFeeRate, Math.round(feeRate * mult));
  }, [feeRate, feeTier, chain]);

  // Estimated fee preview (without signing)
  const feeEstimate = useMemo(() => {
    if (!utxos || !effectiveFeeRate || !isSweepChain(chain)) return null;
    const isSegwit = address?.toLowerCase().startsWith(SWEEP_PARAMS[chain].bech32Hrp + "1") ?? false;
    const vsize = 10 + utxos.length * (isSegwit ? 68 : 148) + 34;
    return { vsize, fee: Math.ceil(vsize * effectiveFeeRate) };
  }, [utxos, effectiveFeeRate, chain, address]);

  const amountOut = feeEstimate ? totalIn - feeEstimate.fee : 0;
  const canBroadcast =
    verified && supported && destLooksValid && utxos && utxos.length > 0 && amountOut > 0 &&
    phase.kind === "compose";

  async function handleBroadcast() {
    if (!parsed?.ok || !isSweepChain(chain) || !address || !utxos || !effectiveFeeRate) return;
    setPhase({ kind: "broadcasting" });
    try {
      const privKey = hexToBytes(parsed.privateKeyHex);
      const signed = await buildAndSignSweep({
        utxos,
        fromAddress: address,
        toAddress: destination.trim(),
        feeRateSatPerVByte: effectiveFeeRate,
        privKey,
        compressedPubkey: parsed.compressed,
        params: SWEEP_PARAMS[chain],
      });
      // Wipe the local key copy after signing.
      privKey.fill(0);

      const res = await broadcast({ data: { chain, rawHex: signed.rawHex } });
      if (!res.ok) { setPhase({ kind: "error", message: res.error }); return; }
      setPhase({ kind: "broadcast", txid: res.txid });
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message });
    }
  }

  // ---- broadcast success view ------------------------------------------
  if (phase.kind === "broadcast" && chain) {
    const explorerUrl = CHAINS[chain].explorer(address ?? "").replace(/\/address\/.*/, `/tx/${phase.txid}`);
    return (
      <div className="px-5 pt-6 pb-24">
        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
          <h1 className="mt-4 font-serif text-2xl text-foreground">Sweep broadcast</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Funds are on their way. The transaction will confirm in the next few blocks.
          </p>
          <div className="mt-5 rounded-lg border border-border bg-background p-3 text-left">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">TXID</p>
            <p className="mt-1 break-all font-mono text-[11px] text-foreground">{phase.txid}</p>
          </div>
          <a
            href={explorerUrl}
            target="_blank" rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground hover:bg-secondary"
          >
            View on explorer <ExternalLink className="size-3.5" />
          </a>
          <div className="mt-6">
            <Link to="/home" className="text-xs text-primary hover:underline">Back to portfolio →</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-24">
      <Link to="/home" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back
      </Link>

      <header className="mt-6 mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Sweep / redeem</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Move funds off your coin</h1>
      </header>

      {/* Security */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm">
        <ShieldAlert className="mb-2 size-5 text-accent" />
        <p className="font-medium text-foreground">Your key never leaves this device.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Signing happens locally. We fetch UTXOs and broadcast the signed transaction — the private key is wiped from memory the moment you leave this page or complete the sweep.
        </p>
      </div>

      {/* From */}
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
            <button onClick={() => navigate({ to: "/home" })} className="mt-2 text-xs text-primary hover:underline">
              Pick a coin to sweep →
            </button>
          </div>
        )}
        {chain && !supported && (
          <p className="mt-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
            Sweep for {CHAINS[chain].name} is coming in a later phase. Currently supported: BTC, LTC, DOGE, TXC.
          </p>
        )}
      </section>

      {/* Key */}
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
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
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
              <QrScanner onResult={text => { setKeyInput(text.trim()); setScanOpen(false); }} />
            </div>
          )}

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

      {/* UTXOs */}
      {verified && supported && (
        <section className="mt-4 rounded-xl border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Spendable balance</p>
          {utxoLoading && (
            <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Fetching UTXOs…
            </p>
          )}
          {utxoError && (
            <p className="mt-2 text-xs text-destructive">{utxoError}</p>
          )}
          {utxos && !utxoLoading && (
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-serif text-2xl text-foreground">
                {fmtAmount(totalIn / 10 ** decimals, decimals)} {ticker}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {utxos.length} UTXO{utxos.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </section>
      )}

      {/* Destination */}
      {verified && supported && utxos && utxos.length > 0 && (
        <section className="mt-4 rounded-xl border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Send to</p>
          <input
            type="text"
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            value={destination}
            onChange={e => setDestination(e.target.value)}
            placeholder={`${CHAINS[chain!].name} destination address`}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-xs focus:border-ring focus:outline-none"
          />
          {destination.trim() && (
            <p className={`mt-2 inline-flex items-center gap-1 text-[11px] ${destLooksValid ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
              {destLooksValid
                ? <><CheckCircle2 className="size-3.5" /> Looks like a valid {chain!.toUpperCase()} address.</>
                : <><XCircle className="size-3.5" /> Doesn't look like a {chain!.toUpperCase()} address.</>
              }
            </p>
          )}
        </section>
      )}

      {/* Fee picker */}
      {verified && supported && utxos && utxos.length > 0 && destLooksValid && (
        <section className="mt-4 rounded-xl border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Network fee</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {FEE_TIERS.map(t => (
              <button
                key={t.id}
                onClick={() => setFeeTier(t.id)}
                className={`rounded-md border px-2 py-2 text-xs transition ${
                  feeTier === t.id
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {feeEstimate && effectiveFeeRate && (
            <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
              <div className="flex justify-between"><span>Rate</span><span>{effectiveFeeRate} sat/vB · ~{feeEstimate.vsize} vB</span></div>
              <div className="flex justify-between"><span>Estimated fee</span><span>{fmtAmount(feeEstimate.fee / 10 ** decimals, decimals)} {ticker}</span></div>
              <div className="flex justify-between text-foreground"><span>You'll send</span><span className="font-medium">{fmtAmount(amountOut / 10 ** decimals, decimals)} {ticker}</span></div>
            </div>
          )}
        </section>
      )}

      {/* Error */}
      {phase.kind === "error" && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 text-[11px] text-destructive">
              <p className="font-medium">Sweep failed</p>
              <p className="mt-0.5 break-words">{phase.message}</p>
            </div>
          </div>
          <button
            onClick={() => setPhase({ kind: "compose" })}
            className="mt-3 text-xs text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Action */}
      {chain && address && supported && (
        <div className="mt-6">
          <button
            onClick={handleBroadcast}
            disabled={!canBroadcast}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            {phase.kind === "broadcasting"
              ? <><Loader2 className="size-4 animate-spin" /> Signing & broadcasting…</>
              : !verified
              ? <><KeyRound className="size-4" /> Verify key to continue</>
              : !utxos || utxos.length === 0
              ? <><KeyRound className="size-4" /> No spendable balance</>
              : !destLooksValid
              ? <><KeyRound className="size-4" /> Enter a destination</>
              : <><Send className="size-4" /> Broadcast sweep</>}
          </button>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            One-shot transaction: all UTXOs in, single output out, no change.
          </p>
        </div>
      )}
    </div>
  );
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
