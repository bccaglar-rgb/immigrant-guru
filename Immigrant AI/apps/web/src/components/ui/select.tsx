import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  error?: string;
  helperText?: string;
  label: string;
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    { children, className, error, helperText, id, label, placeholder, ...props },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const helperId = `${selectId}-helper`;
    const errorId = `${selectId}-error`;

    return (
      <label className="block space-y-1.5" htmlFor={selectId}>
        <span className="text-sm font-medium text-ink/80">{label}</span>
        <select
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          aria-invalid={Boolean(error)}
          className={cn(
            "h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-ink outline-none transition-all duration-200 focus:border-accent focus:ring-4 focus:ring-accent/10",
            error ? "border-red" : "border-line",
            className
          )}
          id={selectId}
          ref={ref}
          {...props}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {children}
        </select>
        {error ? (
          <p className="text-sm text-red" id={errorId}>
            {error}
          </p>
        ) : helperText ? (
          <p className="text-sm text-muted" id={helperId}>
            {helperText}
          </p>
        ) : null}
      </label>
    );
  }
);

Select.displayName = "Select";
