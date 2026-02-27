/**
 * Generate a unique ID with a single-letter prefix + 6-digit number (100000–999999).
 * Matches bot/utils/uniqueIdUtils.js for consistency (e.g. Q73642, M28464).
 */
export function generateUniqueId(prefix: string): string {
  if (!prefix || typeof prefix !== "string" || prefix.length !== 1) {
    throw new Error("Prefix must be a single character string.");
  }
  const randomNumber = Math.floor(100000 + Math.random() * 900000);
  return `${prefix.toUpperCase()}${randomNumber}`;
}
