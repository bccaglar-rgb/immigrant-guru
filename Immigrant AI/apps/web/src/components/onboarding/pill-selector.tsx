"use client";

import { cn } from "@/lib/utils";

type PillOption = {
  label: string;
  value: string;
};

type PillSelectorProps = {
  options: readonly PillOption[];
  value: string;
  onChange: (value: string) => void;
  columns?: 2 | 3 | 4;
};

export function PillSelector({ options, value, onChange, columns = 3 }: PillSelectorProps) {
  const gridClass = {
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4"
  }[columns];

  return (
    <div className={cn("grid gap-2", gridClass)}>
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 active:scale-[0.97]",
              isSelected
                ? "border-accent bg-accent text-white shadow-glow"
                : "border-line bg-white text-ink hover:border-accent/30 hover:bg-accent/5"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
