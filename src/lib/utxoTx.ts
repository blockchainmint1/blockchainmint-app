/**
 * Pure-JS UTXO transaction builder + signer for the sweep flow.
 *
 * Supports BTC, LTC, DOGE, TXC (and any other Bitcoin-derived chain that
 * uses SIGHASH_ALL = 0x01). Handles legacy P2PKH inputs on every chain and
 * BIP-143 P2WPKH inputs on chains with bech32 (BTC, LTC, TXC).
 *
 * Sweep semantics: spend ALL provided UTXOs into ONE destination output,
 * subtracting the fee. No change output (the source coin should be emptied).
 *
 * BCH is intentionally not supported here — it requires SIGHASH_FORKID and
 * the BIP-143 preimage for legacy inputs, which is a different code path.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { secp256k1 } from "@noble/curves/secp256k1";
import { base58check, bech32 } from "@scure/base";
import { decodeCashAddr, encodeCashAddr, looksLikeCashAddr } from "./cashaddr";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Utxo = {
  txid: string;
  vout: number;
  /** value in base units (satoshis or chain equivalent) */
  value: number;
};

export type ChainTxParams = {
  /** legacy address version byte */
  p2pkhVersion: number;
  /** bech32 HRP, or null if chain has no segwit */
  bech32Hrp: string | null;
  /** cashaddr prefix (e.g. "bitcoincash"), or null if chain doesn't use cashaddr */
  cashAddrPrefix?: string | null;
  /** sighash flag — 0x01 for BTC/LTC/DOGE/TXC, 0x41 (with FORKID) for BCH */
  sighashAll: number;
  /**
   * If true, sign every input with BIP-143 preimage (BCH replay protection).
   * Output serialization stays legacy (no witness section).
   */
  forkId?: boolean;
  /** minimum sat/vB fee rate the network/relay will accept */
  minFeeRate: number;
  /** dust threshold in base units */
  dustThreshold: number;
};

export type AddrInfo =
  | { type: "p2pkh"; pkh: Uint8Array }
  | { type: "p2wpkh"; pkh: Uint8Array };

export type BuildSweepInput = {
  utxos: Utxo[];
  fromAddress: string;
  toAddress: string;
  feeRateSatPerVByte: number;
  privKey: Uint8Array;
  compressedPubkey: boolean;
  params: ChainTxParams;
};

export type BuildSweepResult = {
  rawHex: string;
  txid: string;
  vsize: number;
  fee: number;
  totalIn: number;
  amountOut: number;
};

// ---------------------------------------------------------------------------
// Address decode + scriptPubKey
// ---------------------------------------------------------------------------

export function decodeAddress(addr: string, params: ChainTxParams): AddrInfo {
  const a = addr.trim();
  // CashAddr (BCH) — try first if chain supports it.
  if (params.cashAddrPrefix && looksLikeCashAddr(a)) {
    const dec = decodeCashAddr(a, params.cashAddrPrefix);
    if (dec.type !== 0) throw new Error("Only P2PKH CashAddr destinations are supported.");
    return { type: "p2pkh", pkh: dec.hash };
  }
  if (params.bech32Hrp && a.toLowerCase().startsWith(params.bech32Hrp + "1")) {
    const dec = bech32.decode(a.toLowerCase() as `${string}1${string}`);
    const ver = dec.words[0];
    if (ver !== 0) throw new Error("Only segwit v0 (P2WPKH) is supported.");
    const prog = bech32.fromWords(dec.words.slice(1));
    if (prog.length !== 20) throw new Error("Only P2WPKH (20-byte program) is supported.");
    return { type: "p2wpkh", pkh: new Uint8Array(prog) };
  }
  const dec = base58check(sha256).decode(a);
  if (dec[0] !== params.p2pkhVersion) {
    throw new Error(
      `Address version 0x${dec[0].toString(16)} not supported for this chain (expected 0x${params.p2pkhVersion.toString(16)}).`,
    );
  }
  return { type: "p2pkh", pkh: dec.slice(1, 21) };
}

function p2pkhScript(pkh: Uint8Array): Uint8Array {
  return new Uint8Array([0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac]);
}
function p2wpkhScript(pkh: Uint8Array): Uint8Array {
  return new Uint8Array([0x00, 0x14, ...pkh]);
}
function scriptForAddr(info: AddrInfo): Uint8Array {
  return info.type === "p2pkh" ? p2pkhScript(info.pkh) : p2wpkhScript(info.pkh);
}


// ---------------------------------------------------------------------------
// Byte writers
// ---------------------------------------------------------------------------

