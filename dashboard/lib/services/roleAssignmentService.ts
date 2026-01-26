// ============================================================================
// ------------------- Role Assignment Service -------------------
// Assigns Discord roles when character is approved
// ============================================================================

import { discordApiRequest } from "@/lib/discord";
import { logger } from "@/utils/logger";

const GUILD_ID = process.env.GUILD_ID || "";
const LOGGING_CHANNEL_ID = process.env.LOGGING_CHANNEL_ID || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:6001";

// Role mappings
const RACE_ROLES: Record<string, string> = {
  Hylian: process.env.RACE_HYLIAN || "",
  Zora: process.env.RACE_ZORA || "",
  Gerudo: process.env.RACE_GERUDO || "",
  Goron: process.env.RACE_GORON || "",
  Mixed: process.env.RACE_MIXED || "",
  Sheikah: process.env.RACE_SHEIKAH || "",
  Rito: process.env.RACE_RITO || "",
  "Korok/Kokiri": process.env.RACE_KOROK_KOKIRI || "",
  Keaton: process.env.RACE_KEATON || "",
  Twili: process.env.RACE_TWILI || "",
  Mogma: process.env.RACE_MOGMA || "",
};

const VILLAGE_ROLES: Record<string, string> = {
  Rudania: process.env.RUDANIA_RESIDENT || "",
  Inariko: process.env.INARIKO_RESIDENT || "",
  Vhintl: process.env.VHINTL_RESIDENT || "",
};

const JOB_PERK_ROLES: Record<string, string> = {
  Looting: process.env.JOB_PERK_LOOTING || "",
  Stealing: process.env.JOB_PERK_STEALING || "",
  Entertaining: process.env.JOB_PERK_ENTERTAINING || "",
  Delivering: process.env.JOB_PERK_DELIVERING || "",
  Healing: process.env.JOB_PERK_HEALING || "",
  Gathering: process.env.JOB_PERK_GATHERING || "",
  Crafting: process.env.JOB_PERK_CRAFTING || "",
  Boosting: process.env.JOB_PERK_BOOSTING || "",
  Vending: process.env.JOB_PERK_VENDING || "",
};

type CharacterDocument = {
  _id: unknown;
  userId: string;
  name: string;
  race?: string;
  homeVillage?: string;
  job?: string;
  publicSlug?: string | null;
};

/**
 * Assign a role to a user
 */
async function assignRole(userId: string, roleId: string): Promise<boolean> {
  if (!roleId || !GUILD_ID) {
    return false;
  }

  try {
    const result = await discordApiRequest(
      `guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`,
      "PUT"
    );

    return result !== null;
  } catch (error) {
    logger.error(
      "roleAssignmentService",
      `Failed to assign role ${roleId} to user ${userId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Log role assignment error to Discord channel
 */
async function logRoleAssignmentError(
  userId: string,
  character: CharacterDocument,
  error: string
): Promise<void> {
  if (!LOGGING_CHANNEL_ID) {
    logger.warn(
      "roleAssignmentService",
      "LOGGING_CHANNEL_ID not configured, cannot log role assignment errors"
    );
    return;
  }

  try {
    const characterId = String(character._id);
    const ocPageUrl = character.publicSlug
      ? `${APP_URL}/characters/${character.publicSlug}`
      : `${APP_URL}/characters/${characterId}`;

    await discordApiRequest(`channels/${LOGGING_CHANNEL_ID}/messages`, "POST", {
      content: `⚠️ **Role Assignment Failed**\n\nUser: <@${userId}>\nCharacter: ${character.name}\nOC Link: ${ocPageUrl}\n\n**Error:** ${error}\n\nPlease assign roles manually.`,
    });

    logger.info(
      "roleAssignmentService",
      `Logged role assignment error for user ${userId}, character ${characterId}`
    );
  } catch (error) {
    logger.error(
      "roleAssignmentService",
      `Failed to log role assignment error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Assign character roles based on race, village, and job
 */
export async function assignCharacterRoles(
  userId: string,
  character: CharacterDocument
): Promise<void> {
  const errors: string[] = [];

  try {
    // Assign race role
    if (character.race) {
      const raceRoleId = RACE_ROLES[character.race];
      if (raceRoleId) {
        const success = await assignRole(userId, raceRoleId);
        if (!success) {
          errors.push(`Failed to assign race role: ${character.race}`);
        }
      } else {
        logger.warn(
          "roleAssignmentService",
          `No role mapping found for race: ${character.race}`
        );
      }
    }

    // Assign village role
    if (character.homeVillage) {
      const villageRoleId = VILLAGE_ROLES[character.homeVillage];
      if (villageRoleId) {
        const success = await assignRole(userId, villageRoleId);
        if (!success) {
          errors.push(`Failed to assign village role: ${character.homeVillage}`);
        }
      } else {
        logger.warn(
          "roleAssignmentService",
          `No role mapping found for village: ${character.homeVillage}`
        );
      }
    }

    // Assign job perk role
    if (character.job) {
      const jobPerkRoleId = JOB_PERK_ROLES[character.job];
      if (jobPerkRoleId) {
        const success = await assignRole(userId, jobPerkRoleId);
        if (!success) {
          errors.push(`Failed to assign job perk role: ${character.job}`);
        }
      } else {
        logger.warn(
          "roleAssignmentService",
          `No role mapping found for job: ${character.job}`
        );
      }
    }

    // Log errors if any
    if (errors.length > 0) {
      await logRoleAssignmentError(
        userId,
        character,
        errors.join("\n")
      );
    } else {
      logger.info(
        "roleAssignmentService",
        `Successfully assigned roles for user ${userId}, character ${String(character._id)}`
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      "roleAssignmentService",
      `Error assigning roles: ${errorMessage}`
    );
    await logRoleAssignmentError(userId, character, errorMessage);
  }
}
