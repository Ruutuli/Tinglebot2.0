// ============================================================================
// ------------------- App Configuration -------------------
// Centralized configuration helpers
// ============================================================================

import type { NextRequest } from "next/server";

/**
 * Get the app base URL from an incoming request (origin: protocol + host).
 * In development we use the configured app URL so logout/auth redirects go to the
 * correct host/port (e.g. localhost:6001), not a wrong origin like localhost:8080.
 * In production we use DOMAIN (canonical live URL, e.g. tinglebot.xyz) when set,
 * otherwise the request origin so redirects stay on the same host.
 */
export function getAppUrlFromRequest(request: NextRequest): string {
  if (process.env.NODE_ENV === "development") {
    return getAppUrl();
  }
  if (process.env.DOMAIN) {
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
 * Get the canonical public URL for outbound links (Discord, emails).
 * Prefers DOMAIN so links always point at the live site (e.g. tinglebot), not localhost.
 * Use this when building URLs that are sent to Discord or other external consumers.
 */
export function getPublicAppUrl(): string {
  const domain = process.env.DOMAIN;
  if (domain) {
    return `https://${domain.replace(/\/$/, "")}`;
  }
  return getAppUrl().replace(/\/$/, "");
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

/**
 * Bot HTTP server (see bot/index.js) exposes POST /internal/pending-submissions and
 * POST /internal/workshop-commission-craft on the same port as /health. The dashboard
 * calls them for admin approvals and accepting workshop crafting commissions.
 * Set the same BOT_INTERNAL_API_SECRET on both dashboard and bot; URL is the bot's base (no path).
 * Must be the **bot** process public URL (GET /health must work), not the dashboard or main website
 * domain. If you point at the wrong host, /internal/pending-submissions will 404.
 * If this URL is stale (e.g. old Railway *.up.railway.app hostname), the host may return 404
 * "Application not found" — update to the bot service’s current public URL.
 */
export function getBotInternalApiConfig(): {
  baseUrl: string | undefined;
  secret: string | undefined;
  isConfigured: boolean;
} {
  const baseUrl = process.env.BOT_INTERNAL_API_URL?.replace(/\/$/, "");
  const secret = process.env.BOT_INTERNAL_API_SECRET;
  return {
    baseUrl: baseUrl || undefined,
    secret: secret || undefined,
    isConfigured: Boolean(baseUrl && secret),
  };
}
