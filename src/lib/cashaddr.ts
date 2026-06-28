/**
 * Bitcoin Cash CashAddr encoder/decoder (P2PKH + P2SH, 160-bit hash only).
 *
 * Spec: https://github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/cashaddr.md
 *
 * Uses bech32's charset but a different 40-bit polymod with custom generators.
 */

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];

function polymod(values: number[]): bigint {
  let chk = 1n;
  for (const v of values) {
    const top = chk >> 35n;
    chk = ((chk & 0x07ffffffffn) << 5n) ^ BigInt(v);
    for (let i = 0; i < 5; i++) {
      if ((top >> BigInt(i)) & 1n) chk ^= GEN[i];
    }
  }
  return chk ^ 1n;
}

function prefixToWords(prefix: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < prefix.length; i++) out.push(prefix.charCodeAt(i) & 0x1f);
  out.push(0);
  return out;
}

function convertBits(data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] {
  let acc = 0, bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < 0 || (v >>> from) !== 0) throw new Error("cashaddr convertBits: invalid value");
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >>> bits) & maxv); }
  }
  if (pad) { if (bits > 0) out.push((acc << (to - bits)) & maxv); }
  else if (bits >= from || ((acc << (to - bits)) & maxv)) {
    throw new Error("cashaddr convertBits: invalid padding");
  }
  return out;
}

export type CashAddrType = 0 | 1; // 0 = P2PKH, 1 = P2SH

export function encodeCashAddr(prefix: string, type: CashAddrType, hash: Uint8Array): string {
  if (hash.length !== 20) throw new Error("cashaddr: only 160-bit hashes are supported");
  const versionByte = (type << 3) | 0; // size code 0 = 160 bits
  const payload: number[] = [versionByte, ...hash];
  const words = convertBits(payload, 8, 5, true);
  const prefixWords = prefixToWords(prefix);
  const template = [...prefixWords, ...words, 0, 0, 0, 0, 0, 0, 0, 0];
  const chk = polymod(template);
  const checkWords: number[] = [];
  for (let i = 0; i < 8; i++) checkWords.push(Number((chk >> BigInt(5 * (7 - i))) & 0x1fn));
  let body = "";
  for (const w of [...words, ...checkWords]) body += CHARSET[w];
  return `${prefix}:${body}`;
}

export function decodeCashAddr(
  addr: string,
  defaultPrefix = "bitcoincash",
): { type: CashAddrType; hash: Uint8Array; prefix: string } {
  const lower = addr.toLowerCase().trim();
  let prefix: string, body: string;
  if (lower.includes(":")) {
    const i = lower.indexOf(":");
    prefix = lower.slice(0, i);
    body = lower.slice(i + 1);
  } else {
    prefix = defaultPrefix;
    body = lower;
  }
  const values: number[] = [];
  for (const c of body) {
    const idx = CHARSET.indexOf(c);
    if (idx < 0) throw new Error("cashaddr: invalid character");
    values.push(idx);
  }
  const chk = polymod([...prefixToWords(prefix), ...values]);
  if (chk !== 0n) throw new Error("cashaddr: bad checksum");
  const payload5 = values.slice(0, -8);
  const payload8 = convertBits(payload5, 5, 8, false);
  const versionByte = payload8[0];
  const type = ((versionByte >> 3) & 0x1f) as CashAddrType;
  if (type !== 0 && type !== 1) throw new Error("cashaddr: unsupported type");
  const hash = new Uint8Array(payload8.slice(1));
  if (hash.length !== 20) throw new Error("cashaddr: only 160-bit hashes are supported");
  return { type, hash, prefix };
}

/** Returns true if the string plausibly looks like a CashAddr (with or without prefix). */
export function looksLikeCashAddr(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (t.includes(":")) return /^[a-z]+:[qp][qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/.test(t);
  return /^[qp][qpzry9x8gf2tvdw0s3jn54khce6mua7l]{41,}$/.test(t);
}
