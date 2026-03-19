/**
 * TronClient — Queries TronGrid API for TRC20 USDT transfers.
 */
import { ENGINE_CONFIG } from "../config.ts";

interface TronGridRow {
  transaction_id?: string;
  block_timestamp?: number;
  block_number?: number;
  confirmed?: boolean;
  token_info?: { address?: string };
  from?: string;
  to?: string;
  value?: string;
}

export interface TronTransferEvent {
  txHash: string;
  from: string;
  to: string;
  amount: number;
  contractAddress: string;
  blockNumber: number;
  confirmations: number;
  success: boolean;
  timestamp: number;
  logIndex: number;
}

const toAmount = (raw: string | undefined): number => {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n / 1_000_000; // USDT TRC20 = 6 decimals
};

export class TronClient {
  async getRecentUsdtTransfers(address: string): Promise<TronTransferEvent[]> {
    const base = ENGINE_CONFIG.tron.eventApiUrl.replace(/\/$/, "");
    const contract = ENGINE_CONFIG.tron.usdtContract;
    const url = `${base}/v1/accounts/${address}/transactions/trc20?limit=50&only_confirmed=true&contract_address=${contract}`;

    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`trongrid_http_${res.status}`);
    const data = (await res.json()) as { data?: TronGridRow[] };

    return (data.data ?? [])
      .filter((row) => (row.token_info?.address ?? "") === contract)
      .map((row) => ({
        txHash: String(row.transaction_id ?? ""),
        from: String(row.from ?? ""),
        to: String(row.to ?? ""),
        amount: toAmount(row.value),
        contractAddress: String(row.token_info?.address ?? ""),
        blockNumber: Number(row.block_number ?? 0),
        confirmations: row.confirmed ? ENGINE_CONFIG.tron.confirmationsRequired : 0,
        success: Boolean(row.confirmed ?? true),
        timestamp: Number(row.block_timestamp ?? Date.now()),
        logIndex: 0,
      }))
      .filter((evt) => evt.txHash && evt.to && evt.amount > 0)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
}
