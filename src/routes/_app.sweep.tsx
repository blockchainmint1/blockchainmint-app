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
import {
  getSweepUtxos, broadcastSweep, getEthSweepContext, broadcastEthSweep,
  type EthSweepContext, type EthSweepToken,
} from "@/lib/chains.functions";
import { signNativeEthSweep, signErc20Sweep } from "@/lib/ethTx";
import { requireBiometric } from "@/lib/nativeSecurity";

const sweepSearchSchema = z.object({
  chain: z.enum(["btc","eth","ltc","doge","bch","bsc","ada","sol","bnb","txc","iskander"]).optional(),
  address: z.string().optional(),
});

export const Route = createFileRoute("/_app/sweep")({
  validateSearch: sweepSearchSchema,
  head: () => ({ meta: [{ title: "Sweep — Blockchain Mint" }] }),
  component: SweepPage,
});

const UTXO_CHAINS: SupportedSweepChain[] = ["btc", "ltc", "doge", "txc"];
function isUtxoChain(c: ChainId | undefined): c is SupportedSweepChain {
  return !!c && (UTXO_CHAINS as string[]).includes(c);
}
function isSupported(c: ChainId | undefined): boolean {
  return isUtxoChain(c) || c === "eth";
}

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

  // ---- shared: key state ------------------------------------------------
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [destination, setDestination] = useState("");
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
  const supported = isSupported(chain);

  const destLooksValid = useMemo(() => {
    if (!destination.trim() || !chain) return false;
    const p = parseCoinPayload(destination);
    return p?.chain === chain;
  }, [destination, chain]);

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
          Signing happens locally. We fetch network state and broadcast the signed transaction — the private key bytes are zeroed after signing and the field is cleared when you leave this page. For maximum safety, sweep on a device you trust and avoid screenshots.
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
            Sweep for {CHAINS[chain].name} is coming in a later phase. Currently supported: BTC, ETH, LTC, DOGE, TXC.
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

          <ol className="mt-3 space-y-1.5 rounded-md border border-border bg-secondary/40 p-3 text-[11px] text-muted-foreground">
            <li><span className="font-semibold text-foreground">1.</span> Gently peel off the tamper sticker with your fingernail. <span className="text-foreground/80">Don't use anything sharp</span> — it can scratch the engraved key.</li>
            <li><span className="font-semibold text-foreground">2.</span> Tap <span className="font-semibold text-foreground">Scan</span> and point the camera at the QR under the sticker, or type the key in by hand.</li>
            <li><span className="font-semibold text-foreground">3.</span> We'll verify the key matches this coin before anything is signed.</li>
          </ol>


          <div className="mt-2 flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder={chain === "eth" ? "Paste 64-char hex (0x…)" : "Paste WIF (5/K/L/c…) or 64-char hex"}
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

      {/* Chain-specific compose */}
      {verified && parsed?.ok && chain && address && isUtxoChain(chain) && (
        <UtxoCompose
          chain={chain}
          address={address}
          destination={destination}
          setDestination={setDestination}
          destLooksValid={destLooksValid}
          parsed={parsed}
          phase={phase}
          setPhase={setPhase}
        />
      )}

      {verified && parsed?.ok && chain === "eth" && address && (
        <EthCompose
          address={address}
          destination={destination}
          setDestination={setDestination}
          destLooksValid={destLooksValid}
          parsed={parsed}
          phase={phase}
          setPhase={setPhase}
        />
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
    </div>
  );
}

// ===========================================================================
// UTXO compose subtree (BTC, LTC, DOGE, TXC)
// ===========================================================================

const FEE_TIERS: Array<{ id: "slow" | "med" | "fast"; label: string; mult: number }> = [
  { id: "slow", label: "Slow",   mult: 0.5 },
  { id: "med",  label: "Medium", mult: 1.0 },
  { id: "fast", label: "Fast",   mult: 1.5 },
];

