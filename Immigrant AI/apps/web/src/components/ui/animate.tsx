"use client";

import type { ReactNode } from "react";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";

type AnimateProps = {
  children: ReactNode;
  className?: string;
  animation?: "fade-up" | "fade-in" | "scale-in" | "slide-left" | "slide-right" | "blur-up" | "rotate-in" | "zoom-in" | "slide-up-big" | "flip-up";
  delay?: number;
  duration?: number;
  once?: boolean;
};

export function Animate({
  children,
  className,
  animation = "fade-up",
  delay = 0,
  duration = 700,
  once = true
}: AnimateProps) {
  const { ref, isInView } = useInView({ once });

  const animationClass = {
    "fade-up": "anim-fade-up",
    "fade-in": "anim-fade-in",
    "scale-in": "anim-scale-in",
    "slide-left": "anim-slide-left",
    "slide-right": "anim-slide-right",
    "blur-up": "anim-blur-up",
    "rotate-in": "anim-rotate-in",
    "zoom-in": "anim-zoom-in",
    "slide-up-big": "anim-slide-up-big",
    "flip-up": "anim-flip-up"
  }[animation];

  return (
    <div
      ref={ref}
      className={cn(animationClass, isInView && "anim-visible", className)}
      style={{
        transitionDelay: `${delay}ms`,
        transitionDuration: `${duration}ms`
      }}
    >
      {children}
    </div>
  );
}

type StaggerProps = {
  children: ReactNode[];
  className?: string;
  childClassName?: string;
  animation?: "fade-up" | "fade-in" | "scale-in" | "blur-up" | "zoom-in" | "flip-up";
  staggerDelay?: number;
  duration?: number;
};

export function Stagger({
  children,
  className,
  childClassName,
  animation = "fade-up",
  staggerDelay = 100,
  duration = 600
}: StaggerProps) {
  const { ref, isInView } = useInView({ once: true });

  const animationClass = {
    "fade-up": "anim-fade-up",
    "fade-in": "anim-fade-in",
    "scale-in": "anim-scale-in",
    "blur-up": "anim-blur-up",
    "zoom-in": "anim-zoom-in",
    "flip-up": "anim-flip-up"
  }[animation];

  return (
    <div ref={ref} className={className}>
      {children.map((child, i) => (
        <div
          key={i}
          className={cn(animationClass, isInView && "anim-visible", childClassName)}
          style={{
            transitionDelay: `${i * staggerDelay}ms`,
            transitionDuration: `${duration}ms`
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
