import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthToken } from "../services/authClient";
import { createInvoice } from "../services/paymentsApi";

const MEMBERSHIP_EXPIRES_KEY = "membership.expiresAt";
const MEMBERSHIP_PLAN_KEY = "membership.planId";

interface SubscriptionDto {
  id: string;
  planId: string;
  startAt: string;
  endAt: string;
  status: "active" | "expired" | "cancelled";
  planSnapshot: { name: string; priceUsdt: number; durationDays: number };
}

type BillingPeriod = "1m" | "3m" | "6m" | "12m";

interface TierPricing {
  total: number;
  monthly: number;
}

interface Tier {
  name: string;
  description: string;
  features: string[];
  pricing: Record<BillingPeriod, TierPricing>;
  highlight?: boolean;
  badge?: string;
  planIdPrefix: string;
}

const TIERS: Tier[] = [
  {
    name: "Explorer",
    description: "Essential tools to explore the crypto market",
    planIdPrefix: "explorer",
    features: [
      "Bitrium Quant Engine",
      "Quant Trade Ideas",
      "Super Charts",
      "Indicators",
      "Crypto Market",
      "Coin Universe",
    ],
    pricing: {
      "1m": { total: 49, monthly: 49 },
      "3m": { total: 117, monthly: 39 },
      "6m": { total: 179, monthly: 29 },
      "12m": { total: 228, monthly: 19 },
    },
  },
  {
    name: "Trader",
    description: "AI-powered trading with automated bots",
    planIdPrefix: "trader",
    features: [
      "Bitrium Quant Engine",
      "Quant Trade Ideas",
      "AI Trade Ideas",
      "AI Trader (1 Bot)",
      "3 Exchange Accounts",
      "Super Charts",
      "Indicators",
      "Crypto Market",
      "Coin Universe",
    ],
    pricing: {
      "1m": { total: 79, monthly: 79 },
      "3m": { total: 177, monthly: 59 },
      "6m": { total: 294, monthly: 49 },
      "12m": { total: 468, monthly: 39 },
    },
    highlight: true,
    badge: "Most Popular",
  },
  {
    name: "Strategist",
    description: "Advanced multi-bot strategies for serious traders",
    planIdPrefix: "strategist",
    features: [
      "Bitrium Quant Engine",
      "Quant Trade Ideas",
      "AI Trade Ideas",
      "AI Trader (5 Bots)",
      "5 Exchange Accounts",
      "Super Charts",
      "Indicators",
      "Crypto Market",
      "Coin Universe",
    ],
    pricing: {
      "1m": { total: 99, monthly: 99 },
      "3m": { total: 237, monthly: 79 },
      "6m": { total: 414, monthly: 69 },
      "12m": { total: 708, monthly: 59 },
    },
  },
  {
    name: "Titan",
    description: "Unlimited power for professional traders",
    planIdPrefix: "titan",
    badge: "Best Value",
    features: [
      "Bitrium Quant Engine",
      "Quant Trade Ideas",
      "AI Trade Ideas",
      "AI Trader (Unlimited Bots)",
      "Unlimited Exchange Accounts",
      "Super Charts",
      "Indicators",
      "Crypto Market",
      "Coin Universe",
    ],
    pricing: {
      "1m": { total: 179, monthly: 179 },
      "3m": { total: 417, monthly: 139 },
      "6m": { total: 714, monthly: 119 },
      "12m": { total: 1188, monthly: 99 },
    },
  },
];

const BILLING_OPTIONS: { key: BillingPeriod; label: string }[] = [
  { key: "1m", label: "1 Month" },
  { key: "3m", label: "3 Months" },
  { key: "6m", label: "6 Months" },
  { key: "12m", label: "12 Months" },
];

const PERIOD_LABELS: Record<BillingPeriod, string> = {
  "1m": "1 Month",
  "3m": "3 Months",
  "6m": "6 Months",
  "12m": "12 Months",
};

const tierBorder = (highlight?: boolean) => {
  if (highlight) return "border-[#F5C542]/50 shadow-[0_0_24px_rgba(245,197,66,0.08)]";
  return "border-white/10";
};

/** Parse "explorer-3m" → { prefix: "explorer", period: "3m" } */
const parsePlanId = (planId: string | null): { prefix: string; period: BillingPeriod } | null => {
  if (!planId) return null;
  const match = planId.match(/^(.+)-(1m|3m|6m|12m)$/);
  if (!match) return null;
  return { prefix: match[1], period: match[2] as BillingPeriod };
};

