export interface ExchangeBranding {
  id: string;
  name: string;
  shortCode: string;
  iconUrl: string;
}

const EXCHANGE_BRANDING: ExchangeBranding[] = [
  {
    id: "binance",
    name: "Binance",
    shortCode: "BN",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png",
  },
  {
    id: "gate",
    name: "Gate.io",
    shortCode: "GT",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/302.png",
  },
  {
    id: "bybit",
    name: "Bybit",
    shortCode: "BY",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/521.png",
  },
  {
    id: "okx",
    name: "OKX",
    shortCode: "OK",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/294.png",
  },
  {
    id: "coinbase",
    name: "Coinbase",
    shortCode: "CB",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/89.png",
  },
  {
    id: "kraken",
    name: "Kraken",
    shortCode: "KR",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/24.png",
  },
  {
    id: "kucoin",
    name: "KuCoin",
    shortCode: "KC",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/311.png",
  },
  {
    id: "bitget",
    name: "Bitget",
    shortCode: "BG",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png",
  },
  {
    id: "mexc",
    name: "MEXC",
    shortCode: "MX",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/544.png",
  },
  {
    id: "htx",
    name: "HTX",
    shortCode: "HT",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/102.png",
  },
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    shortCode: "HL",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/1344.png",
  },
  {
    id: "deribit",
    name: "Deribit",
    shortCode: "DR",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/38.png",
  },
  {
    id: "bitrium_labs",
    name: "Bitrium Labs",
    shortCode: "BL",
    iconUrl: "https://cdn.simpleicons.org/databricks/F5C542",
  },
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

export const getExchangeBranding = (input: string): ExchangeBranding => {
  const normalized = normalize(input);
  const byId = EXCHANGE_BRANDING.find((item) => item.id === normalized);
  if (byId) return byId;
  const byName = EXCHANGE_BRANDING.find((item) => normalize(item.name) === normalized);
  if (byName) return byName;
  if (normalized.includes("gate")) return EXCHANGE_BRANDING[1];
  if (normalized.includes("binance")) return EXCHANGE_BRANDING[0];
  if (normalized.includes("bybit")) return EXCHANGE_BRANDING[2];
  if (normalized.includes("okx")) return EXCHANGE_BRANDING[3];
  return {
    id: normalized || "custom",
    name: input,
    shortCode: (input.slice(0, 2) || "EX").toUpperCase(),
    iconUrl: "https://cdn.simpleicons.org/bitcoin/F5C542",
  };
};

const AI_PROVIDER_ICONS: Record<string, string> = {
  deepseek: "https://cdn.simpleicons.org/deepseek/8B5CF6",
  qwen: "https://cdn.simpleicons.org/alibabacloud/8B5CF6",
  openai: "https://cdn.simpleicons.org/openai/10A37F",
  claude: "https://cdn.simpleicons.org/anthropic/E8A27C",
  googlegemini: "https://cdn.simpleicons.org/googlegemini/8B5CF6",
  grok: "https://cdn.simpleicons.org/xai/37A8FF",
  kimi: "https://cdn.simpleicons.org/moonrepo/8B5CF6",
  perplexity: "https://cdn.simpleicons.org/perplexity/22B8CF",
};

const AI_PROVIDER_FALLBACK_COLORS: Record<string, string> = {
  deepseek: "#6D4AFF",
  qwen: "#7B61FF",
  openai: "#10A37F",
  claude: "#D08A6E",
  googlegemini: "#5F85FF",
  grok: "#37A8FF",
  kimi: "#8B5CF6",
  perplexity: "#22B8CF",
};

const makeMonogramIcon = (text: string, color: string) => {
  const initial = (text || "AI").trim().slice(0, 2).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='${color}' stop-opacity='0.95'/>
      <stop offset='100%' stop-color='#0f1319' stop-opacity='1'/>
    </linearGradient>
  </defs>
  <rect x='1' y='1' width='62' height='62' rx='14' fill='url(#g)' stroke='rgba(255,255,255,0.14)'/>
  <text x='32' y='38' text-anchor='middle' fill='white' font-size='24' font-family='Inter, Arial, sans-serif' font-weight='700'>${initial}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const getAiProviderIcon = (provider: string): string => {
  const key = normalize(provider);
  const direct = AI_PROVIDER_ICONS[key];
  if (direct) return direct;
  const color = AI_PROVIDER_FALLBACK_COLORS[key] ?? "#F5C542";
  return makeMonogramIcon(provider, color);
};
