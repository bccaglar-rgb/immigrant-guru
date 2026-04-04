import { forwardRef, useId } from "react";
import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: string;
  helperText?: string;
  label: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, helperText, id, label, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    const helperId = `${textareaId}-helper`;
    const errorId = `${textareaId}-error`;

    return (
      <label className="block space-y-1.5" htmlFor={textareaId}>
        <span className="text-sm font-medium text-ink">{label}</span>
        <textarea
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          aria-invalid={Boolean(error)}
          className={cn(
            "min-h-[132px] w-full rounded-xl border bg-white px-4 py-3.5 text-base text-ink outline-none transition-all duration-200 placeholder:text-muted/50 focus:border-accent focus:ring-4 focus:ring-accent/10",
            error ? "border-red" : "border-line",
            className
          )}
          id={textareaId}
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

Textarea.displayName = "Textarea";
