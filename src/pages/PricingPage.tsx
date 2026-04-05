import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthToken } from "../services/authClient";
import { createInvoice } from "../services/paymentsApi";
import { useAuthStore } from "../hooks/useAuthStore";

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
      "Bitrium Quant Engine (50+ Signals)",
      "Sniper",
      "AI Coin Insights",
      "Super Charts (5 Charts)",
      "Crypto Market",
      "Indicators",
    ],
    pricing: {
      "1m": { total: 10, monthly: 10 },
      "3m": { total: 27, monthly: 9 },
      "6m": { total: 48, monthly: 8 },
      "12m": { total: 84, monthly: 7 },
    },
  },
  {
    name: "Trader",
    description: "AI-powered trading with automated bots",
    planIdPrefix: "trader",
    features: [
      "Bitrium Quant Engine (50+ Signals)",
      "Sniper",
      "AI Coin Insights",
      "Super Charts (10 Charts)",
      "Coin Universe",
      "Crypto Market",
      "1 Exchange Account",
      "Bots",
      "Portfolio",
      "Indicators",
    ],
    pricing: {
      "1m": { total: 20, monthly: 20 },
      "3m": { total: 54, monthly: 18 },
      "6m": { total: 96, monthly: 16 },
      "12m": { total: 168, monthly: 14 },
    },
    highlight: true,
    badge: "Most Popular",
  },
  {
    name: "Titan",
    description: "Unlimited power for professional traders",
    planIdPrefix: "titan",
    badge: "Best Value",
    features: [
      "Bitrium Quant Engine (50+ Signals)",
      "Sniper",
      "AI Coin Insights",
      "Institutional Command",
      "Super Charts (50 Charts)",
      "Coin Universe",
      "Crypto Market",
      "Unlimited Exchange Accounts",
      "Bots",
      "Portfolio",
      "Indicators",
    ],
    pricing: {
      "1m": { total: 30, monthly: 30 },
      "3m": { total: 81, monthly: 27 },
      "6m": { total: 144, monthly: 24 },
      "12m": { total: 252, monthly: 21 },
    },
  },
];

const BILLING_OPTIONS: { key: BillingPeriod; label: string }[] = [
  { key: "1m", label: "1 Mo" },
  { key: "3m", label: "3 Mo" },
  { key: "6m", label: "6 Mo" },
  { key: "12m", label: "12 Mo" },
];


const PREMIUM_FEATURES = new Set([
  "Institutional Command", "Bots", "Portfolio", "Bitrium Token", "AI Coin Insights", "Bitrium Quant Engine (50+ Signals)",
]);

const isPremium = (f: string) =>
  PREMIUM_FEATURES.has(f) || f.includes("Exchange Account") || f.includes("Super Charts (50") || f.includes("Super Charts (20") || f.includes("Super Charts (10");

