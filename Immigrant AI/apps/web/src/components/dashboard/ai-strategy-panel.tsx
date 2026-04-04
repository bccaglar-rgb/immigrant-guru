"use client";

import { useEffect, useState } from "react";

import { StrategyPlanCard } from "@/components/dashboard/strategy-plan-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  clearAIStrategyCache,
  readAIStrategyCache,
  writeAIStrategyCache
} from "@/lib/ai-strategy-cache";
import { generateAIStrategy } from "@/lib/ai-client";
import type { ImmigrationCase } from "@/types/cases";
import type {
  AIStrategyResponse,
  StrategyContextMode,
  StrategyPlanLabel
} from "@/types/ai";

type AIStrategyPanelProps = Readonly<{
  accessToken: string;
  caseRecord: ImmigrationCase;
}>;

const planSlots: Array<{
  emphasis: "balanced" | "reserve" | "strong";
  label: StrategyPlanLabel;
}> = [
  { emphasis: "strong", label: "Plan A" },
  { emphasis: "balanced", label: "Plan B" },
  { emphasis: "reserve", label: "Plan C" }
];

const defaultQuestion =
  "Compare the strongest immigration options for this case and identify the best route right now.";

function formatConfidenceLabel(value: AIStrategyResponse["confidence_label"]): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function getConfidenceClasses(value: AIStrategyResponse["confidence_label"]): string {
  if (value === "high") {
    return "border-green/20 bg-green/10 text-green";
  }

  if (value === "medium") {
    return "border-amber-200/30 bg-amber-50 text-amber-800";
  }

  if (value === "insufficient_information") {
    return "border-red/20 bg-red/5 text-red";
  }

  return "border-red/20 bg-red/5 text-red";
}