function writeVarInt(n: number, buf: number[]) {
  if (n < 0xfd) buf.push(n);
  else if (n <= 0xffff) buf.push(0xfd, n & 0xff, (n >> 8) & 0xff);
  else if (n <= 0xffffffff) buf.push(0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
  else throw new Error("varint too large");
}
function writeBytes(b: Uint8Array, buf: number[]) { for (const x of b) buf.push(x); }
function writeU32LE(n: number, buf: number[]) {
  buf.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
}
function writeU64LE(n: bigint, buf: number[]) {
  let v = n;
  for (let i = 0; i < 8; i++) { buf.push(Number(v & 0xffn)); v >>= 8n; }
}
function writeScriptWithLen(s: Uint8Array, buf: number[]) {
  writeVarInt(s.length, buf); writeBytes(s, buf);
}
function reverseTxidToBytes(hex: string): Uint8Array {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return b.reverse();
}
function bytesToHex(b: Uint8Array): string {
  let s = ""; for (const x of b) s += x.toString(16).padStart(2, "0"); return s;
}
function dsha256(b: Uint8Array): Uint8Array { return sha256(sha256(b)); }

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export async function buildAndSignSweep(input: BuildSweepInput): Promise<BuildSweepResult> {
  const { utxos, fromAddress, toAddress, feeRateSatPerVByte, privKey, compressedPubkey, params } = input;

  if (utxos.length === 0) throw new Error("No spendable UTXOs found at this address.");
  if (utxos.length > 250)  throw new Error("Too many UTXOs to sweep in a single transaction.");

  const fromInfo = decodeAddress(fromAddress, params);
  const toInfo   = decodeAddress(toAddress,   params);
  const pubkey   = secp256k1.getPublicKey(privKey, compressedPubkey);

  const inputScript  = scriptForAddr(fromInfo);
  const outputScript = scriptForAddr(toInfo);
  const totalIn = utxos.reduce((s, u) => s + u.value, 0);

  // vsize estimate — input weights below are standard, conservative averages.
  const inVbytes = fromInfo.type === "p2wpkh" ? 68 : 148;
  const outVbytes = toInfo.type === "p2wpkh" ? 31 : 34;
  const vsize = 10 + utxos.length * inVbytes + outVbytes;

  const feeRate = Math.max(feeRateSatPerVByte, params.minFeeRate);
  const fee = Math.max(Math.ceil(vsize * feeRate), 1);
  const amountOut = totalIn - fee;
  if (amountOut <= params.dustThreshold) {
    throw new Error(
      `Balance too small to cover fees (input ${totalIn} / fee ${fee} / would leave ${amountOut}).`,
    );
  }

  const isSegwit = fromInfo.type === "p2wpkh";
  const usesBip143 = isSegwit || !!params.forkId;

  // ---- Sign each input ---------------------------------------------------
  const signatures: Uint8Array[] = [];
  for (let i = 0; i < utxos.length; i++) {
    const preimage = usesBip143
      ? bip143Preimage(utxos, i, inputScript, outputScript, amountOut, params.sighashAll)
      : legacyPreimage(utxos, i, inputScript, outputScript, amountOut, params.sighashAll);
    const hash = dsha256(preimage);
    const compact = await signAsync(hash, privKey, { lowS: true });
    const sig = Signature.fromBytes(compact);
    const der = sig.toDERRawBytes();
    signatures.push(new Uint8Array([...der, params.sighashAll]));
  }


  // ---- Serialize final tx ------------------------------------------------
  const out: number[] = [];
  writeU32LE(2, out);
  if (isSegwit) out.push(0x00, 0x01); // segwit marker + flag

  writeVarInt(utxos.length, out);
  for (let i = 0; i < utxos.length; i++) {
    const u = utxos[i];
    writeBytes(reverseTxidToBytes(u.txid), out);
    writeU32LE(u.vout, out);
    if (isSegwit) {
      writeVarInt(0, out);
    } else {
      const scriptSig: number[] = [];
      writeVarInt(signatures[i].length, scriptSig); writeBytes(signatures[i], scriptSig);
      writeVarInt(pubkey.length, scriptSig);        writeBytes(pubkey, scriptSig);
      writeScriptWithLen(new Uint8Array(scriptSig), out);
    }
    writeU32LE(0xffffffff, out);
  }

  writeVarInt(1, out);
  writeU64LE(BigInt(amountOut), out);
  writeScriptWithLen(outputScript, out);

  if (isSegwit) {
    for (let i = 0; i < utxos.length; i++) {
      writeVarInt(2, out);
      writeVarInt(signatures[i].length, out); writeBytes(signatures[i], out);
      writeVarInt(pubkey.length, out);         writeBytes(pubkey, out);
    }
  }
  writeU32LE(0, out); // locktime

  const raw = new Uint8Array(out);

  // ---- txid = dsha256 of NON-witness serialization, reversed -------------
  let txidBytes: Uint8Array;
  if (isSegwit) {
    const o2: number[] = [];
    writeU32LE(2, o2);
    writeVarInt(utxos.length, o2);
    for (const u of utxos) {
      writeBytes(reverseTxidToBytes(u.txid), o2);
      writeU32LE(u.vout, o2);
      writeVarInt(0, o2);
      writeU32LE(0xffffffff, o2);
    }
    writeVarInt(1, o2);
    writeU64LE(BigInt(amountOut), o2);
    writeScriptWithLen(outputScript, o2);
    writeU32LE(0, o2);
    txidBytes = dsha256(new Uint8Array(o2));
  } else {
    txidBytes = dsha256(raw);
  }
  const txid = bytesToHex(txidBytes.reverse());

  return { rawHex: bytesToHex(raw), txid, vsize, fee, totalIn, amountOut };
}

// ---------------------------------------------------------------------------
// Sighash preimages
// ---------------------------------------------------------------------------

function legacyPreimage(
  utxos: Utxo[],
  idx: number,
  prevScript: Uint8Array,
  outScript: Uint8Array,
  amountOut: number,
  sighashFlag: number,
): Uint8Array {
  const o: number[] = [];
  writeU32LE(2, o);
  writeVarInt(utxos.length, o);
  for (let i = 0; i < utxos.length; i++) {
    const u = utxos[i];
    writeBytes(reverseTxidToBytes(u.txid), o);
    writeU32LE(u.vout, o);
    if (i === idx) writeScriptWithLen(prevScript, o);
    else writeVarInt(0, o);
    writeU32LE(0xffffffff, o);
  }
  writeVarInt(1, o);
  writeU64LE(BigInt(amountOut), o);
  writeScriptWithLen(outScript, o);
  writeU32LE(0, o);
  writeU32LE(sighashFlag, o);
  return new Uint8Array(o);
}

function bip143Preimage(
  utxos: Utxo[],
  idx: number,
  prevScript: Uint8Array,
  outScript: Uint8Array,
  amountOut: number,
  sighashFlag: number,
): Uint8Array {
  const ho: number[] = [];
  for (const u of utxos) { writeBytes(reverseTxidToBytes(u.txid), ho); writeU32LE(u.vout, ho); }
  const hashPrevouts = dsha256(new Uint8Array(ho));

  const hs: number[] = [];
  for (let i = 0; i < utxos.length; i++) writeU32LE(0xffffffff, hs);
  const hashSequence = dsha256(new Uint8Array(hs));

  const hot: number[] = [];
  writeU64LE(BigInt(amountOut), hot);
  writeScriptWithLen(outScript, hot);
  const hashOutputs = dsha256(new Uint8Array(hot));

  // For P2WPKH, scriptCode is the legacy P2PKH script of the same key.
  let scriptCode: Uint8Array;
  if (prevScript[0] === 0x00 && prevScript[1] === 0x14) {
    scriptCode = p2pkhScript(prevScript.slice(2, 22));
  } else {
    scriptCode = prevScript;
  }

  const o: number[] = [];
  writeU32LE(2, o);
  writeBytes(hashPrevouts, o);
  writeBytes(hashSequence, o);
  writeBytes(reverseTxidToBytes(utxos[idx].txid), o);
  writeU32LE(utxos[idx].vout, o);
  writeScriptWithLen(scriptCode, o);
  writeU64LE(BigInt(utxos[idx].value), o);
  writeU32LE(0xffffffff, o); // sequence
  writeBytes(hashOutputs, o);
  writeU32LE(0, o); // locktime
  writeU32LE(sighashFlag, o);
  return new Uint8Array(o);
}

// ---------------------------------------------------------------------------
// Per-chain params table
// ---------------------------------------------------------------------------

export type SupportedSweepChain = "btc" | "ltc" | "doge" | "txc" | "bch";

export const SWEEP_PARAMS: Record<SupportedSweepChain, ChainTxParams> = {
  btc:  { p2pkhVersion: 0x00, bech32Hrp: "bc",  sighashAll: 0x01, minFeeRate: 1,    dustThreshold: 546   },
  ltc:  { p2pkhVersion: 0x30, bech32Hrp: "ltc", sighashAll: 0x01, minFeeRate: 1,    dustThreshold: 546   },
  // DOGE relay/min-fee is ~1000 sat/vB (0.001 DOGE per kB); dust threshold ~1 DOGE.
  doge: { p2pkhVersion: 0x1e, bech32Hrp: null,  sighashAll: 0x01, minFeeRate: 1000, dustThreshold: 1_000_000 },
  // TEXITcoin — Bitcoin-derived (see chainparams.cpp): PUBKEY=66 (0x42), bech32 "txc".
  txc:  { p2pkhVersion: 0x42, bech32Hrp: "txc", sighashAll: 0x01, minFeeRate: 1,    dustThreshold: 546   },
  // BCH: SIGHASH_ALL | SIGHASH_FORKID (0x40 | 0x01 = 0x41). BIP-143 preimage for
  // every input. CashAddr "bitcoincash:" prefix; legacy 1… addresses also valid
  // (version 0x00 — same as BTC, parsers must rely on the chain context).
  bch:  { p2pkhVersion: 0x00, bech32Hrp: null,  cashAddrPrefix: "bitcoincash", sighashAll: 0x41, forkId: true, minFeeRate: 1, dustThreshold: 546 },
};

/** Re-export so callers can build cashaddr destinations from a pkh. */
export { encodeCashAddr } from "./cashaddr";

