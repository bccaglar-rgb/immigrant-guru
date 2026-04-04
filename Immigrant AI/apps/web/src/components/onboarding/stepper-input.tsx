"use client";

import { cn } from "@/lib/utils";

type StepperInputProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
};

export function StepperInput({ label, value, onChange, min = 0, max = 40 }: StepperInputProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-white px-5 py-3">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-lg font-medium transition-all duration-200 active:scale-90",
            value <= min
              ? "bg-ink/5 text-muted"
              : "bg-accent/10 text-accent hover:bg-accent/20"
          )}
        >
          -
        </button>
        <span className="w-8 text-center text-lg font-semibold text-ink">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-lg font-medium transition-all duration-200 active:scale-90",
            value >= max
              ? "bg-ink/5 text-muted"
              : "bg-accent/10 text-accent hover:bg-accent/20"
          )}
        >
          +
        </button>
      </div>
    </div>
  );
}
