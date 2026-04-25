"use client";

import { useTranslations } from "next-intl";

import { DashboardCommandCard } from "@/components/dashboard/dashboard-command-card";
import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useCaseSimulation } from "@/hooks/use-case-simulation";
import { buildCaseSimulationInputs } from "@/lib/simulation-client";
import { cn } from "@/lib/utils";
import {
  educationLevelOptions,
  englishLevelOptions,
  type UserProfile
} from "@/types/profile";

type CaseSimulationPanelProps = Readonly<{
  caseId: string;
}>;

function formatDelta(value: number, suffix = "") {
  if (value === 0) {
    return `0${suffix}`;
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function scoreTone(value: number): "positive" | "warning" | "critical" | "neutral" {
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "critical";
  }
  return "neutral";
}

function timelineTone(value: number): "positive" | "warning" | "critical" | "neutral" {
  if (value < 0) {
    return "positive";
  }
  if (value > 0) {
    return "critical";
  }
  return "neutral";
}

function impactToneClass(tone: "positive" | "neutral" | "negative") {
  if (tone === "positive") {
    return "border-emerald-200/80 bg-emerald-50/70 text-emerald-950";
  }
  if (tone === "negative") {
    return "border-rose-200/80 bg-rose-50/70 text-rose-950";
  }
  return "border-line/80 bg-slate-50/80 text-ink/80";
}

function MetricCard({
  after,
  before,
  change,
  label,
  suffix = "",
  tone
}: Readonly<{
  after: number;
  before: number;
  change: number;
  label: string;
  suffix?: string;
  tone: "positive" | "warning" | "critical" | "neutral";
}>) {
  const t = useTranslations();
  const beforeWidth = Math.max(Math.min(before, 100), 6);
  const afterWidth = Math.max(Math.min(after, 100), 6);

  return (
    <div className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            {label}
          </p>
          <div className="mt-3 flex items-end gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted">
                {t("Before")}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-ink">
                {before.toFixed(1)}
                {suffix}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted">
                {t("After")}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-ink">
                {after.toFixed(1)}
                {suffix}
              </p>
            </div>
          </div>
        </div>
        <DashboardStatusPill label={formatDelta(change, suffix)} tone={tone} />
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.08em] text-muted">
            <span>{t("Current case")}</span>
            <span>
              {before.toFixed(1)}
              {suffix}
            </span>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-slate-100">
            <div className="h-2.5 rounded-full bg-slate-300" style={{ width: `${beforeWidth}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.08em] text-muted">
            <span>{t("Simulated case")}</span>
            <span>
              {after.toFixed(1)}
              {suffix}
            </span>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-slate-100">
            <div
              className="h-2.5 rounded-full bg-[linear-gradient(90deg,#0f172a,#2563eb)]"
              style={{ width: `${afterWidth}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function buildBaselineFromProfile(profile: UserProfile | null | undefined) {
  return buildCaseSimulationInputs({
    availableCapital: profile?.available_capital ?? null,
    educationLevel: profile?.education_level ?? null,
    englishLevel: profile?.english_level ?? null,
    yearsOfExperience: profile?.years_of_experience ?? null
  });
}

export function CaseSimulationPanel({ caseId }: CaseSimulationPanelProps) {
  const t = useTranslations();
  const { clearSession, session, status, user } = useAuthSession();
  const baseline = buildBaselineFromProfile(user?.profile);

  const { error, inputs, isLoading, reset, result, updateField } =
    useCaseSimulation({
      accessToken: session?.accessToken ?? "",
      baseline,
      caseId,
      enabled: status === "authenticated",
      onUnauthorized: clearSession
    });

  return (
    <DashboardCommandCard
      className="rounded-[32px]"
      eyebrow={t("Scenario simulation")}
      title={t("What-if pathway planning")}
      value={
        result ? (
          <div className="space-y-2 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {t("Confidence")}
            </p>
            <DashboardStatusPill
              label={result.simulated.confidence_level}
              tone={
                result.simulated.confidence_level === "HIGH"
                  ? "positive"
                  : result.simulated.confidence_level === "MEDIUM"
                    ? "warning"
                    : "critical"
              }
            />
          </div>
        ) : null
      }
    >
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-5 rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.82))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                {t("Simulation inputs")}
              </p>
              <h4 className="mt-2 text-xl font-semibold tracking-tight text-ink">
                {t("Test stronger profile scenarios")}
              </h4>
              <p className="mt-2 text-sm leading-6 text-muted">
                {t("Change the strongest planning variables and see how readiness, probability, and timeline shift for this case")}
              </p>
            </div>
            <Button onClick={reset} type="button" variant="secondary">
              {t("Reset")}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label={t("English level")}
              onChange={(event) =>
                updateField("englishLevel", event.target.value as typeof inputs.englishLevel)
              }
              value={inputs.englishLevel}
            >
              {englishLevelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <Select
              label={t("Education level")}
              onChange={(event) =>
                updateField("educationLevel", event.target.value as typeof inputs.educationLevel)
              }
              value={inputs.educationLevel}
            >
              {educationLevelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-5">
            <div className="rounded-[24px] border border-line/80 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {t("Available capital")}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {t("Strengthen execution flexibility and route resilience")}
                  </p>
                </div>
                <Input
                  className="w-36"
                  label={t("Capital")}
                  min={0}
                  onChange={(event) =>
                    updateField(
                      "availableCapital",
                      Number.isNaN(event.target.valueAsNumber)
                        ? 0
                        : Math.max(0, event.target.valueAsNumber)
                    )
                  }
                  type="number"
                  value={inputs.availableCapital}
                />
              </div>
              <input
                className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-accent"
                max={250000}
                min={0}
                onChange={(event) =>
                  updateField("availableCapital", Number(event.target.value))
                }
                step={5000}
                type="range"
                value={inputs.availableCapital}
              />
            </div>

            <div className="rounded-[24px] border border-line/80 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {t("Years of experience")}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {t("Test how deeper experience changes pathway strength")}
                  </p>
                </div>
                <Input
                  className="w-28"
                  label={t("Experience")}
                  max={20}
                  min={0}
                  onChange={(event) =>
                    updateField(
                      "yearsOfExperience",
                      Number.isNaN(event.target.valueAsNumber)
                        ? 0
                        : Math.max(0, Math.min(20, event.target.valueAsNumber))
                    )
                  }
                  type="number"
                  value={inputs.yearsOfExperience}
                />
              </div>
              <input
                className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-accent"
                max={20}
                min={0}
                onChange={(event) =>
                  updateField("yearsOfExperience", Number(event.target.value))
                }
                step={1}
                type="range"
                value={inputs.yearsOfExperience}
              />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {error ? (
            <div className="rounded-[28px] border border-rose-200/80 bg-rose-50/70 px-5 py-5 text-sm leading-6 text-rose-900">
              {error}
            </div>
          ) : null}

          {status === "loading" || isLoading || (!result && !error) ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="h-[220px] rounded-[24px] border border-line bg-white/60 anim-shimmer" />
              <div className="h-[220px] rounded-[24px] border border-line bg-white/60 anim-shimmer" />
              <div className="h-[200px] rounded-[28px] border border-line bg-white/60 anim-shimmer lg:col-span-2" />
              <div className="h-[220px] rounded-[28px] border border-line bg-white/60 anim-shimmer lg:col-span-2" />
            </div>
          ) : result ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <MetricCard
                  after={result.simulated.probability_score}
                  before={result.current.probability_score}
                  change={result.delta.probability_score_change}
                  label={t("Probability outlook")}
                  tone={scoreTone(result.delta.probability_score_change)}
                />
                <MetricCard
                  after={result.simulated.timeline_months}
                  before={result.current.timeline_months}
                  change={result.delta.timeline_months_change}
                  label={t("Estimated timeline")}
                  suffix=" mo"
                  tone={timelineTone(result.delta.timeline_months_change)}
                />
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                      {t("Impact summary")}
                    </p>
                    <h4 className="mt-2 text-xl font-semibold tracking-tight text-ink">
                      {t("What changes in this scenario")}
                    </h4>
                  </div>
                  <DashboardStatusPill
                    label={
                      result.delta.probability_score_change > 0
                        ? t("More competitive")
                        : result.delta.probability_score_change < 0
                          ? t("Weaker setup")
                          : t("Minor shift")
                    }
                    tone={scoreTone(result.delta.probability_score_change)}
                  />
                </div>

                <div className="mt-5 grid gap-3">
                  {result.impact_summary.map((item) => (
                    <div
                      className={cn(
                        "rounded-[22px] border px-4 py-4 text-sm leading-6",
                        impactToneClass(item.tone)
                      )}
                      key={item.id}
                    >
                      {item.summary}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                  {t("Recommended improvements")}
                </p>
                <h4 className="mt-2 text-xl font-semibold tracking-tight text-ink">
                  {t("Highest-leverage moves from this simulation")}
                </h4>
                <div className="mt-5 space-y-3">
                  {result.recommended_improvements.map((item) => (
                    <div
                      className="rounded-[24px] border border-line/80 bg-slate-50/80 p-4"
                      key={item.id}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            {item.title}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-muted">
                            {item.detail}
                          </p>
                        </div>
                        <DashboardStatusPill
                          label={item.impact_label}
                          tone={
                            item.impact_label === "High impact"
                              ? "accent"
                              : item.impact_label === "Medium impact"
                                ? "warning"
                                : "neutral"
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-5 text-xs leading-6 text-muted">
                  {result.disclaimer}
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </DashboardCommandCard>
  );
}
