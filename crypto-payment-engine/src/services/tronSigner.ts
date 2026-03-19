/**
 * TronSigner — Signs and broadcasts TRON transactions.
 * Uses TronWeb for transaction construction and signing.
 *
 * Two operations:
 * 1. Fund deposit address with TRX (for sweep gas)
 * 2. Sweep USDT from deposit address to hot wallet
 */
import { ENGINE_CONFIG } from "../config.ts";

// Dynamic import TronWeb (CommonJS module)
let TronWeb: any = null;
async function getTronWeb() {
  if (!TronWeb) {
    const mod = await import("tronweb");
    TronWeb = mod.default ?? mod.TronWeb ?? mod;
  }
  return TronWeb;
}

const FULL_NODE = ENGINE_CONFIG.tron.eventApiUrl; // TronGrid serves both
const USDT_CONTRACT = ENGINE_CONFIG.tron.usdtContract;

// Minimum TRX needed to execute a TRC20 transfer (~30 TRX for energy)
const MIN_TRX_FOR_SWEEP = 35_000_000; // 35 TRX in SUN

export interface SignResult {
  txHash: string;
  success: boolean;
  error?: string;
}

/**
 * Send TRX from hot wallet to deposit address for sweep gas.
 */
export async function fundAddressWithTrx(
  hotWalletPrivateKey: string,
  depositAddress: string,
  amountSun: number = MIN_TRX_FOR_SWEEP,
): Promise<SignResult> {
  try {
    const TW = await getTronWeb();
    const tronWeb = new TW({ fullHost: FULL_NODE, privateKey: hotWalletPrivateKey });

    const tx = await tronWeb.trx.sendTransaction(depositAddress, amountSun);
    if (tx.result) {
      return { txHash: tx.txid ?? tx.transaction?.txID ?? "", success: true };
    }
    return { txHash: "", success: false, error: tx.message ?? "trx_send_failed" };
  } catch (err: any) {
    return { txHash: "", success: false, error: err?.message ?? "trx_fund_error" };
  }
}

/**
 * Sweep USDT TRC20 from deposit address to hot wallet.
 */
export async function sweepUsdt(
  depositPrivateKey: string,
  toAddress: string,
  amountUsdt: number,
): Promise<SignResult> {
  try {
    const TW = await getTronWeb();
    const tronWeb = new TW({ fullHost: FULL_NODE, privateKey: depositPrivateKey });

    // USDT has 6 decimals
    const amountSun = Math.floor(amountUsdt * 1_000_000);

    // Build TRC20 transfer
    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    const tx = await contract.transfer(toAddress, amountSun).send({
      feeLimit: 100_000_000, // 100 TRX max fee
    });

    return { txHash: String(tx ?? ""), success: true };
  } catch (err: any) {
    return { txHash: "", success: false, error: err?.message ?? "usdt_sweep_error" };
  }
}

/**
 * Check TRX balance of an address (in SUN).
 */
export async function getTrxBalance(address: string): Promise<number> {
  try {
    const TW = await getTronWeb();
    const tronWeb = new TW({ fullHost: FULL_NODE });
    return await tronWeb.trx.getBalance(address);
  } catch {
    return 0;
  }
}

/**
 * Check USDT TRC20 balance of an address.
 */
export async function getUsdtBalance(address: string): Promise<number> {
  try {
    const TW = await getTronWeb();
    const tronWeb = new TW({ fullHost: FULL_NODE });
    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    const balance = await contract.balanceOf(address).call();
    return Number(balance) / 1_000_000;
  } catch {
    return 0;
  }
}
