"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

/* [dashboard-shell.tsx]✨ Layout deps - */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, TOP_BAR_HEIGHT } from "./sidebar";
import { NavigationLoading } from "./navigation-loading";
import { useSidebar } from "./sidebar-context";

/* ============================================================================ */
/* ------------------- Constants ------------------- */
/* ============================================================================ */

/* [dashboard-shell.tsx]✨ Class maps - */
const styles = {
  main: "flex-1 overflow-auto transition-all duration-200",
  wrapper: "flex flex-1 overflow-hidden",
};

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

/* [dashboard-shell.tsx]🧱 Shell with sidebar + main content - */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { isMobile } = useSidebar();
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement | null>(null);

  // Reset scroll to top when pathname changes (page navigation)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [pathname]);

  return (
    <>
      <NavigationLoading />
      <div
        className={styles.wrapper}
        style={{ minHeight: `calc(100vh - ${TOP_BAR_HEIGHT}px)` }}
      >
        <Sidebar />
        <main
          ref={mainRef}
          className={styles.main}
          style={{
            position: "relative",
            background: "var(--page-bg-gradient)",
            backgroundAttachment: "fixed",
            marginLeft: isMobile ? "0" : "var(--sidebar-width, 240px)",
          }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            {children}
          </div>
        </main>
      </div>
    </>
  );
}

