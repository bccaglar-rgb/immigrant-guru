import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/* ───────────────────────── Inline SVG Icons ───────────────────────── */

const IconZap = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);
const IconBrain = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.7-3.3 6H8.3C6.3 13.7 5 11.5 5 9a7 7 0 0 1 7-7z" />
    <path d="M9 22h6" /><path d="M10 18h4" /><path d="M12 15v3" />
  </svg>
);
const IconGlobe = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="9" ry="4" /><path d="M12 3v18" />
  </svg>
);
const IconChart = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l5-4 4 2 7-8" /><path d="M19 7h2v2" /><path d="M3 21h18" />
  </svg>
);
const IconUser = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);
const IconLink = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.5-1.5" />
  </svg>
);
const IconShield = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l8 4v6c0 5.5-3.8 10-8 11-4.2-1-8-5.5-8-11V6l8-4z" />
  </svg>
);
const IconLock = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const IconServer = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="6" rx="1" /><rect x="3" y="14" width="18" height="6" rx="1" />
    <circle cx="7" cy="7" r="1" /><circle cx="7" cy="17" r="1" />
  </svg>
);
const IconKey = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="15" cy="9" r="5" /><path d="M2 22l7-7" /><path d="M6 18l3-3" />
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12l5 5L20 7" />
  </svg>
);
const IconArrowRight = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
  </svg>
);

/* ───────────────────── Animation Observer Hook ───────────────────── */

function useRevealOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("lp-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

const Reveal = ({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = useRevealOnScroll();
  return (
    <div ref={ref} className={`lp-reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
};

/* ──────────────────── Feature Card Component ──────────────────── */

const FeatureCard = ({
  icon,
  title,
  description,
  accent,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: string;
  delay?: number;
}) => (
  <Reveal delay={delay}>
    <div className="group relative rounded-2xl border border-white/10 bg-[var(--panel)] p-6 transition-all duration-300 hover:border-[var(--accent)]/20 hover:shadow-[0_0_40px_rgba(245,197,66,0.06)]">
      <div
        className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[var(--panelAlt)]"
        style={{ color: accent }}
      >
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">{title}</h3>
      <p className="text-sm leading-relaxed text-[var(--textMuted)]">{description}</p>
    </div>
  </Reveal>
);

/* ──────────────────────── Step Component ──────────────────────── */

const Step = ({
  number,
  icon,
  title,
  description,
  delay = 0,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}) => (
  <Reveal delay={delay} className="flex-1">
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-[var(--accent)]">
          {icon}
        </div>
        <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-black">
          {number}
        </span>
      </div>
      <h3 className="mb-1 text-base font-semibold text-[var(--text)]">{title}</h3>
      <p className="text-sm text-[var(--textMuted)]">{description}</p>
    </div>
  </Reveal>
);

/* ─────────────────── Why Card Component ─────────────────── */

const WhyCard = ({
  icon,
  title,
  description,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}) => (
  <Reveal delay={delay}>
    <div className="flex items-start gap-4 rounded-xl border border-white/5 bg-[var(--panelAlt)] p-4 transition-all duration-200 hover:border-white/10">
      <div className="mt-0.5 flex-shrink-0 text-[var(--accent)]">{icon}</div>
      <div>
        <h4 className="mb-1 text-sm font-semibold text-[var(--text)]">{title}</h4>
        <p className="text-sm leading-relaxed text-[var(--textSubtle)]">{description}</p>
      </div>
    </div>
  </Reveal>
);

/* ═══════════════════════ LANDING PAGE ═══════════════════════ */

export default function LandingPage() {
  const navigate = useNavigate();
  const goSignup = () => navigate("/signup");

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--textMuted)]">
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-10">

        {/* ━━━━━━━━━━━━━━ SECTION 1 — HERO ━━━━━━━━━━━━━━ */}
        <section className="relative mb-16 overflow-hidden rounded-3xl border border-white/10 bg-[var(--panel)] md:mb-20">
          {/* Gold glow background */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 20% 10%, rgba(245,197,66,0.10) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(245,197,66,0.04) 0%, transparent 50%)",
            }}
          />

          <div className="relative grid gap-8 p-6 md:grid-cols-2 md:gap-12 md:p-12 lg:p-16">
            {/* Left — Copy */}
            <div className="flex flex-col justify-center">
              <Reveal>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-4 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] lp-pulse" />
                  <span className="text-xs font-medium text-[var(--accent)]">Now Live</span>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="mb-4 text-3xl font-bold leading-[1.1] tracking-tight text-[var(--text)] md:text-4xl lg:text-5xl">
                  The All-in-One
                  <br />
                  <span className="text-[var(--accent)]">Crypto Super Platform</span>
                </h1>
              </Reveal>

              <Reveal delay={160}>
                <p className="mb-8 max-w-md text-base leading-relaxed text-[var(--textMuted)] md:text-lg">
                  Quant signals. AI trading. Real-time analytics. Everything you need to trade crypto like an institution — in one platform.
                </p>
              </Reveal>

              <Reveal delay={240}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={goSignup}
                    className="lp-cta-primary inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-8 py-3.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-[#e5b632] hover:shadow-[0_0_30px_rgba(245,197,66,0.3)]"
                  >
                    Get Started
                    <IconArrowRight />
                  </button>
                </div>
              </Reveal>
            </div>

            {/* Right — Platform Preview */}
            <Reveal delay={200} className="hidden md:flex md:items-center md:justify-end">
              <div className="relative">
                {/* Glow behind the preview */}
                <div className="absolute -inset-4 rounded-3xl bg-[var(--accent)]/5 blur-2xl" />
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg)] shadow-2xl" style={{ perspective: "1200px" }}>
                  <div
                    className="w-[480px] p-4"
                    style={{ transform: "rotateY(-4deg) rotateX(2deg)" }}
                  >
                    {/* Mock Dashboard Preview */}
                    <div className="mb-3 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                      <div className="text-xs font-medium text-[var(--accent)]">Bitrium Quant Engine</div>
                      <div className="ml-auto rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">LIVE</div>
                    </div>
                    {/* Signal cards mockup */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Trend Score", val: "82", color: "#2bc48a" },
                        { label: "Volume Spike", val: "3.4x", color: "#F5C542" },
                        { label: "OI Change", val: "+12.8%", color: "#66b3ff" },
                        { label: "Funding Rate", val: "0.012%", color: "#9f8bff" },
                        { label: "RSI Signal", val: "BULLISH", color: "#2bc48a" },
                        { label: "Regime", val: "Trending", color: "#F5C542" },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-lg border border-white/10 bg-[var(--panelAlt)] p-2"
                        >
                          <div className="text-[9px] text-[var(--textSubtle)]">{s.label}</div>
                          <div className="text-sm font-semibold" style={{ color: s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                    {/* Chart mockup */}
                    <div className="mt-3 rounded-lg border border-white/10 bg-[var(--panelAlt)] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[10px] text-[var(--textSubtle)]">BTC/USDT</span>
                        <span className="text-[10px] font-medium text-[#2bc48a]">+2.34%</span>
                      </div>
                      <svg viewBox="0 0 200 50" className="w-full" fill="none">
                        <path
                          d="M0 40 Q20 38 30 30 T60 28 Q70 26 80 20 T110 18 Q130 22 140 16 T170 12 Q180 14 190 8 L200 10"
                          stroke="#2bc48a"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M0 40 Q20 38 30 30 T60 28 Q70 26 80 20 T110 18 Q130 22 140 16 T170 12 Q180 14 190 8 L200 10 L200 50 L0 50 Z"
                          fill="url(#lp-grad)"
                          opacity="0.2"
                        />
                        <defs>
                          <linearGradient id="lp-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2bc48a" />
                            <stop offset="100%" stopColor="transparent" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━ SECTION 2 — TRUST BAR ━━━━━━━━━━━━━━ */}
        <Reveal>
          <section className="mb-16 md:mb-20">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { value: "50+", label: "Quant Signals" },
                { value: "Real-Time", label: "Market Data" },
                { value: "AI-Powered", label: "Trading Bots" },
                { value: "Multi-Exchange", label: "Support" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-white/5 bg-[var(--panelAlt)] p-4 text-center"
                >
                  <div className="text-lg font-bold text-[var(--accent)] md:text-xl">{stat.value}</div>
                  <div className="mt-1 text-xs text-[var(--textSubtle)]">{stat.label}</div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* ━━━━━━━━━━━━━━ SECTION 3 — CORE FEATURES ━━━━━━━━━━━━━━ */}
        <section className="mb-16 md:mb-20">
          <Reveal>
            <div className="mb-10 text-center">
              <h2 className="mb-3 text-2xl font-bold text-[var(--text)] md:text-3xl">
                Everything You Need. Nothing You Don't.
              </h2>
              <p className="mx-auto max-w-lg text-sm text-[var(--textMuted)]">
                From quantitative signals to automated AI trading — built for traders who demand more.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2">
            <FeatureCard
              icon={<IconZap />}
              title="Quant Engine"
              description="50+ quantitative signals analyzed in real-time. Make decisions backed by data, not hype."
              accent="#F5C542"
              delay={0}
            />
            <FeatureCard
              icon={<IconBrain />}
              title="AI Trader"
              description="Automated trading strategies powered by machine learning. Set your parameters and let AI do the work."
              accent="#2bc48a"
              delay={80}
            />
            <FeatureCard
              icon={<IconGlobe />}
              title="Coin Universe"
              description="Scan the entire crypto market in seconds. Score, rank, and discover opportunities before anyone else."
              accent="#66b3ff"
              delay={160}
            />
            <FeatureCard
              icon={<IconChart />}
              title="Super Charts"
              description="Professional-grade charting with 30+ indicators. Everything you need for technical analysis."
              accent="#9f8bff"
              delay={240}
            />
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━ SECTION 4 — PLATFORM SHOWCASE ━━━━━━━━━━━━━━ */}
        <section className="mb-16 md:mb-20">
          <Reveal>
            <div className="mb-8 text-center">
              <h2 className="mb-3 text-2xl font-bold text-[var(--text)] md:text-3xl">
                Built for Precision. Designed for Speed.
              </h2>
              <p className="text-sm text-[var(--textMuted)]">See what institutional-grade trading looks like.</p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--panel)]">
              {/* Glow */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: "radial-gradient(ellipse at 50% 0%, rgba(245,197,66,0.06) 0%, transparent 60%)",
                }}
              />

              {/* Platform mock */}
              <div className="relative p-6 md:p-8">
                {/* Header */}
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                  <span className="text-sm font-semibold text-[var(--text)]">Bitrium Quant Engine</span>
                  <div className="ml-auto flex gap-2">
                    <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-[10px] font-medium text-green-400">LIVE</span>
                    <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">PREMIUM</span>
                  </div>
                </div>

                {/* Signal grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                  {[
                    { label: "Trend Score", val: "82/100", color: "#2bc48a" },
                    { label: "Volume Spike", val: "3.4x", color: "#F5C542" },
                    { label: "OI Change", val: "+12.8%", color: "#66b3ff" },
                    { label: "Funding Rate", val: "0.012%", color: "#9f8bff" },
                    { label: "Consensus", val: "STRONG BUY", color: "#2bc48a" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-white/10 bg-[var(--panelAlt)] p-3">
                      <div className="text-[10px] text-[var(--textSubtle)]">{s.label}</div>
                      <div className="mt-1 text-sm font-bold" style={{ color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* Chart area */}
                <div className="mt-4 rounded-xl border border-white/10 bg-[var(--panelAlt)] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-[var(--text)]">BTC / USDT</span>
                      <span className="text-xs font-medium text-[#2bc48a]">$67,842.50</span>
                      <span className="text-[10px] text-[#2bc48a]">+2.34%</span>
                    </div>
                    <div className="flex gap-1.5">
                      {["1H", "4H", "1D", "1W"].map((tf) => (
                        <span key={tf} className={`rounded px-2 py-0.5 text-[10px] ${tf === "4H" ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "text-[var(--textSubtle)]"}`}>
                          {tf}
                        </span>
                      ))}
                    </div>
                  </div>
                  <svg viewBox="0 0 500 80" className="mt-3 w-full" fill="none">
                    <path
                      d="M0 60 Q30 55 50 45 T100 42 Q120 38 140 30 T200 25 Q230 30 260 22 T320 18 Q350 20 380 14 T440 10 Q460 12 480 6 L500 8"
                      stroke="#2bc48a"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M0 60 Q30 55 50 45 T100 42 Q120 38 140 30 T200 25 Q230 30 260 22 T320 18 Q350 20 380 14 T440 10 Q460 12 480 6 L500 8 L500 80 L0 80 Z"
                      fill="url(#lp-grad2)"
                      opacity="0.15"
                    />
                    <defs>
                      <linearGradient id="lp-grad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2bc48a" />
                        <stop offset="100%" stopColor="transparent" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>

              {/* Bottom badges */}
              <div className="flex flex-wrap items-center justify-center gap-4 border-t border-white/5 px-6 py-4">
                {["30+ Indicators", "Real-Time Signals", "One-Click Execution", "Multi-Timeframe"].map((badge) => (
                  <span key={badge} className="flex items-center gap-1.5 text-xs text-[var(--textMuted)]">
                    <IconCheck />
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ━━━━━━━━━━━━━━ SECTION 5 — HOW IT WORKS ━━━━━━━━━━━━━━ */}
        <section className="mb-16 md:mb-20">
          <Reveal>
            <div className="mb-10 text-center">
              <h2 className="mb-3 text-2xl font-bold text-[var(--text)] md:text-3xl">
                Start Trading in 3 Steps
              </h2>
            </div>
          </Reveal>

          <div className="relative mx-auto max-w-3xl">
            {/* Connecting line */}
            <div className="absolute left-1/2 top-8 hidden h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-[var(--accent)]/20 to-transparent md:block" />

            <div className="flex flex-col gap-8 md:flex-row md:gap-6">
              <Step
                number={1}
                icon={<IconUser />}
                title="Create Your Account"
                description="Sign up in under 30 seconds. No documents required."
                delay={0}
              />
              <Step
                number={2}
                icon={<IconLink />}
                title="Connect Your Exchange"
                description="Link Binance, Bybit, or OKX with read-only API keys."
                delay={120}
              />
              <Step
                number={3}
                icon={<IconZap />}
                title="Trade with AI & Quant Power"
                description="Access signals, launch AI bots, and trade with confidence."
                delay={240}
              />
            </div>
          </div>

          <Reveal delay={300}>
            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={goSignup}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-black transition-all duration-200 hover:bg-[#e5b632] hover:shadow-[0_0_30px_rgba(245,197,66,0.3)]"
              >
                Create Free Account
                <IconArrowRight />
              </button>
            </div>
          </Reveal>
        </section>

        {/* ━━━━━━━━━━━━━━ SECTION 6 — WHY BITRIUM ━━━━━━━━━━━━━━ */}
        <section className="mb-16 md:mb-20">
          <Reveal>
            <div className="mb-8 text-center">
              <h2 className="mb-3 text-2xl font-bold text-[var(--text)] md:text-3xl">
                Why Traders Choose Bitrium
              </h2>
            </div>
          </Reveal>

          <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
            <WhyCard
              icon={<IconGlobe />}
              title="All-in-One Platform"
              description="Stop switching between five different apps. Signals, charts, trading, and analytics — all in one place."
              delay={0}
            />
            <WhyCard
              icon={<IconZap />}
              title="Quant-Powered Signals"
              description="Every signal is backed by quantitative analysis. No influencer noise, no guesswork."
              delay={80}
            />
            <WhyCard
              icon={<IconBrain />}
              title="AI That Actually Works"
              description="Not just a buzzword. Real machine learning models trained on market data and tested in production."
              delay={160}
            />
            <WhyCard
              icon={<IconShield />}
              title="Transparent Pricing"
              description="No hidden fees. No surprise charges. What you see is what you pay."
              delay={240}
            />
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━ SECTION 7 — SECURITY & TRUST ━━━━━━━━━━━━━━ */}
        <Reveal>
          <section className="mb-16 rounded-2xl border border-white/5 bg-[var(--panelAlt)] p-6 md:mb-20 md:p-8">
            <h2 className="mb-6 text-center text-xl font-bold text-[var(--text)] md:text-2xl">
              Your Security. Our Priority.
            </h2>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { icon: <IconLock />, title: "AES-256 Encryption", desc: "All API keys encrypted at rest" },
                { icon: <IconShield />, title: "Non-Custodial", desc: "We never hold your funds" },
                { icon: <IconKey />, title: "Read-Only API", desc: "Trade signals, not your wallet" },
                { icon: <IconServer />, title: "99.9% Uptime", desc: "Enterprise infrastructure" },
              ].map((item) => (
                <div key={item.title} className="text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[var(--panel)] text-[var(--accent)]">
                    {item.icon}
                  </div>
                  <div className="text-xs font-semibold text-[var(--text)]">{item.title}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--textSubtle)]">{item.desc}</div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* ━━━━━━━━━━━━━━ SECTION 8 — FINAL CTA ━━━━━━━━━━━━━━ */}
        <section className="relative mb-12 overflow-hidden rounded-3xl border border-white/10 bg-[var(--panel)]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 50% 50%, rgba(245,197,66,0.08) 0%, transparent 60%)",
            }}
          />

          <div className="relative px-6 py-14 text-center md:py-20">
            <Reveal>
              <h2 className="mb-4 text-2xl font-bold text-[var(--text)] md:text-4xl">
                Ready to Trade Smarter?
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <p className="mx-auto mb-8 max-w-md text-sm text-[var(--textMuted)] md:text-base">
                Join thousands of traders who already made the switch to data-driven, AI-powered trading.
              </p>
            </Reveal>
            <Reveal delay={160}>
              <button
                type="button"
                onClick={goSignup}
                className="lp-cta-primary inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-10 py-4 text-base font-bold text-black transition-all duration-200 hover:bg-[#e5b632] hover:shadow-[0_0_40px_rgba(245,197,66,0.35)]"
              >
                Get Started
                <IconArrowRight />
              </button>
            </Reveal>
            <Reveal delay={220}>
              <p className="mt-4 text-xs text-[var(--textSubtle)]">
                Join the future of crypto trading
              </p>
            </Reveal>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━ FOOTER ━━━━━━━━━━━━━━ */}
        <footer className="border-t border-white/5 py-6 text-center">
          <p className="text-xs text-[var(--textSubtle)]">
            &copy; 2026 Bitrium. All rights reserved.
          </p>
          <div className="mt-2 flex items-center justify-center gap-4 text-xs text-[var(--textSubtle)]">
            <span className="cursor-pointer transition-colors hover:text-[var(--textMuted)]">Terms of Service</span>
            <span>&middot;</span>
            <span className="cursor-pointer transition-colors hover:text-[var(--textMuted)]">Privacy Policy</span>
            <span>&middot;</span>
            <span className="cursor-pointer transition-colors hover:text-[var(--textMuted)]">Support</span>
          </div>
        </footer>

      </div>

      {/* ━━━━━━ Mobile sticky CTA bar ━━━━━━ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[var(--panel)]/95 px-4 py-3 backdrop-blur-lg md:hidden">
        <button
          type="button"
          onClick={goSignup}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-black"
        >
          Get Started
          <IconArrowRight />
        </button>
      </div>
    </main>
  );
}
