// ============================================================================
// ------------------- Role Assignment Service -------------------
// Assigns Discord roles when character is approved
// ============================================================================

import {
  discordApiRequest,
  assignGuildMemberRole,
  removeGuildMemberRole,
  fetchGuildMemberRoleIds,
} from "@/lib/discord";
import { logger } from "@/utils/logger";
import { getAppUrl } from "@/lib/config";
import { getJobPerk } from "@/data/jobData";

const GUILD_ID = process.env.GUILD_ID || "";
const LOGGING_CHANNEL_ID = process.env.LOGGING_CHANNEL_ID || "";
const RESIDENT_ROLE_ID = process.env.RESIDENT_ROLE_ID || "";
// Traveler role (rules reaction) — removed when user gets an approved character
const TRAVELER_ROLE_ID = process.env.TRAVELER_ROLE_ID || "788137818135330837";
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

/** JOB_* env map — keep in sync with bot utils/memberJobRolesSync.js */
function jobRoleIdsFromEnv(): Record<string, string> {
  return {
    Adventurer: process.env.JOB_ADVENTURER ?? "",
    Artist: process.env.JOB_ARTIST ?? "",
    Bandit: process.env.JOB_BANDIT ?? "",
    Beekeeper: process.env.JOB_BEEKEEPER ?? "",
    Blacksmith: process.env.JOB_BLACKSMITH ?? "",
    Cook: process.env.JOB_COOK ?? "",
    Courier: process.env.JOB_COURIER ?? "",
    Craftsman: process.env.JOB_CRAFTSMAN ?? "",
    Farmer: process.env.JOB_FARMER ?? "",
    Fisherman: process.env.JOB_FISHERMAN ?? "",
    Forager: process.env.JOB_FORAGER ?? "",
    "Fortune Teller": process.env.JOB_FORTUNE_TELLER ?? "",
    Graveskeeper: process.env.JOB_GRAVESKEEPER ?? "",
    Guard: process.env.JOB_GUARD ?? "",
    Healer: process.env.JOB_HEALER ?? "",
    Herbalist: process.env.JOB_HERBALIST ?? "",
    Hunter: process.env.JOB_HUNTER ?? "",
    "Mask Maker": process.env.JOB_MASK_MAKER ?? "",
    Merchant: process.env.JOB_MERCHANT ?? "",
    Mercenary: process.env.JOB_MERCENARY ?? "",
    Miner: process.env.JOB_MINER ?? "",
    Oracle: process.env.JOB_ORACLE ?? "",
    Priest: process.env.JOB_PRIEST ?? "",
    Rancher: process.env.JOB_RANCHER ?? "",
    Researcher: process.env.JOB_RESEARCHER ?? "",
    Sage: process.env.JOB_SAGE ?? "",
    Scout: process.env.JOB_SCOUT ?? "",
    Scholar: process.env.JOB_SCHOLAR ?? "",
    Shopkeeper: process.env.JOB_SHOPKEEPER ?? "",
    Stablehand: process.env.JOB_STABLEHAND ?? "",
    Teacher: process.env.JOB_TEACHER ?? "",
    Villager: process.env.JOB_VILLAGER ?? "",
    Weaver: process.env.JOB_WEAVER ?? "",
    Witch: process.env.JOB_WITCH ?? "",
    Dragon: process.env.JOB_DRAGON ?? "",
    Entertainer: process.env.JOB_ENTERTAINER ?? "",
  };
}

function jobPerkIdsFromEnv(): Record<string, string> {
  return {
    LOOTING: process.env.JOB_PERK_LOOTING ?? "",
    STEALING: process.env.JOB_PERK_STEALING ?? "",
    ENTERTAINING: process.env.JOB_PERK_ENTERTAINING ?? "",
    DELIVERING: process.env.JOB_PERK_DELIVERING ?? "",
    HEALING: process.env.JOB_PERK_HEALING ?? "",
    GATHERING: process.env.JOB_PERK_GATHERING ?? "",
    CRAFTING: process.env.JOB_PERK_CRAFTING ?? "",
    BOOST: process.env.JOB_PERK_BOOST || process.env.JOB_PERK_BOOSTING || "",
    VENDING: process.env.JOB_PERK_VENDING ?? "",
  };
}

function resolveJobRoleId(jobName: string, jobMap: Record<string, string>): string {
  if (!jobName?.trim()) return "";
  const t = jobName.trim();
  if (jobMap[t]) return jobMap[t];
  const lower = t.toLowerCase();
  const key = Object.keys(jobMap).find((k) => k.toLowerCase() === lower);
  return key ? jobMap[key] : "";
}

function perkCodesFromJob(jobName: string): string[] {
  const jp = getJobPerk(jobName);
  if (!jp?.perk) return [];
  return jp.perk
    .split("/")
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p && !["N/A", "NONE", "ALL"].includes(p));
}

/**
 * Sync Discord job + job-perk roles to the union of all accepted regular + mod OCs (dashboard / API paths).
 */
