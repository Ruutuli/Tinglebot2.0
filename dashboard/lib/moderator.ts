/**
 * Moderator permission utilities.
 * Checks if a user has moderator role in the Discord guild.
 * Uses MOD_ROLE_ID and GUILD_ID from environment variables.
 */

import { userHasGuildRole } from "@/lib/discord";

/**
 * Check if a user is a moderator via Discord role in guild.
 * Uses MOD_ROLE_ID and GUILD_ID from env.
 * Returns false if role ID or guild ID not configured.
 */
export async function isModeratorUser(discordId: string): Promise<boolean> {
  const guildId = process.env.GUILD_ID;
  const roleId = process.env.MOD_ROLE_ID;
  
  if (!guildId || !roleId) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[isModeratorUser] Missing configuration: guildId=${guildId}, roleId=${roleId}`
      );
    }
    return false;
  }

  return userHasGuildRole(guildId, discordId, roleId);
}
