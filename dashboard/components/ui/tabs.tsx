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
        ? "bg-gradient-to-r from-[#5865F2] to-[#4752C4] text-white shadow-lg shadow-[#5865F2]/40 scale-[1.02] z-10 font-bold"
        : "bg-[#2C2F33] border-2 border-[#23272A] text-[#DCDDDE] hover:bg-[#23272A] hover:border-[#5865F2]/50 hover:text-white"
    }`;

  return (
    <nav
      className={`flex flex-wrap gap-2 rounded-2xl border-2 border-[#23272A] bg-[#36393F] p-2 shadow-lg ${className}`}
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
              onClick={() => onTabChange?.(value)}
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
