"use client";

import { useTranslations } from "next-intl";

import { Animate } from "@/components/ui/animate";
import { Link } from "@/i18n/navigation";

export function InputStrip() {
  const t = useTranslations();
  return (
    <section className="bg-white py-12 md:py-16">
      <Animate animation="fade-up" duration={700}>
        <div className="mx-auto max-w-3xl px-6 md:px-10">
          <div className="glass-card rounded-2xl p-6 shadow-soft md:p-8">
            <p className="text-center text-sm font-medium text-accent">
              {t("Try it now")}
            </p>
            <h2 className="mt-2 text-center text-2xl font-semibold tracking-tight text-ink">
              {t("Find your best path")}
            </h2>

            <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <div className="rounded-xl border border-line bg-canvas/50 px-4 py-3">
                <p className="text-xs text-muted">{t("Where are you from?")}</p>
                <p className="mt-0.5 text-base font-medium text-ink/40">{t("Turkey, India, Brazil...")}</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas/50 px-4 py-3">
                <p className="text-xs text-muted">{t("Where do you want to go?")}</p>
                <p className="mt-0.5 text-base font-medium text-ink/40">{t("United States, Canada...")}</p>
              </div>
              <Link
                href="/sign-up"
                className="flex items-center justify-center rounded-xl bg-accent px-6 py-3 text-base font-semibold text-white transition-all hover:bg-accent-hover active:scale-[0.98] shadow-glow"
              >
                {t("Find my best path")}
              </Link>
            </div>
          </div>
        </div>
      </Animate>
    </section>
  );
}