export default function PricingPage() {
  const nav = useNavigate();
  const [err, setErr] = useState("");
  const [busyTier, setBusyTier] = useState("");

  // ── Referral code redeem ──
  const [referralCode, setReferralCode] = useState("");
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralMsg, setReferralMsg] = useState("");
  const [referralMsgType, setReferralMsgType] = useState<"success" | "error">("success");

  const handleRedeem = async () => {
    if (!referralCode.trim() || referralLoading) return;
    setReferralLoading(true);
    setReferralMsg("");
    try {
      const res = await fetch("/api/referral/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        body: JSON.stringify({ code: referralCode.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setReferralMsgType("success");
        setReferralMsg(data.message ?? "Referral code redeemed successfully!");
        setReferralCode("");
      } else {
        setReferralMsgType("error");
        const errors: Record<string, string> = {
          invalid_code: "Invalid referral code.",
          code_inactive: "This referral code is no longer active.",
          code_expired: "This referral code has expired.",
          code_max_uses_reached: "This referral code has been fully used.",
          already_redeemed: "You have already redeemed this code.",
          unauthorized: "Please sign in to redeem a referral code.",
        };
        setReferralMsg(errors[data.error] ?? data.error ?? "Redemption failed.");
      }
    } catch {
      setReferralMsgType("error");
      setReferralMsg("Network error. Please try again.");
    } finally {
      setReferralLoading(false);
    }
  };

  // ── Server-fetched membership state ──
  const [activeSub, setActiveSub] = useState<SubscriptionDto | null>(null);

  useEffect(() => {
    if (!getAuthToken()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/payments/subscriptions/me", {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const subs: SubscriptionDto[] = Array.isArray(data.subscriptions) ? data.subscriptions : [];
        const now = Date.now();
        const active = subs
          .filter((s) => s.status === "active" && Date.parse(s.endAt) > now)
          .sort((a, b) => Date.parse(b.endAt) - Date.parse(a.endAt))[0] ?? null;
        if (!cancelled) {
          setActiveSub(active);
          // Sync to localStorage for other pages
          if (active) {
            window.localStorage.setItem(MEMBERSHIP_EXPIRES_KEY, active.endAt);
            window.localStorage.setItem(MEMBERSHIP_PLAN_KEY, active.planId);
          }
        }
      } catch { /* server unreachable — fall through to localStorage */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Derive membership from server data or localStorage fallback ──
  const serverExpiry = activeSub ? new Date(activeSub.endAt) : null;
  const localExpiryRaw = typeof window !== "undefined" ? window.localStorage.getItem(MEMBERSHIP_EXPIRES_KEY) : null;
  const localExpiry = localExpiryRaw ? new Date(localExpiryRaw) : null;
  const expiryDate = serverExpiry ?? localExpiry;
  const hasMembership = Boolean(expiryDate && !Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() > Date.now());
  const daysRemaining = hasMembership && expiryDate ? Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0;
  const expiryLabel = expiryDate ? expiryDate.toLocaleDateString("en-US") : "";

  // ── Current plan (server-first, localStorage fallback, then default) ──
  const serverPlanId = activeSub?.planId ?? null;
  const localPlanId = typeof window !== "undefined" ? window.localStorage.getItem(MEMBERSHIP_PLAN_KEY) : null;
  const resolvedPlanId = serverPlanId ?? localPlanId ?? (hasMembership ? "explorer-6m" : null);
  // Persist resolved planId so it sticks on next visit
  if (hasMembership && resolvedPlanId && !localPlanId) {
    try { window.localStorage.setItem(MEMBERSHIP_PLAN_KEY, resolvedPlanId); } catch { /* ignore */ }
  }
  const currentPlan = hasMembership ? parsePlanId(resolvedPlanId) : null;
  const currentTierPrefix = currentPlan?.prefix ?? null;
  const currentPeriod = currentPlan?.period ?? null;

  // ── Single selection state: only one tier+period at a time ──
  const [selection, setSelection] = useState<{ tierName: string; period: BillingPeriod } | null>(null);

  const selectPlan = (tierName: string, period: BillingPeriod) => {
    // Toggle off if same selection
    if (selection?.tierName === tierName && selection?.period === period) {
      setSelection(null);
    } else {
      setSelection({ tierName, period });
    }
  };

  const handleSubscribe = async (tier: Tier) => {
    const period = selection?.tierName === tier.name ? selection.period : null;
    if (!period) return;

    if (!getAuthToken()) {
      nav("/login");
      return;
    }
    try {
      setBusyTier(tier.name);
      const planId = `${tier.planIdPrefix}-${period}`;
      // Persist selected plan so pricing page shows it on return
      window.localStorage.setItem(MEMBERSHIP_PLAN_KEY, planId);
      const res = await createInvoice(planId);
      nav(`/checkout/${res.invoice.id}`);
    } catch (error: any) {
      setErr(error?.message ?? "Invoice creation failed");
    } finally {
      setBusyTier("");
    }
  };

  return (
    <>
    <style>{`
      @keyframes glow {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; text-shadow: 0 0 8px rgba(245,197,66,0.4); }
      }
    `}</style>
    <main className="min-h-screen bg-[#0B0B0C] p-3 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-5">
        {/* Header */}
        <section className="rounded-xl border border-white/10 bg-[#121316] p-5 text-center md:p-6">
          <h1 className="text-2xl font-bold text-white md:text-3xl">Unlock the Full Power of Bitrium</h1>
          <p className="mt-2 text-sm text-[#9ba3b4]">
            Professional-grade crypto analytics, AI-powered trading bots, and real-time quant signals — all in one platform.
          </p>
          <p className="mt-1 text-xs text-[#6B6F76]">Prices in USDT. Cancel anytime.</p>
        </section>

        {/* Tier cards */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TIERS.map((tier) => {
            const isCurrentTier = currentTierPrefix === tier.planIdPrefix;
            const tierSelected = selection?.tierName === tier.name;
            const activePeriod = tierSelected ? selection.period : undefined;
            // Find features of the selected tier to compare
            const selectedTierIdx = selection ? TIERS.findIndex((t) => t.name === selection.tierName) : -1;
            const thisTierIdx = TIERS.findIndex((t) => t.name === tier.name);
            const selectedTierFeatures = selection ? TIERS.find((t) => t.name === selection.tierName)?.features ?? [] : [];
            // Only glow on HIGHER tiers (not lower)
            const anotherTierSelected = selection !== null && selection.tierName !== tier.name && thisTierIdx > selectedTierIdx;

            return (
              <article
                key={tier.name}
                className={`relative flex flex-col rounded-xl border bg-[#121316] p-5 ${tierBorder(tier.highlight)}`}
              >
                {/* Badges */}
                {tier.badge ? (
                  <span className="absolute right-3 top-0 -translate-y-1/2 rounded-md bg-[#F5C542] px-2.5 py-0.5 text-[10px] font-bold uppercase text-black">
                    {tier.badge}
                  </span>
                ) : null}

                <h2 className="text-xl font-bold text-white">{tier.name}</h2>
                <p className="mt-1 text-xs text-[#6B6F76]">{tier.description}</p>

                {/* Features */}
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {tier.features.map((f) => {
                    const isPremiumFeature = f.includes("AI Trader") || f.includes("Exchange Accounts") || f === "AI Trade Ideas";
                    // When another (lower) tier is selected: this is a higher tier → show glow on unique features
                    const isUniqueAdvantage = anotherTierSelected && isPremiumFeature && !selectedTierFeatures.includes(f);
                    // When a higher tier is selected: this is a lower tier → demote premium styling
                    const isDemoted = selection !== null && !tierSelected && thisTierIdx < selectedTierIdx && isPremiumFeature;
                    // Show highlight only if not demoted
                    const showHighlight = isPremiumFeature && !isDemoted;
                    return (
                      <li key={f} className={`flex items-start gap-2 ${isUniqueAdvantage ? "animate-[glow_2s_ease-in-out_infinite]" : ""}`}>
                        <span className={`mt-0.5 text-xs ${showHighlight ? "text-[#F5C542]" : "text-[#4caf50]"}`}>
                          {showHighlight ? "\u2605" : "\u2713"}
                        </span>
                        <span className={showHighlight ? "font-bold text-white" : ""}>{f}</span>
                      </li>
                    );
                  })}
                </ul>

                {/* Pricing options */}
                <div className="mt-5 space-y-1.5">
                  {BILLING_OPTIONS.map(({ key, label }) => {
                    const p = tier.pricing[key];
                    const isSelected = activePeriod === key;
                    const isCurrentPlan = false;
                    const isMonthly = key === "1m";
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => selectPlan(tier.name, key)}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                          isCurrentPlan
                            ? "border-[#4caf50]/50 bg-[#162016] text-white"
                            : isSelected
                              ? "border-[#F5C542]/70 bg-[#2b2417] text-white"
                              : "border-white/10 bg-[#0F1012] text-[#BFC2C7] hover:border-white/20 hover:bg-[#17191d]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                            isCurrentPlan
                              ? "border-[#4caf50] bg-[#4caf50]"
                              : isSelected
                                ? "border-[#F5C542] bg-[#F5C542]"
                                : "border-white/30"
                          }`}>
                            {isCurrentPlan || isSelected ? <span className={`h-1.5 w-1.5 rounded-full ${isCurrentPlan ? "bg-white" : "bg-black"}`} /> : null}
                          </span>
                          <span className="font-medium">{label}</span>
                          {isCurrentPlan ? (
                            <span className="rounded bg-[#4caf50]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#4caf50]">Active</span>
                          ) : null}
                        </div>
                        <div className="text-right">
                          {isMonthly ? (
                            <span className={`font-bold ${isCurrentPlan ? "text-[#4caf50]" : isSelected ? "text-[#F5C542]" : "text-white"}`}>{p.total} USDT</span>
                          ) : (
                            <div className="flex items-baseline gap-1.5">
                              <span className={`font-bold ${isCurrentPlan ? "text-[#4caf50]" : isSelected ? "text-[#F5C542]" : "text-white"}`}>{p.total} USDT</span>
                              <span className="text-[11px] text-[#6B6F76]">({p.monthly} USDT/mo)</span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Subscribe button */}
                <button
                  type="button"
                  onClick={() => void handleSubscribe(tier)}
                  disabled={!tierSelected || busyTier === tier.name}
                  className={`group mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                    !tierSelected
                      ? "cursor-not-allowed border border-white/10 bg-[#17191d] text-[#6B6F76]"
                      : tier.highlight
                        ? "bg-[#F5C542] text-black hover:bg-[#e5b632] hover:shadow-[0_0_24px_rgba(245,197,66,0.4)] hover:scale-[1.02] active:scale-[0.97] active:shadow-[0_0_32px_rgba(245,197,66,0.6)]"
                        : "border border-[#7a6840] bg-[#2b2417] text-[#F5C542] hover:bg-[#3a3020] hover:shadow-[0_0_20px_rgba(245,197,66,0.2)] hover:scale-[1.02] active:scale-[0.97] active:shadow-[0_0_28px_rgba(245,197,66,0.4)]"
                  } disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none`}
                >
                  {busyTier === tier.name
                    ? "Creating invoice..."
                    : !tierSelected
                      ? "Select a plan"
                      : "Subscribe Now"}
                </button>
              </article>
            );
          })}
        </section>

        {err ? (
          <section className="mx-auto max-w-2xl rounded-xl border border-[#704844] bg-[#271a19] p-3 text-sm text-[#d6b3af]">
            {err}
          </section>
        ) : null}

        {/* Referral */}
        <section className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-[#121316] p-4">
          <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-[#6B6F76]">Have a referral code?</p>
          <div className="grid gap-2.5 md:grid-cols-[1fr_180px]">
            <input
              id="referral-input"
              type="text"
              placeholder="Enter referral code"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              className="rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6B6F76] focus:border-[#F5C542]/50"
            />
            <button
              type="button"
              disabled={!referralCode.trim() || referralLoading}
              onClick={handleRedeem}
              className="rounded-lg bg-[#F5C542] px-3 py-2 text-sm font-semibold text-black hover:bg-[#e5b632] disabled:opacity-50"
            >
              {referralLoading ? "Redeeming..." : "Redeem Code"}
            </button>
          </div>
          {referralMsg && (
            <p className={`mt-2 text-center text-xs ${referralMsgType === "success" ? "text-[#4caf50]" : "text-[#d6b3af]"}`}>
              {referralMsg}
            </p>
          )}
        </section>
      </div>
    </main>
    </>
  );
}
