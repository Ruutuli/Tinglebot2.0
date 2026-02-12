"use client";

import { usePathname } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { TopBar, TOP_BAR_HEIGHT } from "@/components/layout/top-bar";

export function ConditionalDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/map") {
    return (
      <div
        className="flex flex-col"
        style={{ minHeight: "100vh", width: "100%", overflow: "hidden" }}
      >
        {children}
      </div>
    );
  }

  return (
    <>
      <TopBar />
      <div
        className="flex flex-col"
        style={{
          minHeight: "100vh",
          paddingTop: TOP_BAR_HEIGHT,
        }}
      >
        <DashboardShell>{children}</DashboardShell>
      </div>
    </>
  );
}
