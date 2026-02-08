// ============================================================================
// ------------------- Role Assignment Service -------------------
// Assigns Discord roles when character is approved
// ============================================================================

import { discordApiRequest } from "@/lib/discord";
import { logger } from "@/utils/logger";
import { getAppUrl } from "@/lib/config";
import { getJobPerk } from "@/data/jobData";

const GUILD_ID = process.env.GUILD_ID || "";
const LOGGING_CHANNEL_ID = process.env.LOGGING_CHANNEL_ID || "";
const RESIDENT_ROLE_ID = process.env.RESIDENT_ROLE_ID || "";
const APP_URL = getAppUrl();

// Role mappings (PascalCase / display keys)
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

// Lowercase-keyed lookups so DB values (e.g. "keaton", "rudania") resolve correctly
function buildLowerKeyMap(source: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, roleId] of Object.entries(source)) {
    if (roleId) out[key.toLowerCase()] = roleId;
  }
  return out;
}
const RACE_ROLES_LOWER = buildLowerKeyMap(RACE_ROLES);
const VILLAGE_ROLES_LOWER = buildLowerKeyMap(VILLAGE_ROLES);

// Map jobData perk string (e.g. "LOOTING", "BOOST") to JOB_PERK_ROLES key
const PERK_TO_ROLE_KEY: Record<string, string> = {
  LOOTING: "Looting",
  STEALING: "Stealing",
  DELIVERING: "Delivering",
  HEALING: "Healing",
  GATHERING: "Gathering",
  CRAFTING: "Crafting",
  VENDING: "Vending",
  BOOST: "Boosting",
  ENTERTAINING: "Entertaining",
};
function perkStringsToRoleIds(perkString: string): string[] {
  const roleIds: string[] = [];
  const parts = perkString.split(/[/&,]/).map((p) => p.trim().toUpperCase());
  for (const part of parts) {
    const key = PERK_TO_ROLE_KEY[part];
    if (key && JOB_PERK_ROLES[key]) roleIds.push(JOB_PERK_ROLES[key]);
  }
  return roleIds;
}

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
 * Assign character roles based on race, village, and job.
 * Resident is assigned first so accepted users get it even if other lookups fail.
 */
export async function assignCharacterRoles(
  userId: string,
  character: CharacterDocument
): Promise<void> {
  const errors: string[] = [];

  try {
    // Assign resident role first (so accepted users always get it when configured)
    if (RESIDENT_ROLE_ID) {
      const success = await assignRole(userId, RESIDENT_ROLE_ID);
      if (!success) {
        errors.push(`Failed to assign resident role`);
      }
    } else {
      logger.warn(
        "roleAssignmentService",
        "RESIDENT_ROLE_ID not configured, skipping resident role assignment"
      );
    }

    // Assign race role (case-insensitive lookup)
    if (character.race) {
      const raceKey = character.race.toLowerCase();
      const raceRoleId = RACE_ROLES_LOWER[raceKey] ?? RACE_ROLES[character.race];
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

    // Assign village role (case-insensitive lookup)
    if (character.homeVillage) {
      const villageKey = character.homeVillage.toLowerCase();
      const villageRoleId = VILLAGE_ROLES_LOWER[villageKey] ?? VILLAGE_ROLES[character.homeVillage];
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

    // Assign job perk role(s) via job → perk → role (e.g. Scout → LOOTING → JOB_PERK_LOOTING)
    if (character.job) {
      const jobPerk = getJobPerk(character.job);
      if (jobPerk?.perk) {
        const roleIds = perkStringsToRoleIds(jobPerk.perk);
        for (const roleId of roleIds) {
          if (roleId) {
            const success = await assignRole(userId, roleId);
            if (!success) {
              errors.push(`Failed to assign job perk role for job: ${character.job}`);
            }
          }
        }
        if (roleIds.length === 0 && !["N/A", "NONE", "ALL"].includes(jobPerk.perk.toUpperCase())) {
          logger.warn(
            "roleAssignmentService",
            `No role mapping for job perk: ${character.job} (perk: ${jobPerk.perk})`
          );
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
