"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

/* [sidebar.tsx]✨ Core deps - */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useSession } from "@/hooks/use-session";
import { useSidebar } from "./sidebar-context";
import { navItems } from "@/config/navigation";
import type { NavItem, NavSection } from "@/types/navigation";

/* ============================================================================ */
/* ------------------- Constants ------------------- */
/* ============================================================================ */

/* [sidebar.tsx]✨ Layout + link styles - */
const TOP_BAR_HEIGHT = 56;
const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 64;

const linkBaseClass =
  "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 hover:bg-[var(--totk-dark-green)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]";
const linkActiveStyle = {
  backgroundColor: "var(--totk-dark-green)",
  color: "var(--totk-ivory)",
};
const linkInactiveStyle = { color: "var(--botw-pale)" };

/* ============================================================================ */
/* ------------------- Utils ------------------- */
/* ============================================================================ */

/* [sidebar.tsx]🧠 Type guard - */
function isNavSection(item: NavItem): item is NavSection {
  return "children" in item && Array.isArray(item.children);
}

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

/* [sidebar.tsx]🧱 Sidebar nav - */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const { isMobileOpen, setIsMobileOpen, isMobile } = useSidebar();
  const { isAdmin, isModerator } = useSession();
  const sidebarRef = useRef<HTMLElement>(null);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    if (!isMobile || !isMobileOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        setIsMobileOpen(false);
      }
    };

    // Add slight delay to prevent immediate close on open
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMobile, isMobileOpen, setIsMobileOpen]);

  // Close sidebar on navigation link click (mobile only)
  const handleLinkClick = () => {
    if (isMobile) {
      setIsMobileOpen(false);
    }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebar-collapsed");
      if (stored !== null) setCollapsed(JSON.parse(stored));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sidebar-collapsed", JSON.stringify(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const width = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  }, [width]);

  return (
    <>
      {/* Backdrop overlay for mobile */}
      {isMobile && isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 md:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={sidebarRef}
        className={clsx(
          "fixed left-0 flex shrink-0 flex-col border-r-2 transition-all duration-300",
          // Mobile: slide in/out from left
          isMobile && [
            "z-50 transform",
            isMobileOpen ? "translate-x-0" : "-translate-x-full",
          ],
          // Desktop: always visible, fixed position
          !isMobile && "md:translate-x-0"
        )}
        style={{
          backgroundColor: "var(--totk-brown)",
          borderColor: "var(--totk-dark-ocher)",
          height: `calc(100vh - ${TOP_BAR_HEIGHT}px)`,
          maxHeight: `calc(100vh - ${TOP_BAR_HEIGHT}px)`,
          top: `${TOP_BAR_HEIGHT}px`,
          width: isMobile ? SIDEBAR_WIDTH : width,
          zIndex: isMobile ? 50 : 40,
        }}
      >
      <div
        className={clsx(
          "flex items-center border-b-2 border-[var(--totk-dark-ocher)] p-2",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {!collapsed && (
          <span className="px-2 text-xs font-medium text-[var(--totk-grey-200)]">
            Nav
          </span>
        )}
        {/* Mobile: close button, Desktop: collapse button */}
        {isMobile ? (
          <button
            type="button"
            className="flex h-9 w-9 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg transition-all duration-200 hover:bg-[var(--totk-dark-green)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]"
            style={{ color: "var(--botw-pale)" }}
            aria-label="Close sidebar"
            onClick={() => setIsMobileOpen(false)}
          >
            <i
              aria-hidden
              className="fa-solid fa-times w-5 text-center"
            />
          </button>
        ) : (
          <button
            type="button"
            className="flex h-9 w-9 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg transition-all duration-200 hover:bg-[var(--totk-dark-green)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]"
            style={{ color: "var(--botw-pale)" }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
          <i
            aria-hidden
              className={clsx(
                "fa-solid w-5 text-center",
                collapsed ? "fa-chevron-right" : "fa-chevron-left"
              )}
            />
          </button>
        )}
      </div>

      <nav
        className="flex flex-1 flex-col gap-1 overflow-y-auto p-2"
        aria-label="Main navigation"
      >
        {navItems
          .filter((item) => {
            // Hide Admin section if user is not admin or moderator
            if (item.label === "Admin" && !isAdmin && !isModerator) {
              return false;
            }
            return true;
          })
          .map((item) => {
          if (isNavSection(item)) {
            if (collapsed) {
              return (
                <DropdownMenu.Root key={item.label}>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      suppressHydrationWarning
                      className={clsx(
                        "flex min-h-[44px] w-full items-center rounded-lg px-3 py-2 text-sm transition-all duration-200 hover:bg-[var(--totk-dark-green)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]",
                        collapsed && "justify-center px-2"
                      )}
                      style={linkInactiveStyle}
                      aria-label={`Open ${item.label} menu`}
                      aria-haspopup="menu"
                    >
                      <i
                        aria-hidden
                        className={`fa-solid ${item.icon} w-5 shrink-0 text-center`}
                      />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="z-[100] min-w-[200px] rounded-lg pt-3 pb-2 shadow-2xl backdrop-blur-md"
                      style={{
                        backgroundColor: "rgba(52, 44, 42, 0.98)",
                        boxShadow:
                          "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 16px rgba(0, 163, 218, 0.15)",
                      }}
                      align="start"
                      side="right"
                      sideOffset={8}
                      collisionPadding={{ top: 16, bottom: 8, left: 8, right: 8 }}
                      avoidCollisions={true}
                    >
                      <DropdownMenu.Label
                        className="px-4 pb-2.5 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--totk-light-ocher)" }}
                      >
                        {item.label}
                      </DropdownMenu.Label>
                      <DropdownMenu.Separator
                        className="my-1"
                        style={{
                          backgroundColor: "var(--totk-dark-ocher)",
                          height: "1px",
                        }}
                      />
                      {item.children.map((child) => (
                          <DropdownMenu.Item asChild key={child.label}>
                            <Link
                              href={child.href}
                              className="mx-1.5 flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none transition-all duration-150 hover:bg-[var(--totk-dark-green)]/30 focus:bg-[var(--totk-dark-green)]/30 focus:ring-1 focus:ring-[var(--totk-light-green)]/50"
                              style={{
                                color:
                                  pathname === child.href
                                    ? "var(--totk-ivory)"
                                    : "var(--botw-pale)",
                                ...(pathname === child.href && {
                                  backgroundColor: "var(--totk-dark-green)",
                                  fontWeight: "500",
                                }),
                              }}
                            >
                              <i
                                aria-hidden
                                className={`fa-solid ${child.icon} w-4 shrink-0 text-center`}
                              />
                              {child.label}
                            </Link>
                          </DropdownMenu.Item>
                        ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              );
            }
            const isOpen = openSection === item.label;
            return (
              <div key={item.label} className="flex flex-col gap-1">
                <button
                  type="button"
                  className={clsx(linkBaseClass, "w-full justify-between")}
                  style={linkInactiveStyle}
                  aria-controls={`nav-section-${item.label}`}
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpenSection((s) => (s === item.label ? null : item.label))
                  }
                >
                  <span className="flex items-center gap-3">
                    <i
                      aria-hidden
                      className={`fa-solid ${item.icon} w-5 shrink-0 text-center`}
                    />
                    <span>{item.label}</span>
                  </span>
                  <i
                    aria-hidden
                    className={clsx(
                      "fa-solid fa-chevron-down w-4 shrink-0 text-center transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                <div
                  id={`nav-section-${item.label}`}
                  role="region"
                  aria-label={`${item.label} sub-menu`}
                  className={clsx(
                    "relative ml-3 flex flex-col gap-1 transition-all duration-200",
                    isOpen ? "max-h-96 opacity-100 overflow-visible" : "max-h-0 opacity-0 overflow-hidden"
                  )}
                  style={
                    isOpen
                      ? {
                          borderLeft: "2px solid var(--totk-dark-ocher)",
                          paddingLeft: "0.5rem",
                        }
                      : {}
                  }
                >
                  {item.children.map((child) => {
                      const isActive = pathname === child.href;
                      return (
                        <Link
                          key={child.label}
                          href={child.href}
                          onClick={handleLinkClick}
                          className={clsx(linkBaseClass, "pl-8")}
                          style={
                            isActive ? linkActiveStyle : linkInactiveStyle
                          }
                          aria-current={isActive ? "page" : undefined}
                        >
                          <i
                            aria-hidden
                            className={`fa-solid ${child.icon} w-4 shrink-0 text-center`}
                          />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                </div>
              </div>
            );
          }
          const isActive =
            item.href === "/" ? pathname === "/" : pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={handleLinkClick}
              className={clsx(linkBaseClass, collapsed && "justify-center px-2")}
              style={isActive ? linkActiveStyle : linkInactiveStyle}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? item.label : undefined}
            >
              <i
                aria-hidden
                className={`fa-solid ${item.icon} w-5 shrink-0 text-center`}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
    </>
  );
}

export { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH, TOP_BAR_HEIGHT };
