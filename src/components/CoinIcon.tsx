import { useEffect, useMemo, useState } from "react";

interface CoinIconProps {
  symbol: string;
  className?: string;
}

const extractBase = (symbol: string) => {
  const upper = String(symbol ?? "")
    .toUpperCase()
    .replace("/", "")
    .replace("-", "")
    .replace("_", "");
  const quoteCandidates = ["USDT", "USDC", "USD", "BUSD", "FDUSD", "BTC", "ETH", "PERP"];
  for (const quote of quoteCandidates) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return upper.slice(0, -quote.length);
    }
  }
  return upper || "COIN";
};

const ICON_ALIAS: Record<string, string> = {
  SUI: "sui",
  WIF: "wif",
  PEPE: "pepe",
  BONK: "bonk",
};

const iconSlug = (base: string) => ICON_ALIAS[base] ?? base.toLowerCase();
const primaryLogo = (base: string) => `https://cryptoicons.org/api/icon/${base.toLowerCase()}/64`;
const secondaryLogo = (base: string) => `https://assets.coincap.io/assets/icons/${iconSlug(base)}@2x.png`;
const fallbackLogo = (base: string) =>
  `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${iconSlug(base)}.png`;

export const CoinIcon = ({ symbol, className = "h-5 w-5" }: CoinIconProps) => {
  const base = useMemo(() => extractBase(symbol), [symbol]);
  const first = base.slice(0, 1) || "?";

  const [src, setSrc] = useState<string>(() => primaryLogo(base));
  const [fallbackStep, setFallbackStep] = useState<0 | 1 | 2>(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(primaryLogo(base));
    setFallbackStep(0);
    setFailed(false);
  }, [base]);

  if (failed || !src) {
    return (
      <span
        className={`grid rounded-full border border-white/10 bg-[#1A1B1F] text-[10px] font-semibold text-[#BFC2C7] ${className}`}
      >
        {first}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={`${base} icon`}
      className={`rounded-full border border-white/10 bg-[#1A1B1F] object-cover ${className}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (fallbackStep === 0) {
          setSrc(secondaryLogo(base));
          setFallbackStep(1);
          return;
        }
        if (fallbackStep === 1) {
          setSrc(fallbackLogo(base));
          setFallbackStep(2);
          return;
        }
        setFailed(true);
      }}
    />
  );
};
