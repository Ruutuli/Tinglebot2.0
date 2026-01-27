"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

/* [top-bar.tsx]✨ Core deps - */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import { useSession } from "@/hooks/use-session";
import { useSidebar } from "./sidebar-context";

/* ============================================================================ */
/* ------------------- Constants ------------------- */
/* ============================================================================ */

/* [top-bar.tsx]✨ Layout - */
const TOP_BAR_HEIGHT = 56;

/* [top-bar.tsx]✨ Notification types - */
type Notification = { 
  id: string; 
  title: string; 
  message: string; 
  time: string; 
  read: boolean;
  createdAt: string;
};

/* ============================================================================ */
/* ------------------- Notifications dropdown ------------------- */
/* ============================================================================ */

function NotificationBubble({ hasUnread }: { hasUnread: boolean }) {
  if (!hasUnread) return null;
  return (
    <span
      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full"
      style={{
        backgroundColor: "var(--totk-light-green)",
        boxShadow: "0 0 6px rgba(73, 213, 156, 0.5)",
      }}
      aria-hidden
    />
  );
}

function NotificationIcon({ hasUnread }: { hasUnread: boolean }) {
  const src = hasUnread ? "/Pulse=true.svg" : "/Pulse=false.svg";
  return (
    <Image
      src={src}
      alt=""
      width={24}
      height={24}
      className="h-6 w-6 shrink-0 object-contain"
      aria-hidden
    />
  );
}

function formatNotificationTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* [top-bar.tsx]✨ Markdown components for notification rendering - */

/**
 * Convert plain URLs in text to markdown links
 */
function convertUrlsToMarkdown(text: string): string {
  // URL regex pattern - matches http(s):// URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => `[${url}](${url})`);
}

type MarkdownComponentProps = {
  children?: ReactNode;
  href?: string;
};

