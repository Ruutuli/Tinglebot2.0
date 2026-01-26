"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

/* [loading.tsx]✨ Core deps - */
import React from "react";

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

/* [loading.tsx]🧷 Loading props - */
export type LoadingProps = {
  message?: string;
  variant?: "inline" | "fullscreen" | "overlay";
  size?: "sm" | "md" | "lg";
  className?: string;
};

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

/* [loading.tsx]🧱 Loading component - */
export function Loading({
  message = "Loading...",
  variant = "inline",
  size = "md",
  className = "",
}: LoadingProps) {
  const sizeConfig = {
    sm: { spinner: "h-8 w-8", text: "text-sm" },
    md: { spinner: "h-16 w-16", text: "text-base" },
    lg: { spinner: "h-24 w-24", text: "text-lg" },
  };

  const sizes = sizeConfig[size];

  const spinner = (
    <div className="relative flex items-center justify-center">
      <div
        className={`${sizes.spinner} animate-spin rounded-full border-2 border-[var(--botw-blue)] border-t-transparent`}
      />
      <span className="sr-only">Loading...</span>
    </div>
  );

  const content = (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {spinner}
      {message && (
        <p 
          className={`${sizes.text} font-medium text-[var(--totk-light-ocher)]`}
          aria-live="polite"
        >
          {message}
        </p>
      )}
    </div>
  );

  if (variant === "fullscreen") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        {content}
      </div>
    );
  }

  if (variant === "overlay") {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--botw-warm-black)]/90 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  // inline variant (default) - centered on page
  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center">
      {content}
    </div>
  );
}
