import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "glass-card rounded-3xl shadow-card transition-shadow duration-300 hover:shadow-soft",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
