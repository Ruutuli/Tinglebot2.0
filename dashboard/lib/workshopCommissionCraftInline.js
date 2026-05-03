/**
 * Run workshop commission craft inside the dashboard Node process (no HTTP to the bot).
 * Used for local dev on http://localhost:6001 when the repo contains ../bot.
 *
 * Env:
 * - CRAFTING_ACCEPT_INLINE=false — always use BOT_INTERNAL_API_URL (even in development)
 * - CRAFTING_ACCEPT_INLINE=true — prefer inline whenever ../bot exists (optional; dev defaults already do this)
 */

const fs = require("fs");
const path = require("path");

/**
 * @returns {string | null} Absolute path to bot/services/workshopCommissionCraft.js
 */
function resolveBotWorkshopCraftPath() {
  const candidates = [
    path.join(process.cwd(), "..", "bot", "services", "workshopCommissionCraft.js"),
    path.join(process.cwd(), "bot", "services", "workshopCommissionCraft.js"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return path.normalize(p);
  }
  return null;
}

/** Prefer in-process craft (no BOT_INTERNAL_API_URL) when developing locally with the full monorepo. */
function shouldPreferInlineWorkshopCraft() {
  if (process.env.CRAFTING_ACCEPT_INLINE === "false") return false;
  if (process.env.CRAFTING_ACCEPT_INLINE === "true") return true;
  return process.env.NODE_ENV === "development";
}

/**
 * @param {string} absolutePath
 * @param {object} payload — same shape as bot POST /crafting-execute body
 */
async function executeWorkshopCommissionCraftFromRepo(absolutePath, payload) {
  const { executeWorkshopCommissionCraft } = require(absolutePath);
  return executeWorkshopCommissionCraft(payload);
}

module.exports = {
  resolveBotWorkshopCraftPath,
  shouldPreferInlineWorkshopCraft,
  executeWorkshopCommissionCraftFromRepo,
};