export async function syncMemberJobAndPerkRolesForDiscordUser(discordUserId: string): Promise<void> {
  const guildId = GUILD_ID;
  if (!guildId || !process.env.DISCORD_TOKEN) {
    logger.warn("roleAssignmentService", "syncMemberJobAndPerkRoles: missing GUILD_ID or DISCORD_TOKEN");
    return;
  }

  const { connect } = await import("@/lib/db");
  const { default: Character } = await import("@/models/CharacterModel.js");
  const { default: ModCharacter } = await import("@/models/ModCharacterModel.js");
  await connect();

  const [chars, modChars] = await Promise.all([
    Character.find({ userId: discordUserId, status: "accepted" }).select({ job: 1 }).lean(),
    ModCharacter.find({ userId: discordUserId, status: "accepted" }).select({ job: 1 }).lean(),
  ]);

  type LeanJob = { job?: string };
  const jobs = [...(chars as LeanJob[]), ...(modChars as LeanJob[])]
    .map((c) => c.job)
    .filter((j): j is string => typeof j === "string" && j.trim().length > 0);

  const jobMap = jobRoleIdsFromEnv();
  const perkMap = jobPerkIdsFromEnv();
  const managedJobIds = new Set(Object.values(jobMap).filter(Boolean));
  const managedPerkIds = new Set(Object.values(perkMap).filter(Boolean));

  const desiredJobIds = new Set<string>();
  const desiredPerkIds = new Set<string>();
  for (const job of jobs) {
    const jid = resolveJobRoleId(job, jobMap);
    if (jid) desiredJobIds.add(jid);
    for (const code of perkCodesFromJob(job)) {
      const pid = perkMap[code];
      if (pid) desiredPerkIds.add(pid);
    }
  }

  const have = await fetchGuildMemberRoleIds(guildId, discordUserId);
  if (!have) {
    logger.warn(
      "roleAssignmentService",
      `syncMemberJobAndPerkRoles: member not in guild or fetch failed (${discordUserId})`
    );
    return;
  }
  const haveSet = new Set(have);

  const toRemove: string[] = [];
  const toAdd: string[] = [];
  for (const rid of managedJobIds) {
    if (haveSet.has(rid) && !desiredJobIds.has(rid)) toRemove.push(rid);
  }
  for (const rid of desiredJobIds) {
    if (!haveSet.has(rid)) toAdd.push(rid);
  }
  for (const rid of managedPerkIds) {
    if (haveSet.has(rid) && !desiredPerkIds.has(rid)) toRemove.push(rid);
  }
  for (const rid of desiredPerkIds) {
    if (!haveSet.has(rid)) toAdd.push(rid);
  }

  for (const rid of toRemove) {
    await removeGuildMemberRole(guildId, discordUserId, rid);
  }
  for (const rid of toAdd) {
    await assignGuildMemberRole(guildId, discordUserId, rid);
  }

  if (toRemove.length || toAdd.length) {
    logger.info(
      "roleAssignmentService",
      `syncMemberJobAndPerkRoles ${discordUserId}: +${toAdd.length} -${toRemove.length}`
    );
  }
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
 * Assign a role to a user. Returns error message on failure for logging.
 */
async function assignRole(userId: string, roleId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!roleId || !GUILD_ID) {
    return { ok: false, error: "Missing roleId or GUILD_ID" };
  }

  const result = await assignGuildMemberRole(GUILD_ID, userId, roleId);
  if (!result.ok) {
    logger.error(
      "roleAssignmentService",
      `Failed to assign role ${roleId} to user ${userId}: ${result.error}`
    );
  }
  return result;
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
    // Remove Traveler role — users with approved characters are residents, not travelers
    if (TRAVELER_ROLE_ID && GUILD_ID) {
      const removeResult = await removeGuildMemberRole(GUILD_ID, userId, TRAVELER_ROLE_ID);
      if (!removeResult.ok) {
        logger.warn(
          "roleAssignmentService",
          `Could not remove Traveler role from user ${userId}: ${removeResult.error}`
        );
      } else {
        logger.info(
          "roleAssignmentService",
          `Removed Traveler role from user ${userId} (approved character)`
        );
      }
    }

    // Assign resident role first (so accepted users always get it when configured)
    if (RESIDENT_ROLE_ID) {
      const result = await assignRole(userId, RESIDENT_ROLE_ID);
      if (!result.ok) {
        errors.push(`Failed to assign resident role: ${result.error}`);
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
        const result = await assignRole(userId, raceRoleId);
        if (!result.ok) {
          errors.push(`Failed to assign race role: ${character.race} — ${result.error}`);
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
        const result = await assignRole(userId, villageRoleId);
        if (!result.ok) {
          errors.push(`Failed to assign village role: ${character.homeVillage} — ${result.error}`);
        }
      } else {
        logger.warn(
          "roleAssignmentService",
          `No role mapping found for village: ${character.homeVillage}`
        );
      }
    }

    await syncMemberJobAndPerkRolesForDiscordUser(userId).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Job/perk role sync failed: ${msg}`);
      logger.error("roleAssignmentService", `syncMemberJobAndPerkRolesForDiscordUser: ${msg}`);
    });

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
