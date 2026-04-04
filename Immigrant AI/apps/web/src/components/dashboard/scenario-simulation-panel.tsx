"use client";

import { DashboardCommandCard } from "@/components/dashboard/dashboard-command-card";
import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useScenarioSimulation } from "@/hooks/use-scenario-simulation";
import { cn } from "@/lib/utils";
import {
  educationLevelOptions,
  englishLevelOptions
} from "@/types/profile";
import type {
  ScenarioRecommendation,
  ScenarioSimulationInputs
} from "@/types/scenario-simulation";

type ScenarioSimulationPanelProps = Readonly<{
  baseline: ScenarioSimulationInputs;
  title?: string;
}>;

function formatDelta(value: number, suffix = "") {
  if (value === 0) {
    return `0${suffix}`;
  }

  const prefix = value > 0 ? "+" : "";

  return `${prefix}${value.toFixed(1)}${suffix}`;
}

function getDeltaTone(value: number): "positive" | "warning" | "critical" | "neutral" {
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "critical";
  }
  return "neutral";
}

function getTimelineTone(value: number): "positive" | "warning" | "critical" | "neutral" {
  if (value < 0) {
    return "positive";
  }
  if (value > 0) {
    return "critical";
  }
  return "neutral";
}

function getImpactToneClasses(tone: "positive" | "neutral" | "negative") {
  if (tone === "positive") {
    return "border-emerald-200/80 bg-emerald-50/70 text-emerald-950";
  }
  if (tone === "negative") {
    return "border-rose-200/80 bg-rose-50/70 text-rose-950";
  }
  return "border-slate-200/80 bg-slate-50/80 text-ink/80";
}

function MetricComparisonCard({
  after,
  before,
  change,
  label,
  suffix = "",
  tone = getDeltaTone(change)
}: Readonly<{
  after: number;
  before: number;
  change: number;
  label: string;
  suffix?: string;
  tone?: "positive" | "warning" | "critical" | "neutral";
}>) {
  const beforeWidth = Math.max(Math.min(before, 100), 6);
  const afterWidth = Math.max(Math.min(after, 100), 6);

  return (
    <div className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            {label}
          </p>
          <div className="mt-3 flex items-end gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted">
                Before
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-ink">
                {before.toFixed(1)}
                {suffix}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted">
                After
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
            <span>Current profile</span>
            <span>{before.toFixed(1)}{suffix}</span>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-slate-100">
            <div
              className="h-2.5 rounded-full bg-slate-300"
              style={{ width: `${beforeWidth}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.08em] text-muted">
            <span>Simulated profile</span>
            <span>{after.toFixed(1)}{suffix}</span>
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

function ScenarioRecommendationCard({
  recommendation
}: Readonly<{
  recommendation: ScenarioRecommendation;
}>) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink">
            {recommendation.title}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {recommendation.detail}
          </p>
        </div>
        <DashboardStatusPill
          label={recommendation.impactLabel}
          tone={
            recommendation.impactLabel === "High impact"
              ? "accent"
              : recommendation.impactLabel === "Medium impact"
                ? "warning"
                : "neutral"
          }
        />
      </div>
    </div>
  );
}

export function ScenarioSimulationPanel({
  baseline,
  title = "What-if strategy simulator"
}: ScenarioSimulationPanelProps) {
  const { current, reset, result, updateField } = useScenarioSimulation(baseline);

  return (
    <DashboardCommandCard
      className="rounded-[32px]"
      eyebrow="Scenario simulation"
      title={title}
      value={
        <div className="space-y-2 text-right">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            Live planning
          </p>
          <p className="text-sm font-medium text-ink/80">
            Test profile improvements before acting
          </p>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-5 rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.82))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                Scenario inputs
              </p>
              <h4 className="mt-2 text-xl font-semibold tracking-tight text-ink">
                Adjust the strongest decision variables
              </h4>
              <p className="mt-2 text-sm leading-6 text-muted">
                Compare a stronger profile scenario against the current baseline before committing time or money.
              </p>
            </div>
            <Button onClick={reset} type="button" variant="secondary">
              Reset
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="English level"
              onChange={(event) =>
                updateField("englishLevel", event.target.value as ScenarioSimulationInputs["englishLevel"])
              }
              value={current.englishLevel}
            >
              {englishLevelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <Select
              label="Education level"
              onChange={(event) =>
                updateField("educationLevel", event.target.value as ScenarioSimulationInputs["educationLevel"])
              }
              value={current.educationLevel}
            >
              {educationLevelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-5">
            <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Available capital
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Improve execution flexibility and pathway resilience.
                  </p>
                </div>
                <Input
                  className="w-36"
                  label="Capital"
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
                  value={current.availableCapital}
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
                value={current.availableCapital}
              />
              <div className="mt-2 flex items-center justify-between text-xs uppercase tracking-[0.08em] text-muted">
                <span>$0</span>
                <span>$250k</span>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Years of experience
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Stress-test how deeper experience changes positioning.
                  </p>
                </div>
                <Input
                  className="w-28"
                  label="Experience"
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
                  value={current.yearsOfExperience}
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
                value={current.yearsOfExperience}
              />
              <div className="mt-2 flex items-center justify-between text-xs uppercase tracking-[0.08em] text-muted">
                <span>0 years</span>
                <span>20 years</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <MetricComparisonCard
              after={result.probability.after}
              before={result.probability.before}
              change={result.probability.change}
              label="Probability outlook"
            />
            <MetricComparisonCard
              after={result.timeline.after}
              before={result.timeline.before}
              change={result.timeline.change}
              label="Estimated timeline"
              suffix=" mo"
              tone={getTimelineTone(result.timeline.change)}
            />
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                  Impact summary
                </p>
                <h4 className="mt-2 text-xl font-semibold tracking-tight text-ink">
                  What changes in this scenario
                </h4>
              </div>
              <DashboardStatusPill
                label={
                  result.probability.change > 0
                    ? "More competitive"
                    : result.probability.change < 0
                      ? "Weaker setup"
                      : "Minor shift"
                }
                tone={getDeltaTone(result.probability.change)}
              />
            </div>

            <div className="mt-5 grid gap-3">
              {result.impactSummary.map((item) => (
                <div
                  className={cn(
                    "rounded-[22px] border px-4 py-4 text-sm leading-6",
                    getImpactToneClasses(item.tone)
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
              Recommended improvements
            </p>
            <h4 className="mt-2 text-xl font-semibold tracking-tight text-ink">
              Highest-leverage moves from this simulation
            </h4>
            <div className="mt-5 space-y-3">
              {result.recommendedImprovements.map((recommendation) => (
                <ScenarioRecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardCommandCard>
  );
}
