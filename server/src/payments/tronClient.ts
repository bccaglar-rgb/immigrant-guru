import { PAYMENT_CONFIG } from "./config.ts";
import type { TronTransferEvent } from "./types.ts";

interface TronGridTransferResponseRow {
  transaction_id?: string;
  block_timestamp?: number;
  block_number?: number;
  confirmed?: boolean;
  token_info?: { address?: string };
  from?: string;
  to?: string;
  value?: string;
}

interface TronGridTransferResponse {
  data?: TronGridTransferResponseRow[];
}

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`tron_api_http_${res.status}`);
  return (await res.json()) as T;
};

const toAmount = (raw: string | undefined) => {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return 0;
  // USDT TRC20 uses 6 decimals.
  return n / 1_000_000;
};

export class TronClient {
  async getRecentUsdtTransfersToAddress(address: string): Promise<TronTransferEvent[]> {
    const base = PAYMENT_CONFIG.tron.eventApiUrl.replace(/\/$/, "");
    const url = `${base}/v1/accounts/${address}/transactions/trc20?limit=50&only_confirmed=true&contract_address=${PAYMENT_CONFIG.usdtContractAddress}`;
    const payload = await fetchJson<TronGridTransferResponse>(url);
    const rows = payload.data ?? [];

    return rows
      .filter((row) => (row.token_info?.address ?? "") === PAYMENT_CONFIG.usdtContractAddress)
      .map((row) => {
        const blockNumber = Number(row.block_number ?? 0);
        return {
          txHash: String(row.transaction_id ?? ""),
          from: String(row.from ?? ""),
          to: String(row.to ?? ""),
          amount: toAmount(row.value),
          contractAddress: String(row.token_info?.address ?? ""),
          blockNumber,
          confirmations: PAYMENT_CONFIG.confirmationsRequired,
          success: Boolean(row.confirmed ?? true),
          timestamp: Number(row.block_timestamp ?? Date.now()),
          logIndex: 0,
        } as TronTransferEvent;
      })
      .filter((evt) => evt.txHash && evt.to && evt.amount > 0)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
}
