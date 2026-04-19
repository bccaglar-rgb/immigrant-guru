import Link from "next/link";

export function LockedContent({
  heading,
  teaser,
  ctaHref,
  ctaLabel
}: {
  heading: string;
  teaser: string[];
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <section className="mt-12 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 p-6 sm:p-8">
      <h2 className="text-2xl font-semibold text-white">{heading}</h2>
      <div className="mt-4 space-y-2 text-white/80">
        {teaser.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      <div className="relative mt-6 rounded-2xl border border-white/10 bg-black/40 p-6">
        <div className="space-y-2 text-white/40 [filter:blur(5px)] select-none">
          <p>Plan A detailed breakdown: strongest evidence categories, filing risks, timing…</p>
          <p>Plan B alternate pathway with cost-adjusted comparison…</p>
          <p>Plan C fallback strategy: documentation needs, required experience…</p>
          <p>Personalized probability scoring across 12 dimensions…</p>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-full bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-white">
            🔒 Locked
          </div>
          <Link
            href={ctaHref}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90"
          >
            {ctaLabel}
          </Link>
          <p className="max-w-sm text-xs text-white/60">
            Free to start. No card required. Unlock your readiness score, top 3 plans, and next actions.
          </p>
        </div>
      </div>
    </section>
  );
}
