"use client";

import { useTranslations } from "next-intl";

import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Card } from "@/components/ui/card";
import type { MissingDocumentItem } from "@/types/document-center";

type MissingDocumentsPanelProps = Readonly<{
  items: MissingDocumentItem[];
}>;

export function MissingDocumentsPanel({
  items
}: MissingDocumentsPanelProps) {
  const t = useTranslations();

  return (
    <Card className="rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_22px_60px_rgba(15,23,42,0.07)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {t("Missing documents")}
      </p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
        {t("Preparation gaps still holding the case back")}
      </h3>

      {items.length === 0 ? (
        <div className="mt-6 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-sm leading-7 text-slate-600">
          {t("No active missing-document signal is surfaced right now")}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <div
              className="rounded-[24px] border border-slate-200/80 bg-white/80 px-5 py-5"
              key={item.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-slate-950">
                    {item.title}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {item.category}
                  </p>
                </div>
                <DashboardStatusPill
                  label={item.priority}
                  tone={item.priority === "required" ? "critical" : "warning"}
                />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {item.rationale}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
