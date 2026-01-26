"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

/* [navigation-loading.tsx]✨ Core deps - */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/* ============================================================================ */
/* ------------------- Loading Bar Component ------------------- */
/* ============================================================================ */

/* [navigation-loading.tsx]🧱 Loading bar that appears at the top of the page - */
function LoadingBar() {
  return (
    <div
      className="navigation-loading-bar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        height: "2px",
        background: "linear-gradient(to right, var(--totk-light-green), var(--botw-blue))",
        boxShadow: "0 0 8px rgba(73, 213, 156, 0.6), 0 0 16px rgba(0, 163, 218, 0.4)",
        transformOrigin: "left",
        animation: "navigation-loading-bar 0.6s ease-out",
      }}
    />
  );
}

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

/* [navigation-loading.tsx]🧱 Shows loading bar during route transitions - */
export function NavigationLoading() {
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState(pathname);

  useEffect(() => {
    // Intercept all link clicks to show loading immediately
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a[href]");
      
      if (link && link.getAttribute("href")?.startsWith("/")) {
        const href = link.getAttribute("href");
        // Only show loading if navigating to a different route
        if (href && href !== pathname) {
          setIsLoading(true);
        }
      }
    };

    document.addEventListener("click", handleLinkClick, true);

    return () => {
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [pathname]);

  useEffect(() => {
    // When pathname changes, hide loading after a brief delay
    if (pathname !== currentPath) {
      setCurrentPath(pathname);
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [pathname, currentPath]);

  if (!isLoading) return null;

  return <LoadingBar />;
}