const savingsPercent = (tier: Tier, period: BillingPeriod): number | null => {
  if (period === "1m") return null;
  const base = tier.pricing["1m"].monthly;
  const cur = tier.pricing[period].monthly;
  return Math.round(((base - cur) / base) * 100);
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

  // ── Derive membership from auth store (primary) or server/localStorage fallback ──
  const authUser = useAuthStore((s) => s.user);
  const authTier = authUser?.activePlanTier ?? null;
  const authEndAt = authUser?.activePlanEndAt ? new Date(authUser.activePlanEndAt) : null;

  const serverExpiry = activeSub ? new Date(activeSub.endAt) : null;
  const localExpiryRaw = typeof window !== "undefined" ? window.localStorage.getItem(MEMBERSHIP_EXPIRES_KEY) : null;
  const localExpiry = localExpiryRaw ? new Date(localExpiryRaw) : null;
  const expiryDate = authEndAt ?? serverExpiry ?? localExpiry;
  const hasMembership = authUser?.hasActivePlan ?? Boolean(expiryDate && !Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() > Date.now());

  // ── Current plan (auth store → server → localStorage) ──
  const serverPlanId = activeSub?.planId ?? null;
  const localPlanId = typeof window !== "undefined" ? window.localStorage.getItem(MEMBERSHIP_PLAN_KEY) : null;
  // Derive period from auth store days remaining when no server/local plan
  const authPeriodGuess: BillingPeriod | null = authEndAt
    ? (() => { const d = Math.ceil((authEndAt.getTime() - Date.now()) / (24*60*60*1000)); return d > 270 ? "12m" : d > 135 ? "6m" : d > 45 ? "3m" : "1m"; })()
    : null;
  const resolvedPlanId = serverPlanId ?? localPlanId ?? (authTier && authPeriodGuess ? `${authTier}-${authPeriodGuess}` : hasMembership ? "explorer-6m" : null);
  if (hasMembership && resolvedPlanId && !localPlanId) {
    try { window.localStorage.setItem(MEMBERSHIP_PLAN_KEY, resolvedPlanId); } catch { /* ignore */ }
  }
  const currentPlan = hasMembership ? parsePlanId(resolvedPlanId) : null;
  // Auth store tier is the ground truth
  const currentTierPrefix = authTier ?? currentPlan?.prefix ?? null;
  const currentPeriod = currentPlan?.period ?? null;
  const TIER_RANK: Record<string, number> = { explorer: 0, trader: 1, strategist: 2, titan: 3 };

  // ── Pro-rata upgrade credit calculation ──
  const calcUpgradeCredit = (newTotalPrice: number): { credit: number; youPay: number } | null => {
    if (!activeSub || !hasMembership) return null;
    const currentRank = TIER_RANK[currentTierPrefix ?? ""] ?? -1;
    // Only show credit for upgrades (not same tier or downgrade)
    if (currentRank < 0) return null;

    const startMs = Date.parse(activeSub.startAt);
    const endMs = Date.parse(activeSub.endAt);
    const totalDays = Math.max(1, (endMs - startMs) / (24 * 60 * 60 * 1000));
    const usedDays = Math.max(0, (Date.now() - startMs) / (24 * 60 * 60 * 1000));
    const remainingRatio = Math.max(0, 1 - usedDays / totalDays);
    const oldPrice = activeSub.planSnapshot?.priceUsdt ?? 0;
    const credit = Math.round(oldPrice * remainingRatio * 100) / 100;
    const youPay = Math.max(0, Math.round((newTotalPrice - credit) * 100) / 100);
    return { credit, youPay };
  };

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
    <main className="min-h-screen bg-[#0B0B0C] px-4 py-10 text-[#BFC2C7] md:px-6 md:py-16">
      <div className="mx-auto max-w-5xl space-y-10">
        {/* Header */}
        <section className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Unlock the Full Power of Bitrium
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#9ba3b4]">
            Professional-grade crypto analytics, AI-powered trading bots, and real-time quant signals — all in one platform.
          </p>
          <p className="mt-2 text-xs text-[#6B6F76]">Prices in USDT. Cancel anytime.</p>
        </section>

        {/* Tier cards */}
        <section className="grid items-stretch gap-6 md:grid-cols-3">
          {TIERS.map((tier) => {
            const isCurrentTier = currentTierPrefix === tier.planIdPrefix;
            const tierSelected = selection?.tierName === tier.name;
            const activePeriod = tierSelected ? selection.period : undefined;
            const selectedTierFeatures = selection ? TIERS.find((t) => t.name === selection.tierName)?.features ?? [] : [];
            const selectedTierIdx = selection ? TIERS.findIndex((t) => t.name === selection.tierName) : -1;
            const thisTierIdx = TIERS.findIndex((t) => t.name === tier.name);
            const anotherTierSelected = selection !== null && selection.tierName !== tier.name && thisTierIdx > selectedTierIdx;

            // Price to show prominently (selected period or 1m default)
            const displayPeriod = activePeriod ?? "1m";
            const displayPrice = tier.pricing[displayPeriod];

            return (
              <article
                key={tier.name}
                className={[
                  "relative flex flex-col rounded-2xl border p-6",
                  "bg-gradient-to-b from-white/[0.04] to-white/[0.01]",
                  "hover:scale-[1.02] transition-all duration-300",
                  tier.highlight
                    ? "border-[#F5C542]/50 shadow-[0_0_30px_rgba(245,197,66,0.12)]"
                    : "border-white/[0.08]",
                ].join(" ")}
              >
                {/* Badge */}
                {tier.badge && (
                  <span
                    className={[
                      "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full px-4 py-1 text-[10px] font-bold uppercase tracking-wider",
                      tier.highlight
                        ? "bg-gradient-to-r from-[#F5C542] to-[#E8A817] text-black shadow-[0_2px_12px_rgba(245,197,66,0.35)]"
                        : "bg-gradient-to-r from-[#5B8DEF] to-[#7C6FEF] text-white shadow-[0_2px_12px_rgba(91,141,239,0.3)]",
                    ].join(" ")}
                  >
                    {tier.badge}
                  </span>
                )}

                {/* Plan name + Your Plan badge */}
                <div className="flex items-center gap-2.5 mt-1">
                  <h2 className="text-2xl font-bold text-white">{tier.name}</h2>
                  {isCurrentTier && (
                    <span className="rounded-full bg-[#4caf50]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4caf50] ring-1 ring-[#4caf50]/30">
                      Your Plan
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-[#6B6F76]">{tier.description}</p>

                {/* Price display */}
                <div className="mt-5 mb-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-mono font-bold text-white">
                      {displayPrice.monthly}
                    </span>
                    <span className="text-sm font-medium text-[#6B6F76]">USDT /mo</span>
                  </div>
                  {displayPeriod !== "1m" && (
                    <p className="mt-0.5 text-xs text-[#6B6F76]">
                      billed as {displayPrice.total} USDT
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="mt-4 flex-1 space-y-2.5 text-sm">
                  {tier.features.map((f) => {
                    const prem = isPremium(f);
                    const isUniqueAdvantage = anotherTierSelected && prem && !selectedTierFeatures.includes(f);
                    const isDemoted = selection !== null && !tierSelected && thisTierIdx < selectedTierIdx && prem;
                    const showHighlight = prem && !isDemoted;
                    return (
                      <li
                        key={f}
                        className={[
                          "flex items-start gap-2.5",
                          isUniqueAdvantage ? "animate-[glow_2s_ease-in-out_infinite]" : "",
                        ].join(" ")}
                      >
                        <span className={`mt-0.5 text-xs flex-shrink-0 ${showHighlight ? "text-[#F5C542]" : "text-[#4caf50]"}`}>
                          {showHighlight ? "\u2605" : "\u2713"}
                        </span>
                        <span className={showHighlight ? "font-semibold text-white" : "text-[#BFC2C7]"}>{f}</span>
                      </li>
                    );
                  })}
                </ul>

                {/* Billing period selector */}
                <div className="mt-6 space-y-1.5">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#6B6F76]">Billing period</p>
                  {BILLING_OPTIONS.map(({ key, label }) => {
                    const p = tier.pricing[key];
                    const isSelected = activePeriod === key;
                    const isCurrentPlan = isCurrentTier && currentPeriod === key;
                    const isUpgrade = currentTierPrefix ? (TIER_RANK[tier.planIdPrefix] ?? 0) > (TIER_RANK[currentTierPrefix] ?? 0) : false;
                    const upgradeInfo = isUpgrade ? calcUpgradeCredit(p.total) : null;
                    const savings = savingsPercent(tier, key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => selectPlan(tier.name, key)}
                        className={[
                          "flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-[12px] whitespace-nowrap transition-all duration-200",
                          isCurrentPlan
                            ? "border-[#4caf50]/50 bg-[#4caf50]/[0.07] text-white"
                            : isSelected
                              ? "border-[#F5C542]/60 bg-[#F5C542]/[0.06] text-white"
                              : "border-white/[0.06] bg-white/[0.02] text-[#BFC2C7] hover:border-white/15 hover:bg-white/[0.04]",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-3 w-3 rounded-full border ${
                            isCurrentPlan ? "border-[#4caf50] bg-[#4caf50]" : isSelected ? "border-[#F5C542] bg-[#F5C542]" : "border-white/25"
                          }`} />
                          <span className="font-medium">{label}</span>
                          {isCurrentPlan && <span className="text-[9px] font-semibold text-[#4caf50]">Active</span>}
                          {savings !== null && !isCurrentPlan && <span className="text-[9px] font-semibold text-[#F5C542]">-{savings}%</span>}
                        </div>
                        <div className="flex items-baseline gap-1">
                          {upgradeInfo && upgradeInfo.credit > 0 ? (
                            <span className="font-bold font-mono text-[#F5C542]">{upgradeInfo.youPay.toFixed(0)} USDT</span>
                          ) : (
                            <span className={`font-bold font-mono ${isCurrentPlan ? "text-[#4caf50]" : isSelected ? "text-[#F5C542]" : "text-white"}`}>{p.total} USDT</span>
                          )}
                          {key !== "1m" && <span className="text-[10px] text-[#6B6F76]">({p.monthly}/mo)</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* CTA button */}
                {(() => {
                  const isHigherTier = currentTierPrefix ? (TIER_RANK[tier.planIdPrefix] ?? 0) > (TIER_RANK[currentTierPrefix] ?? 0) : false;
                  const isLowerTier = currentTierPrefix ? (TIER_RANK[tier.planIdPrefix] ?? 0) < (TIER_RANK[currentTierPrefix] ?? 0) : false;
                  const selectedUpgrade = tierSelected && isHigherTier ? calcUpgradeCredit(tier.pricing[selection!.period].total) : null;
                  const btnLabel = busyTier === tier.name
                    ? "Creating invoice..."
                    : isCurrentTier && !tierSelected
                      ? "Current Plan"
                      : isCurrentTier && tierSelected
                        ? "Extend Subscription"
                        : isHigherTier && !tierSelected
                          ? "Upgrade Subscription"
                          : isHigherTier && tierSelected && selectedUpgrade && selectedUpgrade.credit > 0
                            ? `Upgrade \u2014 ${selectedUpgrade.youPay.toFixed(2)} USDT`
                            : isHigherTier && tierSelected
                              ? "Upgrade Subscription"
                              : !tierSelected
                                ? "Select a plan"
                                : "Subscribe Now";

                  const isDisabled = (isCurrentTier && !tierSelected) || isLowerTier || (!tierSelected && !isHigherTier && !isCurrentTier) || busyTier === tier.name;

                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleSubscribe(tier)}
                        disabled={isDisabled}
                        className={[
                          "mt-5 w-full rounded-xl py-3 text-sm font-semibold transition-all duration-300",
                          isCurrentTier && !tierSelected
                            ? "cursor-default border border-[#4caf50]/30 bg-transparent text-[#4caf50]/70"
                            : isCurrentTier && tierSelected
                              ? "border border-[#4caf50] bg-[#4caf50]/10 text-[#4caf50] hover:bg-[#4caf50]/20 hover:scale-[1.02] active:scale-[0.97]"
                              : isHigherTier && !tierSelected
                                ? "bg-gradient-to-r from-[#F5C542] to-[#E8A817] text-black shadow-[0_2px_16px_rgba(245,197,66,0.25)] hover:shadow-[0_4px_24px_rgba(245,197,66,0.35)] hover:scale-[1.02]"
                                : isDisabled
                                  ? "cursor-not-allowed border border-white/[0.06] bg-white/[0.02] text-[#6B6F76]"
                                  : "bg-gradient-to-r from-[#F5C542] to-[#E8A817] text-black shadow-[0_2px_16px_rgba(245,197,66,0.25)] hover:shadow-[0_4px_24px_rgba(245,197,66,0.35)] hover:scale-[1.02] active:scale-[0.97]",
                          "disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none",
                        ].join(" ")}
                      >
                        {btnLabel}
                      </button>
                      {isHigherTier && !tierSelected && hasMembership && (
                        <p className="mt-1.5 text-center text-[10px] text-[#6B6F76]">Only pay the difference. Unused balance credited.</p>
                      )}
                    </>
                  );
                })()}
              </article>
            );
          })}
        </section>

        {err && (
          <section className="mx-auto max-w-2xl rounded-xl border border-[#704844] bg-[#271a19] p-3 text-sm text-[#d6b3af]">
            {err}
          </section>
        )}

        {/* Upgrade Policy */}
        {hasMembership && (
          <section className="mx-auto max-w-2xl rounded-2xl border border-[#F5C542]/10 bg-gradient-to-b from-white/[0.03] to-transparent p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#F5C542]">Instant Upgrade Guarantee</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#9ba3b4]">
              Upgrade anytime. The unused portion of your current plan is automatically credited toward your new plan. You only pay the difference. Your new plan starts fresh with a full billing cycle.
            </p>
          </section>
        )}

        {/* Referral */}
        <section className="mx-auto max-w-lg rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-transparent p-5">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-[#6B6F76]">Have a referral code?</p>
          <div className="flex gap-2.5">
            <input
              id="referral-input"
              type="text"
              placeholder="Enter referral code"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-sm text-white outline-none placeholder:text-[#6B6F76] focus:border-[#F5C542]/40 transition-colors"
            />
            <button
              type="button"
              disabled={!referralCode.trim() || referralLoading}
              onClick={handleRedeem}
              className="rounded-xl bg-gradient-to-r from-[#F5C542] to-[#E8A817] px-5 py-2.5 text-sm font-semibold text-black hover:shadow-[0_2px_12px_rgba(245,197,66,0.3)] transition-all disabled:opacity-50"
            >
              {referralLoading ? "Redeeming..." : "Redeem"}
            </button>
          </div>
          {referralMsg && (
            <p className={`mt-2.5 text-center text-xs ${referralMsgType === "success" ? "text-[#4caf50]" : "text-[#d6b3af]"}`}>
              {referralMsg}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
