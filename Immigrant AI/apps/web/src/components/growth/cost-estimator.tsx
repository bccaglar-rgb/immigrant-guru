"use client";

import { useMemo, useState } from "react";

import { VISAS } from "@/data/visa-catalog";

const RELOCATION_BASE_USD = 5500;
const PER_DEPENDENT_USD = 2200;
const INITIAL_HOUSING_USD = 3800;
const AIRFARE_PER_PERSON_USD = 900;

export function CostEstimator() {
  const [visaSlug, setVisaSlug] = useState(VISAS[0]?.slug ?? "");
  const [dependents, setDependents] = useState(0);
  const [wantLegal, setWantLegal] = useState(true);

  const visa = VISAS.find((v) => v.slug === visaSlug) ?? VISAS[0];

  const breakdown = useMemo(() => {
    const govLow = visa.typicalCostUsd.min;
    const govHigh = visa.typicalCostUsd.max;
    const legal = wantLegal ? Math.round((govLow + govHigh) / 2 * 1.2) : 0;
    const airfare = AIRFARE_PER_PERSON_USD * (1 + dependents);
    const housing = INITIAL_HOUSING_USD;
    const settlement = RELOCATION_BASE_USD + PER_DEPENDENT_USD * dependents;
    const subtotalLow = govLow + legal + airfare + housing + settlement;
    const subtotalHigh = govHigh + legal + airfare + housing + settlement;
    const contingencyLow = Math.round(subtotalLow * 0.1);
    const contingencyHigh = Math.round(subtotalHigh * 0.1);
    const totalLow = subtotalLow + contingencyLow;
    const totalHigh = subtotalHigh + contingencyHigh;
    return {
      gov: [govLow, govHigh],
      legal,
      airfare,
      housing,
      settlement,
      contingency: [contingencyLow, contingencyHigh],
      total: [totalLow, totalHigh]
    };
  }, [visa, dependents, wantLegal]);

  const fmt = (n: number) => `$${n.toLocaleString()}`;

  return (
    <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-white">Pathway</span>
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
          <span className="text-sm font-medium text-white">Dependents (spouse + kids)</span>
          <input
            type="number"
            min={0}
            max={10}
            value={dependents}
            onChange={(e) => setDependents(Number(e.target.value) || 0)}
            className="rounded-xl border border-white/15 bg-black/40 px-4 py-2 text-white"
          />
        </label>

        <label className="flex items-center gap-3 sm:col-span-2">
          <input
            type="checkbox"
            checked={wantLegal}
            onChange={(e) => setWantLegal(e.target.checked)}
          />
          <span className="text-sm text-white">Include estimated legal/agency fees</span>
        </label>
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
          Total estimated cost
        </div>
        <div className="mt-1 text-3xl font-semibold text-white">
          {fmt(breakdown.total[0])} – {fmt(breakdown.total[1])}
        </div>

        <dl className="mt-5 grid gap-2 text-sm">
          <Row label="Government fees" value={`${fmt(breakdown.gov[0])} – ${fmt(breakdown.gov[1])}`} />
          {wantLegal ? <Row label="Legal / agency" value={fmt(breakdown.legal)} /> : null}
          <Row label="Airfare" value={fmt(breakdown.airfare)} />
          <Row label="Initial housing" value={fmt(breakdown.housing)} />
          <Row label="Settlement funds" value={fmt(breakdown.settlement)} />
          <Row
            label="10% contingency"
            value={`${fmt(breakdown.contingency[0])} – ${fmt(breakdown.contingency[1])}`}
          />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-white/60">{label}</dt>
      <dd className="font-medium text-white">{value}</dd>
    </div>
  );
}
