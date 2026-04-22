declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const AW_ID = "AW-18112097089";

export function fireConversionEvent(plan: string) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  window.gtag("event", "conversion", {
    send_to: `${AW_ID}/Fh9vCLD60KAcEMHWwrxD`,
    value: planValue(plan),
    currency: "USD"
  });
}

function planValue(plan: string): number {
  const values: Record<string, number> = {
    starter: 14.99,
    plus: 29.99,
    premium: 59.99
  };
  return values[plan.toLowerCase()] ?? 0;
}
