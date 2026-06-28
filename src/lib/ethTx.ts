/**
 * ETH + ERC-20 sweep signing via ethers v6.
 *
 * Pure client-side: takes a private key hex, builds an EIP-1559 transaction,
 * signs it locally, and returns the raw hex for broadcast. The server only
 * sees the signed transaction.
 *
 * Two flavors:
 *   - sweepNativeEth: empty the address's ETH (balance - gas).
 *   - sweepErc20: ERC-20 transfer of entire token balance; gas paid in ETH
 *     from the same address (so the address needs an ETH balance for gas).
 */

import { Wallet, Transaction, Interface, getAddress } from "ethers";

const ERC20_IFACE = new Interface([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export type EthFeeData = {
  chainId: number;
  nonce: number;
  /** wei per gas */
  maxFeePerGas: string;       // hex
  maxPriorityFeePerGas: string; // hex
};

export type NativeSweepInput = {
  privKeyHex: string;
  to: string;
  /** account balance in wei (hex or decimal string) */
  balanceWei: string;
  fee: EthFeeData;
  /** standard 21000 for plain transfers */
  gasLimit?: number;
};

export type Erc20SweepInput = {
  privKeyHex: string;
  to: string;
  tokenAddress: string;
  /** raw token balance (no decimals applied) as decimal or hex string */
  tokenBalanceRaw: string;
  fee: EthFeeData;
  /** estimate from server; default 65000 is generous for transfer() */
  gasLimit?: number;
};

export type SignedTx = {
  rawHex: string;
  hash: string;
  /** amount that will arrive at the destination, in base units */
  amountOut: bigint;
  /** total fee in wei */
  feeWei: bigint;
};

function normPriv(hex: string): string {
  const h = hex.replace(/^0x/i, "").toLowerCase();
  return "0x" + h;
}

export async function signNativeEthSweep(input: NativeSweepInput): Promise<SignedTx> {
  const wallet = new Wallet(normPriv(input.privKeyHex));
  const gasLimit = BigInt(input.gasLimit ?? 21000);
  const maxFee = BigInt(input.fee.maxFeePerGas);
  const maxPrio = BigInt(input.fee.maxPriorityFeePerGas);
  const balance = BigInt(input.balanceWei);
  const feeCap = gasLimit * maxFee;
  if (balance <= feeCap) {
    throw new Error(`Balance too low to cover gas (have ${balance} wei, need ${feeCap} wei for gas).`);
  }
  const value = balance - feeCap;

  const tx = Transaction.from({
    type: 2,
    chainId: input.fee.chainId,
    nonce: input.fee.nonce,
    to: getAddress(input.to),
    value,
    gasLimit,
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: maxPrio,
    data: "0x",
  });
  const signed = await wallet.signTransaction(tx);
  const parsed = Transaction.from(signed);
  return { rawHex: signed, hash: parsed.hash!, amountOut: value, feeWei: feeCap };
}

export async function signErc20Sweep(input: Erc20SweepInput): Promise<SignedTx> {
  const wallet = new Wallet(normPriv(input.privKeyHex));
  const gasLimit = BigInt(input.gasLimit ?? 65000);
  const maxFee = BigInt(input.fee.maxFeePerGas);
  const maxPrio = BigInt(input.fee.maxPriorityFeePerGas);
  const amount = BigInt(input.tokenBalanceRaw);
  if (amount <= 0n) throw new Error("Token balance is zero — nothing to sweep.");

  const data = ERC20_IFACE.encodeFunctionData("transfer", [getAddress(input.to), amount]);

  const tx = Transaction.from({
    type: 2,
    chainId: input.fee.chainId,
    nonce: input.fee.nonce,
    to: getAddress(input.tokenAddress),
    value: 0n,
    gasLimit,
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: maxPrio,
    data,
  });
  const signed = await wallet.signTransaction(tx);
  const parsed = Transaction.from(signed);
  return { rawHex: signed, hash: parsed.hash!, amountOut: amount, feeWei: gasLimit * maxFee };
}
