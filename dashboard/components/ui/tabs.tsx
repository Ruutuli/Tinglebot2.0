"use client";

import React from "react";
import Link from "next/link";

export type TabItem<T extends string> = {
  value: T;
  label: string;
  icon: string;
  href?: string; // Optional href for link-based navigation
};

type TabsProps<T extends string> = {
  tabs: TabItem<T>[];
  activeTab: T;
  onTabChange?: (tab: T) => void; // Optional for link-based navigation
  className?: string;
};

export function Tabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  className = "",
}: TabsProps<T>) {
  const tabClassName = (isActive: boolean) =>
    `flex min-w-[140px] flex-1 items-center justify-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
      isActive
        ? "bg-gradient-to-r from-[var(--totk-dark-ocher)] to-[var(--totk-mid-ocher)] text-[var(--totk-ivory)] shadow-lg shadow-[var(--totk-dark-ocher)]/20 scale-[1.02] z-10"
        : "bg-[var(--totk-dark-ocher)]/10 text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/20 hover:text-[var(--totk-light-ocher)]"
    }`;

  return (
    <nav
      className={`flex flex-wrap gap-2 rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/60 p-2 shadow-inner backdrop-blur-md ${className}`}
      aria-label="Tabs"
    >
      {tabs.map(({ value, label, icon, href }) => {
        const isActive = activeTab === value;
        
        if (href) {
          // Link-based navigation
          return (
            <Link
              key={value}
              href={href}
              className={tabClassName(isActive)}
              aria-current={isActive ? "page" : undefined}
            >
              <i className={`fa-solid ${icon} text-base opacity-90`} />
              <span>{label}</span>
            </Link>
          );
        } else {
          // Button-based navigation
          return (
            <button
              key={value}
              onClick={() => onTabChange?.(value)}
              className={tabClassName(isActive)}
              aria-current={isActive ? "page" : undefined}
            >
              <i className={`fa-solid ${icon} text-base opacity-90`} />
              <span>{label}</span>
            </button>
          );
        }
      })}
    </nav>
  );
}
