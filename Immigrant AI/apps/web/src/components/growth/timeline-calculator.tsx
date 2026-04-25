"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { VISAS } from "@/data/visa-catalog";

const PREP_MONTHS_MIN = 2;
const PREP_MONTHS_MAX = 4;
const LANDING_BUFFER_MONTHS = 1;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Math.round(months));
  return d;
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

export function TimelineCalculator() {
  const t = useTranslations();
  const [visaSlug, setVisaSlug] = useState(VISAS[0]?.slug ?? "");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const visa = VISAS.find((v) => v.slug === visaSlug) ?? VISAS[0];
  const start = useMemo(() => new Date(startDate), [startDate]);

  const stages = useMemo(() => {
    const prepEnd = addMonths(start, PREP_MONTHS_MAX);
    const processingMin = addMonths(prepEnd, visa.typicalTimelineMonths.min);
    const processingMax = addMonths(prepEnd, visa.typicalTimelineMonths.max);
    const landingMin = addMonths(processingMin, LANDING_BUFFER_MONTHS);
    const landingMax = addMonths(processingMax, LANDING_BUFFER_MONTHS);
    return [
      {
        name: t("Preparation"),
        detail: `${t("Gather evidence, evaluations, translations")} (${PREP_MONTHS_MIN}–${PREP_MONTHS_MAX} ${t("months")})`,
        range: `${fmtDate(start)} – ${fmtDate(prepEnd)}`
      },
      {
        name: t("Filing & processing"),
        detail: `${visa.code}: ${visa.typicalTimelineMonths.min}–${visa.typicalTimelineMonths.max} ${t("months")}`,
        range: `${fmtDate(prepEnd)} – ${fmtDate(processingMax)}`
      },
      {
        name: t("Travel & landing"),
        detail: t("Final medicals, tickets, housing setup"),
        range: `${fmtDate(landingMin)} – ${fmtDate(landingMax)}`
      }
    ];
  }, [visa, start, t]);

  const totalMin = PREP_MONTHS_MIN + visa.typicalTimelineMonths.min + LANDING_BUFFER_MONTHS;
  const totalMax = PREP_MONTHS_MAX + visa.typicalTimelineMonths.max + LANDING_BUFFER_MONTHS;

  return (
    <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-white">{t("Pathway")}</span>
          <select
            className="rounded-xl border border-white/15 bg-black/40 px-4 py-2 text-white"
            value={visaSlug}
            onChange={(e) => setVisaSlug(e.target.value)}
          >
            {VISAS.map((v) => (
              <option key={v.slug} value={v.slug}>
                {v.code} — {v.destination.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-white">{t("Start date")}</span>
          <input
            type="date"
            className="rounded-xl border border-white/15 bg-black/40 px-4 py-2 text-white"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
          {t("Estimated total")}
        </div>
        <div className="mt-1 text-3xl font-semibold text-white">
          {totalMin}–{totalMax} {t("months")}
        </div>
        <div className="mt-1 text-sm text-white/70">
          {t("Target landing")}: {fmtDate(addMonths(new Date(startDate), totalMin))} –{" "}
          {fmtDate(addMonths(new Date(startDate), totalMax))}
        </div>
      </div>

      <ol className="mt-6 space-y-4">
        {stages.map((stage, i) => (
          <li key={stage.name} className="flex gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
              {i + 1}
            </div>
            <div>
              <div className="font-semibold text-white">{stage.name}</div>
              <div className="text-sm text-white/60">{stage.detail}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-white/50">{stage.range}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
