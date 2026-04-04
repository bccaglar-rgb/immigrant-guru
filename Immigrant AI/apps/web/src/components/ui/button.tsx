import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonStyles = {
  primary:
    "bg-accent text-white hover:bg-accent-hover active:scale-[0.98] focus-visible:outline-accent disabled:opacity-50",
  secondary:
    "bg-transparent text-accent ring-1 ring-inset ring-accent/30 hover:bg-accent/5 active:scale-[0.98] focus-visible:outline-accent disabled:opacity-50",
  ghost:
    "bg-transparent text-ink hover:bg-ink/5 active:scale-[0.98] focus-visible:outline-ink disabled:opacity-50"
} as const;

const sizeStyles = {
  md: "h-11 px-5 text-sm font-semibold",
  lg: "h-12 px-7 text-base font-semibold"
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonStyles;
  size?: keyof typeof sizeStyles;
  fullWidth?: boolean;
};

export const buttonVariants = ({
  className,
  fullWidth,
  size = "md",
  variant = "primary"
}: Pick<ButtonProps, "className" | "fullWidth" | "size" | "variant"> = {}) =>
  cn(
    "inline-flex items-center justify-center rounded-full transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed",
    buttonStyles[variant],
    sizeStyles[size],
    fullWidth ? "w-full" : "",
    className
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, fullWidth = false, size = "md", variant = "primary", ...props },
    ref
  ) => (
    <button
      className={buttonVariants({ className, fullWidth, size, variant })}
      ref={ref}
      {...props}
    />
  )
);

Button.displayName = "Button";