const NOTIFICATION_MARKDOWN_COMPONENTS: Components = {
  p: ({ children }: MarkdownComponentProps) => (
    <p className="mb-1 last:mb-0 break-words">{children}</p>
  ),
  h1: ({ children }: MarkdownComponentProps) => (
    <h1 className="text-lg font-bold mb-2 mt-2 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h1>
  ),
  h2: ({ children }: MarkdownComponentProps) => (
    <h2 className="text-base font-bold mb-1.5 mt-2 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h2>
  ),
  h3: ({ children }: MarkdownComponentProps) => (
    <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h3>
  ),
  h4: ({ children }: MarkdownComponentProps) => (
    <h4 className="text-sm font-semibold mb-1 mt-1.5 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h4>
  ),
  h5: ({ children }: MarkdownComponentProps) => (
    <h5 className="text-xs font-semibold mb-1 mt-1.5 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h5>
  ),
  h6: ({ children }: MarkdownComponentProps) => (
    <h6 className="text-xs font-medium mb-1 mt-1 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h6>
  ),
  ul: ({ children }: MarkdownComponentProps) => (
    <ul className="list-disc list-inside mb-1 space-y-0.5 break-words">{children}</ul>
  ),
  ol: ({ children }: MarkdownComponentProps) => (
    <ol className="list-decimal list-inside mb-1 space-y-0.5 break-words">{children}</ol>
  ),
  li: ({ children }: MarkdownComponentProps) => (
    <li className="ml-1 break-words">{children}</li>
  ),
  strong: ({ children }: MarkdownComponentProps) => (
    <strong className="font-bold text-[var(--totk-light-green)] break-words">{children}</strong>
  ),
  em: ({ children }: MarkdownComponentProps) => (
    <em className="italic break-words">{children}</em>
  ),
  code: ({ children }: MarkdownComponentProps) => (
    <code className="bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] px-1 py-0.5 rounded text-[10px] font-mono break-words">
      {children}
    </code>
  ),
  pre: ({ children }: MarkdownComponentProps) => (
    <pre className="bg-[var(--botw-warm-black)] p-1.5 rounded overflow-x-auto mb-1 text-[10px] break-words">
      {children}
    </pre>
  ),
  blockquote: ({ children }: MarkdownComponentProps) => (
    <blockquote className="border-l-2 border-[var(--totk-green)] pl-1.5 italic mb-1 break-words">
      {children}
    </blockquote>
  ),
  a: ({ children, href }: MarkdownComponentProps) => (
    <a
      href={href}
      className="text-[var(--botw-blue)] underline hover:text-[var(--totk-light-green)] break-words"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  br: () => <br />,
};

function NotificationsDropdown() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasUnreadIndicator, setHasUnreadIndicator] = useState(false);

  const hasUnread = useMemo(
    () => notifications.some((n) => !n.read),
    [notifications]
  );
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // Fetch notification count for indicator (polling every 30 seconds)
  useEffect(() => {
    const checkUnreadCount = async () => {
      try {
        const res = await fetch("/api/users/notifications");
        if (!res.ok) return;
        const data = await res.json();
        const hasUnread = data.notifications?.some((n: { read: boolean }) => !n.read) || false;
        setHasUnreadIndicator(hasUnread);
      } catch (err) {
        // Silently fail - don't spam console
      }
    };

    // Check immediately
    checkUnreadCount();

    // Then poll every 30 seconds
    const interval = setInterval(checkUnreadCount, 30000);

    return () => clearInterval(interval);
  }, []);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (!open) return;

    const abortController = new AbortController();

    const fetchNotifications = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/users/notifications", { signal: abortController.signal });
        if (abortController.signal.aborted) return;
        
        if (!res.ok) {
          console.error("[top-bar.tsx]❌ Failed to fetch notifications");
          return;
        }
        const data = await res.json();
        if (abortController.signal.aborted) return;
        
        const formattedNotifications: Notification[] = data.notifications.map((n: { id: string; title: string; message: string; read: boolean; createdAt: string }) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          read: n.read,
          createdAt: n.createdAt,
          time: formatNotificationTime(n.createdAt),
        }));
        setNotifications(formattedNotifications);
        // Update indicator state when we fetch full list
        const hasUnread = formattedNotifications.some((n) => !n.read);
        setHasUnreadIndicator(hasUnread);
      } catch (err: unknown) {
        if (abortController.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[top-bar.tsx]❌ Error fetching notifications:", error);
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchNotifications();

    return () => {
      abortController.abort();
    };
  }, [open]);

  const markAllRead = async () => {
    try {
      const res = await fetch("/api/users/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setHasUnreadIndicator(false);
      }
    } catch (error) {
      console.error("[top-bar.tsx]❌ Error marking all as read:", error);
    }
  };

  const markOneRead = async (id: string) => {
    try {
      const res = await fetch("/api/users/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
        // Update indicator if no more unread
        const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
        const stillHasUnread = updated.some((n) => !n.read);
        setHasUnreadIndicator(stillHasUnread);
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[top-bar.tsx]❌ Error marking notification as read:", error);
    }
  };

  // ------------------- Handle Notification Click ------------------
  // Extract handler to avoid inline function in render

  const handleNotificationClick = (id: string) => {
    markOneRead(id);
    setOpen(false);
    // Navigate to profile notifications page with the notification ID as hash
    router.push(`/profile?tab=notifications#notification-${id}`);
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          suppressHydrationWarning
          className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border-2 transition-all duration-200 hover:scale-105 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] focus:ring-offset-2 focus:ring-offset-[var(--totk-brown)] data-[state=open]:bg-white/10 data-[state=open]:ring-2 data-[state=open]:ring-[var(--totk-light-green)] data-[state=open]:ring-offset-2 data-[state=open]:ring-offset-[var(--totk-brown)] min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px]"
          style={{ borderColor: "var(--totk-dark-ocher)" }}
          aria-label={hasUnreadIndicator || hasUnread ? `${unreadCount || "some"} unread notifications` : "Open notifications"}
        >
          <i
            aria-hidden
            className="fa-solid fa-bell text-[var(--botw-pale)]"
          />
          <NotificationBubble hasUnread={hasUnreadIndicator || (hasUnread && unreadCount > 0)} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-[100] w-[calc(100vw-2rem)] sm:w-[400px] max-w-[calc(100vw-2rem)] sm:max-w-[90vw] overflow-hidden rounded-xl bg-[var(--botw-warm-black)] pt-3 pb-2 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-top-2"
          style={{
            boxShadow:
              "0 12px 40px rgba(0, 0, 0, 0.45), 0 0 24px rgba(0, 163, 218, 0.12)",
            maxHeight: "calc(100vh - 100px)",
          }}
          align="end"
          sideOffset={10}
          collisionPadding={{ top: 16, bottom: 8, left: 8, right: 8 }}
          avoidCollisions={true}
        >
          <div
            className="flex items-center justify-between gap-3 border-b-2 px-4 pb-3"
            style={{ borderColor: "var(--totk-dark-ocher)" }}
          >
            <span
              className="text-sm font-bold uppercase tracking-wider"
              style={{ color: "var(--totk-light-ocher)" }}
            >
              Notifications
            </span>
            {hasUnread && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium transition-colors hover:underline"
                style={{ color: "var(--totk-light-green)" }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div
            className="max-h-[320px] overflow-y-auto overscroll-contain"
            style={{ scrollbarGutter: "stable" }}
          >
            {loading ? (
              <div
                className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center"
                style={{ color: "var(--totk-grey-200)" }}
              >
                <div className="opacity-50">
                  <Image
                    src="/Pulse=false.svg"
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 object-contain animate-pulse"
                    aria-hidden
                  />
                </div>
                <p className="text-sm font-medium">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center"
                style={{ color: "var(--totk-grey-200)" }}
              >
                <div className="opacity-50">
                  <Image
                    src="/Pulse=false.svg"
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 object-contain"
                    aria-hidden
                  />
                </div>
                <p className="text-sm font-medium">No notifications yet</p>
                <p className="text-xs max-w-[200px]">
                  Updates and alerts will appear here when you have them.
                </p>
              </div>
            ) : (
              <ul className="py-1" role="list">
                {notifications.map((n) => {
                  // Precompute className values to avoid template literals in JSX
                  const indicatorClass = `mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "opacity-30" : ""}`;
                  const titleClass = `truncate text-sm font-medium ${n.read ? "opacity-70" : ""}`;
                  
                  return (
                    <li
                      key={n.id}
                      className="border-b border-[var(--totk-dark-ocher)] last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(n.id)}
                        className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 focus:bg-white/5 focus:outline-none"
                        aria-label={n.read ? `Read notification: ${n.title}` : `Unread notification: ${n.title}`}
                      >
                        <span
                          className={indicatorClass}
                          aria-hidden="true"
                          style={{
                            backgroundColor: n.read
                              ? "var(--totk-grey-200)"
                              : "var(--totk-light-green)",
                            boxShadow: n.read ? "none" : "0 0 6px rgba(73, 213, 156, 0.6)",
                          }}
                        />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p
                            className={`${titleClass} break-words`}
                            style={{ color: "var(--totk-ivory)" }}
                          >
                            {n.title}
                          </p>
                          <div className="mt-0.5 text-xs break-words overflow-wrap-anywhere" style={{ color: "var(--totk-grey-200)" }}>
                            <ReactMarkdown components={NOTIFICATION_MARKDOWN_COMPONENTS}>
                              {convertUrlsToMarkdown(n.message)}
                            </ReactMarkdown>
                          </div>
                          <p className="mt-1 text-[10px] uppercase tracking-wider break-words" style={{ color: "var(--totk-dark-ocher)" }}>
                            {n.time}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {notifications.length > 0 && (
            <>
              <div
                className="h-px"
                style={{ backgroundColor: "var(--totk-dark-ocher)" }}
              />
              <DropdownMenu.Item asChild>
                <Link
                  href="/profile?tab=notifications"
                  className="flex w-full items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors hover:bg-white/5 focus:bg-white/5 focus:outline-none"
                  style={{ color: "var(--totk-light-ocher)" }}
                >
                  View all notifications
                </Link>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

const SCROLL_THRESHOLD = 100;

/* [top-bar.tsx]🧱 Fixed top bar with nav + actions - */
export function TopBar() {
  const { isMobileOpen, setIsMobileOpen, isMobile } = useSidebar();
  const { user, loading: sessionLoading } = useSession();
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.id, user?.avatar]);

  const scrollToTop = useCallback(() => {
    document.querySelector<HTMLElement>("main")?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    const main = document.querySelector<HTMLElement>("main");

    const check = () => {
      const mainScroll = main?.scrollTop ?? 0;
      const windowScroll = window.scrollY;
      setShowScrollToTop(mainScroll > SCROLL_THRESHOLD || windowScroll > SCROLL_THRESHOLD);
    };

    main?.addEventListener("scroll", check, { passive: true });
    window.addEventListener("scroll", check, { passive: true });
    check();

    return () => {
      main?.removeEventListener("scroll", check);
      window.removeEventListener("scroll", check);
    };
  }, [mounted]);

  // ------------------- Handle Mobile Menu Toggle ------------------
  // Extract handler to avoid inline function in render

  const handleMobileMenuToggle = useCallback(() => {
    setIsMobileOpen((prev) => !prev);
  }, [setIsMobileOpen]);

  return (
    <>
      <header
        className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between border-b-2 border-[var(--totk-dark-ocher)] bg-[var(--totk-brown)]/95 px-2 sm:px-3 md:px-4 lg:px-6 backdrop-blur-md shadow-lg"
        style={{
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
          height: TOP_BAR_HEIGHT,
        }}
      >
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4">
        {/* Hamburger menu button for mobile */}
        {isMobile && (
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 hover:bg-[var(--totk-dark-green)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] md:hidden min-w-[44px] min-h-[44px]"
            style={{ color: "var(--botw-pale)" }}
            aria-label="Open navigation menu"
            aria-expanded={isMobileOpen}
            onClick={handleMobileMenuToggle}
          >
            <i
              aria-hidden
              className="fa-solid fa-bars w-5 text-center"
            />
          </button>
        )}

        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold transition-all duration-200 hover:scale-[1.02] hover:opacity-90 sm:text-lg"
          style={{ color: "var(--totk-ivory)" }}
        >
          <Image
            src="/tingle_icon.png"
            alt="Tinglebot Logo"
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 object-contain"
            aria-hidden
          />
          <span>Tinglebot</span>
        </Link>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4">
        <NotificationsDropdown />

        {sessionLoading ? (
          <span
            className="flex h-10 items-center rounded-lg px-2 sm:px-3 md:px-4 py-2 text-sm text-[var(--totk-grey-200)]"
            aria-hidden
          >
            …
          </span>
        ) : user ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px]"
              style={{ borderColor: "var(--totk-dark-ocher)" }}
            >
              {user.avatar && !avatarError ? (
                <Image
                  src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`}
                  alt={user.global_name?.trim() || user.username}
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : !user.avatar && !avatarError ? (
                <Image
                  src={`https://cdn.discordapp.com/embed/avatars/${Number(user.id) % 5}.png?size=128`}
                  alt={user.global_name?.trim() || user.username}
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <Image
                  src="/ankle_icon.png"
                  alt={user.global_name?.trim() || user.username}
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <span
              className="hidden max-w-[120px] truncate text-sm text-[var(--botw-pale)] sm:inline"
              title={user.global_name?.trim() || user.username}
            >
              {user.global_name?.trim() || user.username}
            </span>
            <a
              href="/api/auth/logout"
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3 md:px-4 py-2 text-xs sm:text-sm font-medium transition-all duration-200 hover:scale-[1.02] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] min-h-[44px]"
              style={{
                backgroundColor: "var(--totk-dark-green)",
                color: "var(--totk-ivory)",
              }}
            >
              <i aria-hidden className="fa-solid fa-right-from-bracket text-sm sm:text-base" />
              <span className="hidden sm:inline">Logout</span>
            </a>
          </div>
        ) : (
          <a
            href="/api/auth/discord"
            title="Login with Discord. If it fails, open this site in Chrome, Firefox, or Edge (not in Discord's app)."
            className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3 md:px-4 py-2 text-xs sm:text-sm font-medium transition-all duration-200 hover:scale-[1.02] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] min-h-[44px]"
            style={{
              backgroundColor: "var(--botw-dark-blue)",
              color: "var(--botw-white)",
            }}
          >
            <i aria-hidden className="fa-brands fa-discord text-sm sm:text-base" />
            <span className="hidden sm:inline">Login with Discord</span>
            <span className="sm:hidden">Login</span>
          </a>
        )}
      </div>
      </header>
      {mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <button
            type="button"
            onClick={scrollToTop}
            aria-label="Scroll to top"
            className="scroll-to-top-btn min-w-[48px] min-h-[48px]"
            style={{
              position: "fixed",
              bottom: "16px",
              right: "16px",
              left: "auto",
              top: "auto",
              zIndex: 2147483647,
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "2px solid var(--totk-light-green)",
              backgroundColor: "var(--totk-dark-green)",
              color: "var(--totk-light-green)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              visibility: "visible",
              opacity: 1,
              boxShadow: "0 4px 16px rgba(0,0,0,0.5), 0 0 16px rgba(73, 213, 156, 0.3)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            <svg
              aria-hidden
              width={24}
              height={24}
              viewBox="0 0 12 12"
              fill="currentColor"
              style={{ flexShrink: 0, transform: "scaleY(-1)" }}
            >
              <path d="M8.22222 0H3.77778V4.63158H2.02825C1.61112 4.63158 1.37739 5.11225 1.63498 5.44035L5.60673 10.4991C5.80692 10.7541 6.19308 10.7541 6.39327 10.4991L10.365 5.44035C10.6226 5.11225 10.3889 4.63158 9.97175 4.63158H8.22222V0Z" />
            </svg>
          </button>,
          document.body
        )}
    </>
  );
}

export { TOP_BAR_HEIGHT };