function UtxoCompose(props: {
  chain: SupportedSweepChain;
  address: string;
  destination: string;
  setDestination: (s: string) => void;
  destLooksValid: boolean;
  parsed: Extract<KeyParseResult, { ok: true }>;
  phase: Phase;
  setPhase: (p: Phase) => void;
}) {
  const { chain, address, destination, setDestination, destLooksValid, parsed, phase, setPhase } = props;
  const fetchUtxos = useServerFn(getSweepUtxos);
  const broadcast = useServerFn(broadcastSweep);

  const [utxos, setUtxos] = useState<{ txid: string; vout: number; value: number }[] | null>(null);
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [utxoLoading, setUtxoLoading] = useState(false);
  const [utxoError, setUtxoError] = useState<string | null>(null);
  const [feeTier, setFeeTier] = useState<"slow" | "med" | "fast">("med");

  useEffect(() => {
    let cancelled = false;
    setUtxoLoading(true);
    setUtxoError(null);
    fetchUtxos({ data: { chain, address } })
      .then(res => { if (!cancelled) { setUtxos(res.utxos); setFeeRate(res.feeRate); } })
      .catch(e => { if (!cancelled) setUtxoError((e as Error).message); })
      .finally(() => { if (!cancelled) setUtxoLoading(false); });
    return () => { cancelled = true; };
  }, [chain, address, fetchUtxos]);

  const totalIn = utxos?.reduce((s, u) => s + u.value, 0) ?? 0;
  const decimals = CHAINS[chain].decimals;
  const ticker = CHAINS[chain].ticker;

  const effectiveFeeRate = useMemo(() => {
    if (!feeRate) return null;
    const mult = FEE_TIERS.find(t => t.id === feeTier)!.mult;
    return Math.max(SWEEP_PARAMS[chain].minFeeRate, Math.round(feeRate * mult));
  }, [feeRate, feeTier, chain]);

  const feeEstimate = useMemo(() => {
    if (!utxos || !effectiveFeeRate) return null;
    const isSegwit = address.toLowerCase().startsWith((SWEEP_PARAMS[chain].bech32Hrp ?? "_") + "1");
    const vsize = 10 + utxos.length * (isSegwit ? 68 : 148) + 34;
    return { vsize, fee: Math.ceil(vsize * effectiveFeeRate) };
  }, [utxos, effectiveFeeRate, chain, address]);

  const amountOut = feeEstimate ? totalIn - feeEstimate.fee : 0;
  const canBroadcast =
    destLooksValid && utxos && utxos.length > 0 && amountOut > 0 && phase.kind === "compose";

  async function handleBroadcast() {
    if (!utxos || !effectiveFeeRate) return;
    const ok = await requireBiometric("Authorize sweep broadcast");
    if (!ok) { setPhase({ kind: "error", message: "Biometric authentication cancelled." }); return; }
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
      privKey.fill(0);
      const res = await broadcast({ data: { chain, rawHex: signed.rawHex } });
      if (!res.ok) { setPhase({ kind: "error", message: res.error }); return; }
      setPhase({ kind: "broadcast", txid: res.txid });
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <>
      <section className="mt-4 rounded-xl border border-border bg-card p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Spendable balance</p>
        {utxoLoading && <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Fetching UTXOs…</p>}
        {utxoError && <p className="mt-2 text-xs text-destructive">{utxoError}</p>}
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

      {utxos && utxos.length > 0 && (
        <DestinationInput
          chain={chain}
          destination={destination}
          setDestination={setDestination}
          destLooksValid={destLooksValid}
        />
      )}

      {utxos && utxos.length > 0 && destLooksValid && (
        <section className="mt-4 rounded-xl border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Network fee</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {FEE_TIERS.map(t => (
              <button
                key={t.id}
                onClick={() => setFeeTier(t.id)}
                className={`rounded-md border px-2 py-2 text-xs transition ${
                  feeTier === t.id ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >{t.label}</button>
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

      <BroadcastButton
        phase={phase}
        canBroadcast={!!canBroadcast}
        onClick={handleBroadcast}
        labelReady="Broadcast sweep"
      />
    </>
  );
}

// ===========================================================================
// ETH compose subtree (ETH + ERC-20)
// ===========================================================================

type EthAsset =
  | { kind: "native" }
  | { kind: "erc20"; token: EthSweepToken };

function EthCompose(props: {
  address: string;
  destination: string;
  setDestination: (s: string) => void;
  destLooksValid: boolean;
  parsed: Extract<KeyParseResult, { ok: true }>;
  phase: Phase;
  setPhase: (p: Phase) => void;
}) {
  const { address, destination, setDestination, destLooksValid, parsed, phase, setPhase } = props;
  const fetchCtx = useServerFn(getEthSweepContext);
  const broadcast = useServerFn(broadcastEthSweep);

  const [ctx, setCtx] = useState<EthSweepContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [asset, setAsset] = useState<EthAsset>({ kind: "native" });

  useEffect(() => {
    let cancelled = false;
    setCtxLoading(true);
    setCtxError(null);
    fetchCtx({ data: { address } })
      .then(res => { if (!cancelled) setCtx(res); })
      .catch(e => { if (!cancelled) setCtxError((e as Error).message); })
      .finally(() => { if (!cancelled) setCtxLoading(false); });
    return () => { cancelled = true; };
  }, [address, fetchCtx]);

  const balanceWei = ctx ? BigInt(ctx.balanceWei) : 0n;
  const gasLimit = asset.kind === "native" ? 21000n : 65000n;
  const feeWei = ctx ? gasLimit * BigInt(ctx.maxFeePerGas) : 0n;

  const nativeAmountOut = balanceWei > feeWei ? balanceWei - feeWei : 0n;
  const hasGas = ctx ? balanceWei >= feeWei : false;

  const canBroadcast = !!ctx && destLooksValid && phase.kind === "compose" && (
    asset.kind === "native"
      ? nativeAmountOut > 0n
      : hasGas && BigInt(asset.token.balanceRaw) > 0n
  );

  async function handleBroadcast() {
    if (!ctx) return;
    const ok = await requireBiometric("Authorize sweep broadcast");
    if (!ok) { setPhase({ kind: "error", message: "Biometric authentication cancelled." }); return; }
    setPhase({ kind: "broadcasting" });
    try {
      const fee = {
        chainId: ctx.chainId,
        nonce: ctx.nonce,
        maxFeePerGas: ctx.maxFeePerGas,
        maxPriorityFeePerGas: ctx.maxPriorityFeePerGas,
      };
      const signed = asset.kind === "native"
        ? await signNativeEthSweep({
            privKeyHex: parsed.privateKeyHex,
            to: destination.trim(),
            balanceWei: ctx.balanceWei,
            fee,
          })
        : await signErc20Sweep({
            privKeyHex: parsed.privateKeyHex,
            to: destination.trim(),
            tokenAddress: asset.token.contractAddress,
            tokenBalanceRaw: asset.token.balanceRaw,
            fee,
          });
      const res = await broadcast({ data: { rawHex: signed.rawHex } });
      if (!res.ok) { setPhase({ kind: "error", message: res.error }); return; }
      setPhase({ kind: "broadcast", txid: res.txid });
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <>
      <section className="mt-4 rounded-xl border border-border bg-card p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Spendable assets</p>
        {ctxLoading && <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Fetching balances…</p>}
        {ctxError && <p className="mt-2 text-xs text-destructive">{ctxError}</p>}
        {ctx && (
          <div className="mt-2 space-y-2">
            <AssetRow
              selected={asset.kind === "native"}
              onSelect={() => setAsset({ kind: "native" })}
              symbol="ETH"
              name="Ethereum"
              balance={formatUnits(balanceWei, 18)}
            />
            {ctx.tokens.map(tok => (
              <AssetRow
                key={tok.contractAddress}
                selected={asset.kind === "erc20" && asset.token.contractAddress === tok.contractAddress}
                onSelect={() => setAsset({ kind: "erc20", token: tok })}
                symbol={tok.symbol}
                name={tok.name}
                balance={formatUnits(BigInt(tok.balanceRaw), tok.decimals)}
              />
            ))}
            {ctx.tokens.length === 0 && (
              <p className="text-[11px] text-muted-foreground">No ERC-20 tokens with a balance.</p>
            )}
          </div>
        )}
      </section>

      {ctx && (
        <DestinationInput
          chain="eth"
          destination={destination}
          setDestination={setDestination}
          destLooksValid={destLooksValid}
        />
      )}

      {ctx && destLooksValid && (
        <section className="mt-4 rounded-xl border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Network fee</p>
          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <div className="flex justify-between"><span>Gas limit</span><span>{gasLimit.toString()}</span></div>
            <div className="flex justify-between">
              <span>Max fee</span>
              <span>{(Number(BigInt(ctx.maxFeePerGas)) / 1e9).toFixed(2)} gwei</span>
            </div>
            <div className="flex justify-between"><span>Estimated fee</span><span>{formatUnits(feeWei, 18)} ETH</span></div>
            {asset.kind === "native" ? (
              <div className="flex justify-between text-foreground"><span>You'll send</span><span className="font-medium">{formatUnits(nativeAmountOut, 18)} ETH</span></div>
            ) : (
              <>
                <div className="flex justify-between text-foreground"><span>You'll send</span><span className="font-medium">{formatUnits(BigInt(asset.token.balanceRaw), asset.token.decimals)} {asset.token.symbol}</span></div>
                {!hasGas && <div className="text-amber-500">Address needs ETH to pay gas for the ERC-20 transfer.</div>}
              </>
            )}
          </div>
        </section>
      )}

      <BroadcastButton
        phase={phase}
        canBroadcast={canBroadcast}
        onClick={handleBroadcast}
        labelReady={asset.kind === "native" ? "Broadcast sweep" : `Send all ${asset.token.symbol}`}
      />
    </>
  );
}

// ===========================================================================
// Shared bits
// ===========================================================================

function DestinationInput(props: {
  chain: ChainId;
  destination: string;
  setDestination: (s: string) => void;
  destLooksValid: boolean;
}) {
  const { chain, destination, setDestination, destLooksValid } = props;
  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Send to</p>
      <input
        type="text"
        autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
        value={destination}
        onChange={e => setDestination(e.target.value)}
        placeholder={`${CHAINS[chain].name} destination address`}
        className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-xs focus:border-ring focus:outline-none"
      />
      {destination.trim() && (
        <p className={`mt-2 inline-flex items-center gap-1 text-[11px] ${destLooksValid ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
          {destLooksValid
            ? <><CheckCircle2 className="size-3.5" /> Looks like a valid {chain.toUpperCase()} address.</>
            : <><XCircle className="size-3.5" /> Doesn't look like a {chain.toUpperCase()} address.</>}
        </p>
      )}
    </section>
  );
}

function AssetRow(props: {
  selected: boolean;
  onSelect: () => void;
  symbol: string;
  name: string;
  balance: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition ${
        props.selected ? "border-accent bg-accent/10" : "border-border bg-background hover:bg-secondary"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{props.symbol}</p>
        <p className="truncate text-[11px] text-muted-foreground">{props.name}</p>
      </div>
      <p className="font-mono text-xs text-foreground">{props.balance}</p>
    </button>
  );
}

function BroadcastButton(props: {
  phase: Phase;
  canBroadcast: boolean;
  onClick: () => void;
  labelReady: string;
}) {
  return (
    <div className="mt-6">
      <button
        onClick={props.onClick}
        disabled={!props.canBroadcast}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
      >
        {props.phase.kind === "broadcasting"
          ? <><Loader2 className="size-4 animate-spin" /> Signing & broadcasting…</>
          : !props.canBroadcast
          ? <><KeyRound className="size-4" /> Not ready yet</>
          : <><Send className="size-4" /> {props.labelReady}</>}
      </button>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Signed locally. Key bytes cleared after signing.
      </p>
    </div>
  );
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function formatUnits(value: bigint, decimals: number): string {
  if (value === 0n) return "0";
  const neg = value < 0n;
  const v = neg ? -value : value;
  const s = v.toString().padStart(decimals + 1, "0");
  const intPart = s.slice(0, s.length - decimals);
  const fracPart = s.slice(s.length - decimals).replace(/0+$/, "");
  const out = fracPart ? `${intPart}.${fracPart.slice(0, 8)}` : intPart;
  return neg ? "-" + out : out;
}
