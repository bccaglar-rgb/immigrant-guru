"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { VISAS, type Visa } from "@/data/visa-catalog";

type Answers = {
  hasDegree: boolean;
  experienceYears: number;
  englishLevel: "none" | "basic" | "fluent" | "native";
  hasJobOffer: boolean;
  hasPatentsOrPublications: boolean;
  monthlyIncomeUsd: number;
};

const DEFAULT_ANSWERS: Answers = {
  hasDegree: false,
  experienceYears: 0,
  englishLevel: "basic",
  hasJobOffer: false,
  hasPatentsOrPublications: false,
  monthlyIncomeUsd: 0
};

function scoreVisa(visa: Visa, a: Answers): number {
  let score = 0;
  const text = (visa.requirements.join(" ") + " " + visa.category).toLowerCase();

  if (a.hasDegree) score += 20;
  if (a.experienceYears >= 3) score += 15;
  if (a.experienceYears >= 7) score += 10;
  if (a.englishLevel === "fluent" || a.englishLevel === "native") score += 15;

  if (a.hasJobOffer && (text.includes("sponsor") || text.includes("employer") || text.includes("job offer"))) {
    score += 25;
  }
  if (!a.hasJobOffer && (visa.category === "talent" || text.includes("no employer"))) {
    score += 15;
  }
  if (a.hasPatentsOrPublications && (visa.category === "talent" || visa.category === "startup")) {
    score += 20;
  }
  if (a.monthlyIncomeUsd >= 2500 && visa.category === "investor") score += 20;

  return Math.min(score, 100);
}

export function EligibilityChecker() {
  const t = useTranslations();
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  const [submitted, setSubmitted] = useState(false);

  const results = useMemo(() => {
    return VISAS.map((v) => ({ visa: v, score: scoreVisa(v, answers) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, 5);
  }, [answers]);

  return (
    <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
      <div className="grid gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-white">{t("Highest education")}</span>
          <select
            className="rounded-xl border border-white/15 bg-black/40 px-4 py-2 text-white"
            value={answers.hasDegree ? "degree" : "none"}
            onChange={(e) =>
              setAnswers({ ...answers, hasDegree: e.target.value === "degree" })
            }
          >
            <option value="none">{t("No bachelor's degree")}</option>
            <option value="degree">{t("Bachelor's degree or higher")}</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-white">{t("Years of professional experience")}</span>
          <input
            type="number"
            min={0}
            max={40}
            className="rounded-xl border border-white/15 bg-black/40 px-4 py-2 text-white"
            value={answers.experienceYears}
            onChange={(e) =>
              setAnswers({ ...answers, experienceYears: Number(e.target.value) || 0 })
            }
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-white">{t("English proficiency")}</span>
          <select
            className="rounded-xl border border-white/15 bg-black/40 px-4 py-2 text-white"
            value={answers.englishLevel}
            onChange={(e) =>
              setAnswers({ ...answers, englishLevel: e.target.value as Answers["englishLevel"] })
            }
          >
            <option value="none">{t("None")}</option>
            <option value="basic">{t("Basic")}</option>
            <option value="fluent">{t("Fluent")}</option>
            <option value="native">{t("Native")}</option>
          </select>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={answers.hasJobOffer}
            onChange={(e) => setAnswers({ ...answers, hasJobOffer: e.target.checked })}
          />
          <span className="text-sm text-white">{t("I have (or am close to getting) a job offer abroad")}</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={answers.hasPatentsOrPublications}
            onChange={(e) =>
              setAnswers({ ...answers, hasPatentsOrPublications: e.target.checked })
            }
          />
          <span className="text-sm text-white">
            {t("I have patents, publications, awards, or significant recognition")}
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-white">{t("Monthly passive or remote income (USD)")}</span>
          <input
            type="number"
            min={0}
            className="rounded-xl border border-white/15 bg-black/40 px-4 py-2 text-white"
            value={answers.monthlyIncomeUsd}
            onChange={(e) =>
              setAnswers({ ...answers, monthlyIncomeUsd: Number(e.target.value) || 0 })
            }
          />
        </label>

        <button
          type="button"
          className="mt-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
          onClick={() => setSubmitted(true)}
        >
          {t("Check eligibility")}
        </button>
      </div>

      {submitted ? (
        <div className="mt-8 space-y-3">
          <h3 className="text-lg font-semibold text-white">{t("Your top matches")}</h3>
          {results.map(({ visa, score }) => (
            <div
              key={visa.slug}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3"
            >
              <div>
                <div className="font-medium text-white">{visa.code} — {visa.name}</div>
                <div className="text-xs text-white/60">{visa.destination.toUpperCase()} · {visa.category}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-28">
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-emerald-400"
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
                <div className="w-10 text-right font-semibold text-white">{score}</div>
              </div>
            </div>
          ))}
          <div className="pt-3">
            <Link
              href="/sign-up"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90"
            >
              {t("Get the full AI analysis")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
