import Link from "next/link";

import { DashboardCommandCard } from "@/components/dashboard/dashboard-command-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardAiCopilotCard } from "@/types/dashboard";

type DashboardAiCopilotCtaCardProps = Readonly<{
  data: DashboardAiCopilotCard;
}>;

export function DashboardAiCopilotCtaCard({
  data
}: DashboardAiCopilotCtaCardProps) {
  return (
    <DashboardCommandCard eyebrow="AI copilot" title={data.headline}>
      <p className="text-sm leading-6 text-muted">{data.summary}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {data.suggestedPrompts.map((prompt) => (
          <span
            className="inline-flex rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-ink/80"
            key={prompt}
          >
            {prompt}
          </span>
        ))}
      </div>
      <div className="mt-6">
        <Link
          className={cn(buttonVariants({ size: "md", variant: "primary" }), "w-full sm:w-auto")}
          href={data.href}
        >
          {data.ctaLabel}
        </Link>
      </div>
    </DashboardCommandCard>
  );
}
