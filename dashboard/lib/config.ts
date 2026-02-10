// ============================================================================
// ------------------- App Configuration -------------------
// Centralized configuration helpers
// ============================================================================

import type { NextRequest } from "next/server";

/**
 * Get the app base URL from an incoming request (origin: protocol + host).
 * In development we use the configured app URL so logout/auth redirects go to the
 * correct host/port (e.g. localhost:6001), not a wrong origin like localhost:8080.
 * In production we use the request origin so redirects stay on the same host.
 */
export function getAppUrlFromRequest(request: NextRequest): string {
  if (process.env.NODE_ENV === "development") {
    return getAppUrl();
  }
  const url = request.nextUrl ?? new URL(request.url);
  const origin = url.origin;
  if (origin) return origin;
  return getAppUrl();
}

/**
 * Get the base URL for the application (when no request is available).
 * Uses DOMAIN in production; in development uses NEXT_PUBLIC_APP_URL or localhost.
 */
export function getAppUrl(): string {
  if (process.env.NODE_ENV === "development") {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:6001";
  }
  const domain = process.env.DOMAIN;
  if (domain) {
    return `https://${domain}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:6001";
}

/**
 * Get the Discord OAuth redirect URI (redirect_uri).
 * When request is provided, uses that request's origin so the callback lands on the same host
 * (e.g. localhost when you started login on localhost). Otherwise uses env/getAppUrl().
 *
 * The returned URL must be registered in Discord Developer Portal → OAuth2 → Redirects.
 */
export function getDiscordRedirectUri(request?: NextRequest): string {
  if (request) {
    const base = getAppUrlFromRequest(request).replace(/\/$/, "");
    return `${base}/api/auth/discord/callback`;
  }
  const explicit =
    process.env.DISCORD_CALLBACK_URL ||
    process.env.DISCORD_REDIRECT_URI ||
    process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI;
  if (explicit) return explicit.replace(/\/$/, "");
  const appUrl = getAppUrl().replace(/\/$/, "");
  return `${appUrl}/api/auth/discord/callback`;
}
