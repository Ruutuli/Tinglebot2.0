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