export function AIStrategyPanel({
  accessToken,
  caseRecord
}: AIStrategyPanelProps) {
  const { clearSession } = useAuthSession();
  const [question, setQuestion] = useState(defaultQuestion);
  const [contextMode, setContextMode] = useState<StrategyContextMode>("case-aware");
  const [strategy, setStrategy] = useState<AIStrategyResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleMessage, setStaleMessage] = useState<string | null>(null);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      const cached = readAIStrategyCache(caseRecord.id);

      if (!cached) {
        setStrategy(null);
        setStaleMessage(null);
        return;
      }

      setQuestion(cached.question);
      setContextMode(cached.contextMode);

      if (cached.caseUpdatedAt !== caseRecord.updated_at) {
        clearAIStrategyCache(caseRecord.id);
        setStrategy(null);
        setStaleMessage(
          "Case details changed after the last strategy run. Generate a fresh strategy to reflect the latest inputs."
        );
        return;
      }

      setStrategy(cached.strategy);
      setStaleMessage(null);
    }, 0);

    return () => {
      window.clearTimeout(syncTimer);
    };
  }, [caseRecord.id, caseRecord.updated_at]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setStaleMessage(null);

    const result = await generateAIStrategy(accessToken, {
      case_id: caseRecord.id,
      context_mode: contextMode,
      question
    });

    setIsGenerating(false);

    if (!result.ok) {
      if (result.status === 401) {
        clearSession();
        return;
      }

      setError(result.errorMessage);
      return;
    }

    setStrategy(result.data);
    writeAIStrategyCache({
      caseId: caseRecord.id,
      caseUpdatedAt: caseRecord.updated_at,
      contextMode,
      question,
      strategy: result.data
    });
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-accent/10 bg-gradient-to-br from-white via-white to-accent/5 p-6 md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
              AI Strategy
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
              Decision panel for {caseRecord.target_country || "this migration case"}
            </h3>
            <p className="mt-3 text-sm leading-7 text-muted">
              Generate a structured comparison of up to three viable plans, with
              tradeoffs, confidence, and immediate next actions.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-white/90 px-4 py-4 text-sm text-muted lg:max-w-[320px]">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
              Case focus
            </p>
            <p className="mt-2 font-semibold text-ink">{caseRecord.title}</p>
            <p className="mt-2 leading-7">
              {caseRecord.target_program || "Pathway not specified yet"}
              {caseRecord.target_country ? ` · ${caseRecord.target_country}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
          <Textarea
            disabled={isGenerating}
            helperText="Ask for route comparison, fallback strategies, or strategic tradeoffs."
            label="Strategy question"
            onChange={(event) => {
              setQuestion(event.target.value);
              setError(null);
            }}
            placeholder={defaultQuestion}
            value={question}
          />
          <div className="space-y-4">
            <Select
              disabled={isGenerating}
              label="Context depth"
              onChange={(event) => {
                setContextMode(event.target.value as StrategyContextMode);
                setError(null);
              }}
              value={contextMode}
            >
              <option value="case-aware">Case-aware</option>
              <option value="profile-aware">Profile-aware</option>
              <option value="full">Full context</option>
            </Select>
            <Button
              disabled={isGenerating || question.trim().length < 10}
              fullWidth
              onClick={handleGenerate}
              size="lg"
              type="button"
            >
              {isGenerating ? "Generating strategy..." : "Generate strategy"}
            </Button>
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="border-red/20 bg-red/5 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-red">
            Strategy unavailable
          </p>
          <p className="mt-3 text-sm leading-7 text-red">{error}</p>
          <Button
            className="mt-5"
            onClick={handleGenerate}
            type="button"
            variant="secondary"
          >
            Retry strategy
          </Button>
        </Card>
      ) : null}

      {staleMessage ? (
        <Card className="border-red/20 bg-red/5 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-red">
            Strategy refresh recommended
          </p>
          <p className="mt-3 text-sm leading-7 text-red">{staleMessage}</p>
        </Card>
      ) : null}

      {isGenerating ? (
        <div className="space-y-6">
          <Card className="h-52 animate-pulse p-6" />
          <div className="grid gap-4 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card className="h-[420px] animate-pulse p-6" key={index} />
            ))}
          </div>
        </div>
      ) : null}

      {!strategy && !isGenerating ? (
        <Card className="border-line bg-white/90 p-6 md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                Comparison surface
              </p>
              <h4 className="mt-3 text-xl font-semibold tracking-tight text-ink">
                Plan A / B / C will render here
              </h4>
              <p className="mt-3 text-sm leading-8 text-muted">
                Generate strategy output to compare a primary route, fallback
                alternatives, missing information, and coordinated next actions in a
                structured decision panel.
              </p>
            </div>
            <div className="rounded-xl border border-line bg-canvas/50 px-4 py-4 text-sm text-muted lg:max-w-[300px]">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
                Recommended first pass
              </p>
              <p className="mt-2 leading-7">
                Start with `case-aware` mode, then switch to `full` once the profile
                is more complete.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {planSlots.map((slot) => (
              <StrategyPlanCard
                emphasis={slot.emphasis}
                key={slot.label}
                plan={null}
                slotLabel={slot.label}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {strategy ? (
        <div className="space-y-6">
          <Card className="p-6 md:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                  Strategy summary
                </p>
                <h4 className="mt-3 text-xl font-semibold tracking-tight text-ink">
                  Comparative route view
                </h4>
                <p className="mt-4 text-sm leading-8 text-muted">
                  {strategy.summary}
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:min-w-[220px]">
                <div
                  className={`rounded-xl border px-4 py-4 text-sm ${getConfidenceClasses(
                    strategy.confidence_label
                  )}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.08em]">
                    Confidence
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {formatConfidenceLabel(strategy.confidence_label)}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.08em]">
                    Score {Math.round(strategy.confidence_score)}/100
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-canvas/50 px-4 py-4 text-sm text-muted">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
                    Model context
                  </p>
                  <p className="mt-2 font-semibold text-ink">{strategy.model}</p>
                  <p className="mt-1">{strategy.provider}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.08em] text-accent">
                    {strategy.grounding_used
                      ? `Grounded via ${strategy.grounding_backend || "knowledge base"}`
                      : "Ungrounded pass"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-xl border border-line bg-canvas/50 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  Missing information
                </p>
                <div className="mt-3 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-red">
                      Critical
                    </p>
                    {strategy.missing_information_by_severity.critical.length > 0 ? (
                      <ul className="mt-2 space-y-2 text-sm leading-7 text-muted">
                        {strategy.missing_information_by_severity.critical.map((item) => (
                          <li
                            className="rounded-2xl border border-red/20 bg-white px-4 py-3"
                            key={item}
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm leading-7 text-muted">
                        No critical blockers were detected in the current structured inputs.
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
                      Helpful
                    </p>
                    {strategy.missing_information_by_severity.helpful.length > 0 ? (
                      <ul className="mt-2 space-y-2 text-sm leading-7 text-muted">
                        {strategy.missing_information_by_severity.helpful.map((item) => (
                          <li
                            className="rounded-2xl border border-line bg-white px-4 py-3"
                            key={item}
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm leading-7 text-muted">
                        No additional helpful gaps were flagged for this pass.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-canvas/50 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  Next steps
                </p>
                {strategy.next_steps.length > 0 ? (
                  <ol className="mt-3 space-y-2 text-sm leading-7 text-muted">
                    {strategy.next_steps.map((step) => (
                      <li
                        className="rounded-2xl border border-line bg-white px-4 py-3"
                        key={step}
                      >
                        {step}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-sm leading-7 text-muted">
                    No cross-plan next actions were returned yet.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
              <div className="rounded-xl border border-line bg-canvas/50 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  Confidence drivers
                </p>
                {strategy.confidence_reasons.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-sm leading-7 text-muted">
                    {strategy.confidence_reasons.map((reason) => (
                      <li
                        className="rounded-2xl border border-line bg-white px-4 py-3"
                        key={reason}
                      >
                        {reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm leading-7 text-muted">
                    Confidence drivers were not available for this strategy pass.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-line bg-canvas/50 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  Source attribution
                </p>
                {strategy.sources_used.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-sm leading-7 text-muted">
                    {strategy.sources_used.map((source) => (
                      <li
                        className="rounded-2xl border border-line bg-white px-4 py-3"
                        key={source.source_id}
                      >
                        <p className="font-semibold text-ink">{source.source_name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.08em] text-muted">
                          {source.source_type.replaceAll("_", " ")}
                          {source.country ? ` · ${source.country}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm leading-7 text-muted">
                    No source attributions were attached to this strategy run.
                  </p>
                )}
              </div>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            {planSlots.map((slot) => (
              <StrategyPlanCard
                emphasis={slot.emphasis}
                key={slot.label}
                plan={strategy.plans.find((plan) => plan.label === slot.label) ?? null}
                slotLabel={slot.label}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
