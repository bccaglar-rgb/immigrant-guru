import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  helperText?: string;
  label: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, helperText, id, label, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    return (
      <label className="block space-y-1.5" htmlFor={inputId}>
        <span className="text-sm font-medium text-ink">{label}</span>
        <input
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          aria-invalid={Boolean(error)}
          className={cn(
            "h-[46px] w-full rounded-xl border bg-white px-4 text-base text-ink outline-none transition-all duration-200 placeholder:text-muted/50 focus:border-accent focus:ring-4 focus:ring-accent/10",
            error ? "border-red" : "border-line",
            className
          )}
          id={inputId}
          ref={ref}
          {...props}
        />
        {error ? (
          <p className="text-xs text-red" id={errorId}>
            {error}
          </p>
        ) : helperText ? (
          <p className="text-xs text-muted" id={helperId}>
            {helperText}
          </p>
        ) : null}
      </label>
    );
  }
);

Input.displayName = "Input";
