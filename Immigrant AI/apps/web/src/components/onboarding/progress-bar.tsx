"use client";

import { cn } from "@/lib/utils";

type ProgressBarProps = {
  currentStep: number;
  totalSteps: number;
};

export function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-all duration-500",
            i < currentStep
              ? "bg-gradient-accent"
              : i === currentStep
                ? "bg-accent/40"
                : "bg-ink/8"
          )}
        />
      ))}
    </div>
  );
}
