export interface ConvertResponse {
  ok: boolean;
  exchange: string;
  sourceUsed: "EXCHANGE" | "FALLBACK_API";
  input: {
    from: string;
    to: string;
    amount: number;
  };
  pricing: {
    fromUsdPrice: number;
    toUsdPrice: number;
    rate: number;
    inverseRate: number;
    converted: number;
  };
  fx: {
    USD: number;
    EUR: number;
    TRY: number;
  };
  fetchedAt: string;
  error?: string;
}

export interface TickersResponse {
  ok: boolean;
  items: Array<{
    symbol: string;
    price: number;
    change24hPct: number;
  }>;
}

export interface SymbolsResponse {
  ok: boolean;
  symbols: string[];
}

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
};

export const fetchCoinCalculatorSymbols = async (exchange: string, sourceMode: "exchange" | "fallback") =>
  fetchJson<SymbolsResponse>(
    `/api/market/symbols?exchange=${encodeURIComponent(exchange)}&source=${sourceMode}`,
  );

export const fetchCoinCalculatorTickers = async (exchange: string, sourceMode: "exchange" | "fallback") =>
  fetchJson<TickersResponse>(
    `/api/market/tickers?exchange=${encodeURIComponent(exchange)}&source=${sourceMode}`,
  );

export const fetchCoinConversion = async (input: {
  exchange: string;
  sourceMode: "exchange" | "fallback";
  from: string;
  to: string;
  amount: number;
}) =>
  fetchJson<ConvertResponse>(
    `/api/market/convert?exchange=${encodeURIComponent(input.exchange)}&source=${input.sourceMode}&from=${encodeURIComponent(
      input.from.toUpperCase(),
    )}&to=${encodeURIComponent(input.to.toUpperCase())}&amount=${encodeURIComponent(String(input.amount))}`,
  );

