// ============================================================================
// ------------------- App Configuration -------------------
// Centralized configuration helpers
// ============================================================================

/**
 * Get the base URL for the application
 * Uses DOMAIN environment variable if set, otherwise falls back to localhost
 * DOMAIN should be just the domain (e.g., "tinglebot.xyz")
 * Returns full URL with protocol (https for production, http for localhost)
 */
export function getAppUrl(): string {
  const domain = process.env.DOMAIN;
  
  if (domain) {
    // Use https for production domain
    return `https://${domain}`;
  }
  
  // Fallback to localhost for development
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:6001";
}

/**
 * Get the Discord OAuth redirect URI (redirect_uri).
 *
 * Important: this must EXACTLY match one of the URLs registered in
 * Discord Developer Portal → OAuth2 → Redirects.
 *
 * Supported env vars (first match wins):
 * - DISCORD_CALLBACK_URL
 * - DISCORD_REDIRECT_URI
 * - NEXT_PUBLIC_DISCORD_REDIRECT_URI
 *
 * If none are set, falls back to `${getAppUrl()}/api/auth/discord/callback`.
 */
export function getDiscordRedirectUri(): string {
  const explicit =
    process.env.DISCORD_CALLBACK_URL ||
    process.env.DISCORD_REDIRECT_URI ||
    process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI;

  if (explicit) return explicit.replace(/\/$/, "");

  const appUrl = getAppUrl().replace(/\/$/, "");
  return `${appUrl}/api/auth/discord/callback`;
}
