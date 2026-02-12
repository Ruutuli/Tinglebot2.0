// ============================================================================
// ------------------- Character get and update -------------------
// GET /api/characters/:id - Get a single character
// PUT /api/characters/:id - Update a character
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect, getInventoriesDb } from "@/lib/db";
import mongoose from "mongoose";
import { getSession, isAdminUser } from "@/lib/session";
import { MOD_JOBS, ALL_JOBS } from "@/data/characterData";
import { recalculateStats, normalizeGearSlots } from "@/lib/gear-equip";
import { fetchDiscordUsernames } from "@/lib/discord";
import {
  DEFAULT_HEARTS,
  DEFAULT_STAMINA,
  VILLAGES,
  validateRequired,
  validateAge,
  validateHeight,
  validateHearts,
  validateStamina,
  validateAppLink,
  validateFileTypes,
  validateFileSizes,
  validateRace,
  validateVillage,
  validateJob,
  validateVirtue,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_BYTES,
} from "@/lib/character-validation";
import { logger } from "@/utils/logger";
import { isFieldEditable, type CharacterStatus } from "@/lib/character-field-editability";
import { gcsUploadService } from "@/lib/services/gcsUploadService";

// ------------------- Placeholder URLs (fallback if GCS not configured) -------------------
const PLACEHOLDER_ICON = "/placeholder-icon.png";
const PLACEHOLDER_APPART = "/placeholder-appart.png";

type CharDoc = {
  _id: unknown;
  userId: string;
  name: string;
  status?: string | null;
  age?: number | null;
  height?: number | null;
  pronouns: string;
  gender: string;
  race: string;
  homeVillage: string;
  job: string;
  virtue: string;
  personality: string;
  history: string;
  extras?: string;
  appLink?: string;
  icon?: string;
  appArt?: string;
  maxHearts: number;
  currentHearts: number;
  maxStamina: number;
  currentStamina: number;
  gearWeapon?: { name: string; stats: Map<string, number> };
  gearShield?: { name: string; stats: Map<string, number> };
  gearArmor?: {
    head?: { name: string; stats: Map<string, number> };
    chest?: { name: string; stats: Map<string, number> };
    legs?: { name: string; stats: Map<string, number> };
  };
  set: (o: Record<string, unknown>) => void;
  save: () => Promise<unknown>;
  toObject: () => Record<string, unknown>;
};

/** Normalize stats (Map or Record) to a plain object with sorted keys for stable comparison. */
function normalizeStats(s: Map<string, number> | Record<string, number> | undefined): Record<string, number> {
  if (!s) return {};
  const o = s instanceof Map ? Object.fromEntries(s) : s;
  return Object.keys(o)
    .sort()
    .reduce((acc, k) => {
      acc[k] = (o as Record<string, number>)[k];
      return acc;
    }, {} as Record<string, number>);
}

/** Normalize gear stats to a single modifierHearts key for consistent storage (bot and dashboard). */
function normalizeStatsToModifierHearts(stats: Record<string, number>): Record<string, number> {
  if (!stats || Object.keys(stats).length === 0) return {};
  const value = stats.modifierHearts ?? stats.attack ?? stats.defense ?? 0;
  return { modifierHearts: value };
}

/** Normalize a single gear item (weapon/shield or armor slot) for comparison. DB uses Map for stats; form sends Record. */
function normalizeGearItem(
  item: { name: string; stats?: Map<string, number> | Record<string, number> } | null | undefined
): string {
  if (!item) return "";
  return JSON.stringify({ name: item.name, stats: normalizeStats(item.stats) });
}

/** Normalize full armor (head/chest/legs) for comparison. */
function normalizeGearArmor(
  armor:
    | {
        head?: { name: string; stats?: Map<string, number> | Record<string, number> } | null;
        chest?: { name: string; stats?: Map<string, number> | Record<string, number> } | null;
        legs?: { name: string; stats?: Map<string, number> | Record<string, number> } | null;
      }
    | null
    | undefined
): string {
  if (!armor) return "";
  return JSON.stringify({
    head: normalizeGearItem(armor.head ?? undefined),
    chest: normalizeGearItem(armor.chest ?? undefined),
    legs: normalizeGearItem(armor.legs ?? undefined),
  });
}

/**
 * True only if the form is actually changing this gear item in a meaningful way.
 * When the client sends the same item name but empty stats (common when form doesn't persist stats),
 * we treat it as "no change" so we don't block edits for accepted characters.
 */
function gearItemMeaningfullyChanged(
  dbItem: { name: string; stats?: Map<string, number> | Record<string, number> } | null | undefined,
  formItem: { name: string; stats?: Record<string, number> } | null | undefined
): boolean {
  if (formItem === undefined) return false;
  if (normalizeGearItem(dbItem) === normalizeGearItem(formItem ?? null)) return false;
  if (!formItem || !dbItem) return true;
  if (formItem.name !== dbItem.name) return true;
  const formStats = formItem.stats && typeof formItem.stats === "object" ? formItem.stats : {};
  if (Object.keys(formStats).length === 0) return false; // same name, client sent no stats -> no meaningful change
  return true;
}

// ------------------- Route Segment Config (Caching) -------------------
// Cache character data for 2 minutes - characters change more frequently than models
export const revalidate = 120;

// ------------------- GET handler -------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // GET requests are public - no authentication required
    const { id: slugOrId } = await params;
    const skipHelpWanted = req.nextUrl.searchParams.get("skipHelpWanted") === "true";
    if (!slugOrId?.trim()) {
      logger.warn("api/characters/[id] GET", "Missing character identifier (empty slugOrId)");
      return NextResponse.json({ error: "Character identifier required" }, { status: 400 });
    }

    await connect();
    const { default: Character } = await import("@/models/CharacterModel.js");
    const { default: ModCharacter } = await import("@/models/ModCharacterModel.js");
    // Import Pet and Mount models to register schemas for population
    await import("@/models/PetModel.js");
    await import("@/models/MountModel.js");
    
    // Helper function to create slug from name
    const createSlug = (name: string): string => {
      return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    };
    
    // Try to find by slug (name) first, then by ID
    let char: CharDoc | null = null;
    let isModCharacter = false;
    
    // Check if it looks like an ObjectId (24 hex characters)
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(slugOrId);
    
    const loadCharacterById = async (id: string, useModCharacter = false) => {
      if (useModCharacter) {
        return (
          (await (ModCharacter as { findById: (id: string) => Promise<CharDoc | null> }).findById(
            id
          )) as CharDoc | null
        );
      }
      return (
        (await (Character as { findById: (id: string) => Promise<CharDoc | null> }).findById(
          id
        )) as CharDoc | null
      );
    };

    if (isObjectId) {
      char = await loadCharacterById(slugOrId);
      if (!char) {
        char = await loadCharacterById(slugOrId, true);
        if (char) {
          isModCharacter = true;
        }
      }
    } else {
      const slug = slugOrId.toLowerCase();
      type CharSlug = Pick<CharDoc, "_id" | "name"> & { publicSlug?: string | null };
      const regularChars = await Character.find({})
        .select("name publicSlug")
        .lean<CharSlug[]>();
      let slugMatch = regularChars.find((c) => createSlug(c.name) === slug);
      if (!slugMatch) {
        slugMatch = regularChars.find((c) => (c.publicSlug ?? "").toLowerCase() === slug);
      }
      if (slugMatch) {
        char = await loadCharacterById(String(slugMatch._id));
      }

      if (!char) {
        const modChars = await ModCharacter.find({})
          .select("name publicSlug")
          .lean<CharSlug[]>();
        let modSlugMatch = modChars.find((c) => createSlug(c.name) === slug);
        if (!modSlugMatch) {
          modSlugMatch = modChars.find((c) => (c.publicSlug ?? "").toLowerCase() === slug) ?? undefined;
        }
        if (modSlugMatch) {
          isModCharacter = true;
          char = await loadCharacterById(String(modSlugMatch._id), true);
        }
      }
    }
    
    if (!char) {
      logger.warn("api/characters/[id] GET", `Character not found for slugOrId="${slugOrId}"`);
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    
    // Hide drafts/pending/needs_changes from public character pages.
    // Only accepted characters are viewable here (drafts remain visible only in My OCs and moderation queue).
    // However, allow admins and owners to see pending characters.
    if (!isModCharacter) {
      const status = (char as { status?: string | null }).status ?? null;
      if (status !== "accepted") {
        // Check if user is admin or owner
        let canView = false;
        try {
          const session = await getSession();
          const user = session.user ?? null;
          if (user?.id) {
            // Check if user is admin
            const isAdmin = await isAdminUser(user.id);
            // Check if user is the owner
            const isOwner = char.userId === user.id;
            canView = isAdmin || isOwner;
          }
        } catch (e) {
          // If session check fails, user is not logged in or there's an error
        }
        
        if (!canView) {
          logger.warn(
            "api/characters/[id] GET",
            `Blocking non-accepted character page (status=${String(status)}) for slugOrId="${slugOrId}"`
          );
          return NextResponse.json(
            { error: "Character pending. Come back later." },
            { status: 404 }
          );
        } else {
          logger.info(
            "api/characters/[id] GET",
            `Allowing access to pending character (status=${String(status)}) for admin/owner`
          );
        }
      }
    }

    // For GET requests, don't check ownership (public character pages)
    // Ownership check is only needed for PUT requests

    // Populate pet and mount references if they exist
    if ((char as { currentActivePet?: unknown }).currentActivePet) {
      await (char as unknown as { populate: (path: string) => Promise<unknown> }).populate("currentActivePet");
    }
    if ((char as { currentActiveMount?: unknown }).currentActiveMount) {
      await (char as unknown as { populate: (path: string) => Promise<unknown> }).populate("currentActiveMount");
    }

    // Fetch help wanted quests completed by this character (unless skipped)
    if (!skipHelpWanted) {
      const charId = typeof (char as { _id?: unknown })._id === "object" && (char as { _id?: { toString: () => string } })._id
        ? (char as { _id: { toString: () => string } })._id.toString()
        : String((char as { _id?: unknown })._id);
    
      // Convert string ID to ObjectId for proper MongoDB query
      const charObjectId = new mongoose.Types.ObjectId(charId);
      
      try {
        // Check if model already exists to avoid recompilation error
        let HelpWantedQuest: unknown;
        if (mongoose.models.HelpWantedQuest) {
          HelpWantedQuest = mongoose.models.HelpWantedQuest;
        } else {
          const module = await import("@/models/HelpWantedQuestModel.js");
          HelpWantedQuest = module.default;
        }
        
        type QuestDoc = {
          date?: string;
          village?: string;
          type?: string;
          completedBy?: { characterId?: unknown };
        };
        
        const queryFilter = {
          completed: true,
          "completedBy.characterId": charObjectId
        };
        
        const questQuery = (HelpWantedQuest as unknown as {
          find: (filter: Record<string, unknown>) => {
            sort: (sort: Record<string, number>) => { limit: (limit: number) => Promise<QuestDoc[]> };
          };
        }).find(queryFilter);
        const completedQuests = await questQuery.sort({ date: -1 }).limit(50); // Get most recent 50 completions

        // Build completions array from quest data
        const questCompletions = completedQuests
          .filter((quest: QuestDoc) => {
            const hasRequiredFields = quest.date && quest.village && quest.type;
            if (!hasRequiredFields) {
              logger.warn("api/characters/[id] GET", `Quest missing required fields: ${JSON.stringify(quest)}`);
            }
            return hasRequiredFields;
          })
          .map((quest: QuestDoc) => ({
            date: quest.date!,
            village: quest.village!,
            questType: quest.type!
          }));

        // Get the most recent completion date
        const lastCompletion = questCompletions.length > 0 ? questCompletions[0].date : null;

        // Update the character's helpWanted data if we found quests
        if (questCompletions.length > 0) {
          const charObj = char as { helpWanted?: { completions?: unknown[]; lastCompletion?: string | null } };
          if (!charObj.helpWanted) {
            charObj.helpWanted = { completions: [], lastCompletion: null };
          }
          // Merge with existing completions, avoiding duplicates
          const existingCompletions = (charObj.helpWanted.completions || []) as Array<{ date?: string; village?: string; questType?: string }>;
          
          const existingKeys = new Set(
            existingCompletions.map((c) => `${c.date}-${c.village}-${c.questType}`)
          );
          const newCompletions = questCompletions.filter(
            (c: { date: string; village: string; questType: string }) => !existingKeys.has(`${c.date}-${c.village}-${c.questType}`)
          );
          
          charObj.helpWanted.completions = [...existingCompletions, ...newCompletions];
          if (lastCompletion && (!charObj.helpWanted.lastCompletion || lastCompletion > charObj.helpWanted.lastCompletion)) {
            charObj.helpWanted.lastCompletion = lastCompletion;
          }
        }
      } catch (err) {
        // If HelpWantedQuest model doesn't exist or query fails, just continue without it
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        logger.error("api/characters/[id] GET", `Failed to fetch help wanted quests: ${errorMessage}${errorStack ? `\n${errorStack}` : ""}`);
      }
    }

    const out = typeof char.toObject === "function" ? char.toObject() : (char as unknown as Record<string, unknown>);
    // Ensure isModCharacter flag is set correctly
    out.isModCharacter = isModCharacter;

    // Derive spirit orbs from inventory (source of truth); character document may be stale
    try {
      const characterName = (char as { name?: string }).name;
      const charId = (char as { _id?: unknown })._id;
      if (characterName && typeof characterName === "string" && charId) {
        const db = await getInventoriesDb();
        const collection = db.collection(characterName.toLowerCase());
        const normalizedCharId = typeof charId === "string"
          ? new mongoose.Types.ObjectId(charId)
          : charId;
        const spiritOrbEntry = await collection.findOne({
          characterId: normalizedCharId,
          itemName: { $regex: /^spirit orb$/i },
        });
        out.spiritOrbs = spiritOrbEntry?.quantity ?? 0;
      }
    } catch (inventoryErr) {
      // Silently skip if inventory lookup fails
    }

    // Fetch Discord username for the character owner
    if (char.userId) {
      const usernames = await fetchDiscordUsernames([char.userId]);
      if (usernames[char.userId]) {
        out.username = usernames[char.userId];
      }
    }
    
    const response = NextResponse.json({ character: out });
    
    // Add cache headers for browser/CDN caching
    // Character data changes more frequently, so shorter cache time
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=300"
    );
    
    return response;
  } catch (e) {
    logger.error(
      "api/characters/[id] GET",
      e instanceof Error ? `${e.message}${e.stack ? `\n${e.stack}` : ""}` : String(e)
    );
    return NextResponse.json(
      { error: "Failed to fetch character" },
      { status: 500 }
    );
  }
}

// ------------------- PUT handler -------------------

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: slugOrId } = await params;
    if (!slugOrId?.trim()) {
      return NextResponse.json({ error: "Character ID required" }, { status: 400 });
    }

    await connect();
    const { default: Character } = await import("@/models/CharacterModel.js");
    const { default: ModCharacter } = await import("@/models/ModCharacterModel.js");
    
    // Helper function to create slug from name
    const createSlug = (name: string): string => {
      return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    };
    
    // Try to find by slug (name) first, then by ID
    let char: CharDoc | null = null;
    let isModCharacter = false;
    
    // Check if it looks like an ObjectId (24 hex characters)
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(slugOrId);
    
    if (isObjectId) {
      // Try by ID first (for backward compatibility)
      char = (await (Character as { findById: (id: string) => Promise<CharDoc | null> }).findById(slugOrId)) as CharDoc | null;
      if (!char) {
        char = (await (ModCharacter as { findById: (id: string) => Promise<CharDoc | null> }).findById(slugOrId)) as CharDoc | null;
        if (char) {
          isModCharacter = true;
        }
      }
    } else {
      // Try by name - use case-insensitive regex
      const nameRegex = new RegExp(`^${slugOrId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
      char = await Character.findOne({ name: nameRegex }) as CharDoc | null;
      
      if (!char) {
        char = await ModCharacter.findOne({ name: nameRegex }) as CharDoc | null;
        if (char) {
          isModCharacter = true;
        }
      }
    }
    
    if (!char) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    
    // Check ownership
    if (char.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get character status for field editability checks
    const characterStatus = char.status ?? null;
    
    // Check if user is admin/moderator (they can edit any field)
    const isAdmin = await isAdminUser(user.id);
    const { isModeratorUser } = await import("@/lib/moderator");
    const isModerator = await isModeratorUser(user.id);
    const canBypassRestrictions = isAdmin || isModerator;

    // Handle both JSON and FormData requests
    const contentType = req.headers.get("content-type") || "";
    let form: FormData | null = null;
    let jsonData: Record<string, unknown> | null = null;
    
    if (contentType.includes("application/json")) {
      jsonData = await req.json();
    } else {
      form = await req.formData();
    }
    
    const get = (k: string) => {
      if (jsonData) {
        const v = jsonData[k];
        return v == null ? undefined : (typeof v === "string" || v instanceof File ? v : String(v));
      }
      if (form) {
        const v = form.get(k);
        return v == null ? undefined : (v as string | File);
      }
      return undefined;
    };
    const name = get("name") as string | undefined;
    const age = get("age") as string | undefined;
    const height = get("height") as string | undefined;
    const pronouns = get("pronouns") as string | undefined;
    const gender = get("gender") as string | undefined;
    const race = get("race") as string | undefined;
    const village = get("village") as string | undefined;
    const job = get("job") as string | undefined;
    const virtue = get("virtue") as string | undefined;
    const personality = get("personality") as string | undefined;
    const history = get("history") as string | undefined;
    const extras = get("extras") as string | undefined;
    const appLink = get("appLink") as string | undefined;
    const birthday = get("birthday") as string | undefined;
    const iconFile = form ? (form.get("icon") as File | null) : null;
    const appArtFile = form ? (form.get("appArt") as File | null) : null;
    const equippedGearRaw = get("equippedGear") as string | undefined;

    // Check if this is a gear-only update (only equippedGear is provided)
    const isGearOnlyUpdate = equippedGearRaw && 
      !name && !age && !height && !pronouns && !gender && !race && !village && 
      !job && !virtue && !personality && !history && !extras && !appLink && 
      !birthday && !iconFile && !appArtFile && !get("hearts") && !get("stamina");
    
    // Only validate required fields if this is NOT a gear-only update
    if (!isGearOnlyUpdate) {
      const obj: Record<string, unknown> = {
        name,
        pronouns,
        gender,
        race,
        village,
        job,
        virtue,
        personality,
        history,
      };
      let res = validateRequired(obj, ["name", "pronouns", "gender", "race", "village", "job", "virtue", "personality", "history"]);
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }

      // Files are optional for updates - only validate if provided
      if (iconFile && iconFile instanceof File && iconFile.size > 0) {
        res = validateFileTypes([iconFile], [...ALLOWED_IMAGE_TYPES]);
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
        res = validateFileSizes([iconFile], MAX_FILE_BYTES);
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      }
      
      if (appArtFile && appArtFile instanceof File && appArtFile.size > 0) {
        res = validateFileTypes([appArtFile], [...ALLOWED_IMAGE_TYPES]);
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
        res = validateFileSizes([appArtFile], MAX_FILE_BYTES);
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      }

      res = validateAge(age);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      res = validateHeight(height);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      res = validateHearts(get("hearts"));
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      res = validateStamina(get("stamina"));
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      res = validateAppLink(appLink);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    }

    // Only run additional validations if this is NOT a gear-only update
    if (!isGearOnlyUpdate) {
      const [charRaces, modRaces] = await Promise.all([
        (Character as { distinct: (f: string) => Promise<string[]> }).distinct("race"),
        (ModCharacter as { distinct: (f: string) => Promise<string[]> }).distinct("race"),
      ]);
      const races = [...new Set([...(charRaces ?? []), ...(modRaces ?? [])])].filter(Boolean).sort();
      // Use ALL_JOBS from static data instead of database distinct jobs
      // This ensures validation matches what the form shows
      const jobs = [...ALL_JOBS].sort();
      const villages = [...VILLAGES] as string[];

      let res = validateRace(race, races);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      res = validateVillage(village, villages);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      res = validateJob(job, jobs);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      
      // Check if non-admin is trying to use a mod job
      if (job && MOD_JOBS.includes(job as typeof MOD_JOBS[number])) {
        const isAdmin = await isAdminUser(user.id);
        if (!isAdmin) {
          return NextResponse.json(
            { error: "Mod jobs are restricted to admins only" },
            { status: 403 }
          );
        }
      }
      
      res = validateVirtue(virtue ?? "");
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    }

    // Validate field editability based on status (unless admin/moderator)
    // Skip this for gear-only updates
    if (!canBypassRestrictions && !isGearOnlyUpdate) {
      const fieldsToCheck: Array<{ field: string; value: unknown; fieldName: string }> = [
        { field: "name", value: name, fieldName: "name" },
        { field: "age", value: age, fieldName: "age" },
        { field: "height", value: height, fieldName: "height" },
        { field: "pronouns", value: pronouns, fieldName: "pronouns" },
        { field: "gender", value: gender, fieldName: "gender" },
        { field: "race", value: race, fieldName: "race" },
        { field: "homeVillage", value: village, fieldName: "homeVillage" },
        { field: "job", value: job, fieldName: "job" },
        { field: "virtue", value: virtue, fieldName: "virtue" },
        { field: "personality", value: personality, fieldName: "personality" },
        { field: "history", value: history, fieldName: "history" },
        { field: "extras", value: extras, fieldName: "extras" },
        { field: "appLink", value: appLink, fieldName: "appLink" },
        { field: "birthday", value: birthday, fieldName: "birthday" },
        { field: "icon", value: iconFile, fieldName: "icon" },
        { field: "appArt", value: appArtFile, fieldName: "appArt" },
      ];

      // Check if any locked field is being modified
      for (const { field, value, fieldName } of fieldsToCheck) {
        // Only check if the field is being changed (value is provided)
        if (value !== undefined && value !== null && value !== "") {
          // For files, check if a new file is being uploaded
          if (field === "icon" || field === "appArt") {
            if (value instanceof File && value.size > 0) {
              if (!isFieldEditable(fieldName, characterStatus as CharacterStatus)) {
                return NextResponse.json(
                  { error: `Field "${fieldName}" cannot be edited when character status is "${characterStatus ?? "draft"}"` },
                  { status: 403 }
                );
              }
            }
          } else {
            // For other fields, check if value differs from current value
            const currentValue = (char as Record<string, unknown>)[field];
            const newValue = typeof value === "string" ? value.trim() : value;

            const normalizeForCompare = (v: unknown) => {
              if (v === undefined || v === null) return "";
              return String(v).trim();
            };
            
            // Only validate if the value is actually changing
            if (normalizeForCompare(currentValue) !== normalizeForCompare(newValue)) {
              if (!isFieldEditable(fieldName, characterStatus as CharacterStatus)) {
                return NextResponse.json(
                  { error: `Field "${fieldName}" cannot be edited when character status is "${characterStatus ?? "draft"}"` },
                  { status: 403 }
                );
              }
            }
          }
        }
      }

      // Check gear fields if provided
      if (typeof equippedGearRaw === "string" && equippedGearRaw.trim()) {
        try {
          logger.info(
            "api/characters/[id] PUT gear check",
            `characterId=${slugOrId} status=${characterStatus ?? "null"} equippedGearRaw length=${equippedGearRaw.length}`
          );
          const equippedGearData = JSON.parse(equippedGearRaw) as {
            gearWeapon?: { name: string; stats: Record<string, number> } | null;
            gearShield?: { name: string; stats: Record<string, number> } | null;
            gearArmor?: {
              head?: { name: string; stats: Record<string, number> } | null;
              chest?: { name: string; stats: Record<string, number> } | null;
              legs?: { name: string; stats: Record<string, number> } | null;
            } | null;
          };

          // Check if gear is actually being changed. Use "meaningfully changed" so we don't block
          // when the client sends same item names but empty stats (form often omits stats).
          const weaponChanged = equippedGearData.gearWeapon !== undefined &&
            gearItemMeaningfullyChanged(char.gearWeapon, equippedGearData.gearWeapon ?? null);
          const shieldChanged = equippedGearData.gearShield !== undefined &&
            gearItemMeaningfullyChanged(char.gearShield, equippedGearData.gearShield ?? null);
          const armorChanged = equippedGearData.gearArmor !== undefined && (
            gearItemMeaningfullyChanged(char.gearArmor?.head, equippedGearData.gearArmor?.head ?? null) ||
            gearItemMeaningfullyChanged(char.gearArmor?.chest, equippedGearData.gearArmor?.chest ?? null) ||
            gearItemMeaningfullyChanged(char.gearArmor?.legs, equippedGearData.gearArmor?.legs ?? null)
          );

          const hasGearChanges = weaponChanged || shieldChanged || armorChanged;

          logger.info(
            "api/characters/[id] PUT gear compare",
            `weaponChanged=${weaponChanged} shieldChanged=${shieldChanged} armorChanged=${armorChanged} hasGearChanges=${hasGearChanges}`
          );

          if (hasGearChanges) {
            const gearEditable = isFieldEditable("gearWeapon", characterStatus as CharacterStatus) &&
              isFieldEditable("gearShield", characterStatus as CharacterStatus) &&
              isFieldEditable("gearArmor", characterStatus as CharacterStatus);
            logger.info(
              "api/characters/[id] PUT gear editability",
              `status=${characterStatus} gearEditable=${gearEditable}`
            );
            if (!gearEditable) {
              logger.warn(
                "api/characters/[id] PUT gear blocked",
                `Rejecting edit: gear fields not editable for status "${characterStatus ?? "draft"}"`
              );
              return NextResponse.json(
                { error: `Gear fields cannot be edited when character status is "${characterStatus ?? "draft"}"` },
                { status: 403 }
              );
            }
          }
        } catch (e) {
          // Ignore invalid JSON, will be handled later
          logger.warn("api/characters/[id] PUT gear parse", e instanceof Error ? e.message : String(e));
        }
      }
    }

    // Update equipped gear only when the user is allowed to edit gear (admins/mods or status allows gear edits).
    // When gear is locked (e.g. accepted), never touch gear fields — leave DB as-is.
    const canEditGear =
      canBypassRestrictions ||
      (isFieldEditable("gearWeapon", characterStatus as CharacterStatus) &&
        isFieldEditable("gearShield", characterStatus as CharacterStatus) &&
        isFieldEditable("gearArmor", characterStatus as CharacterStatus));

    let gearAppliedFromJson = false;
    if (canEditGear && typeof equippedGearRaw === "string" && equippedGearRaw.trim()) {
      try {
        const equippedGearData = JSON.parse(equippedGearRaw) as {
          gearWeapon?: { name: string; stats: Record<string, number> } | null;
          gearShield?: { name: string; stats: Record<string, number> } | null;
          gearArmor?: {
            head?: { name: string; stats: Record<string, number> } | null;
            chest?: { name: string; stats: Record<string, number> } | null;
            legs?: { name: string; stats: Record<string, number> } | null;
          } | null;
        };
        
        // Convert equipped gear to the format expected by Character model
        const gear: {
          gearWeapon?: { name: string; stats: Map<string, number> } | null;
          gearShield?: { name: string; stats: Map<string, number> } | null;
          gearArmor?: {
            head?: { name: string; stats: Map<string, number> } | null;
            chest?: { name: string; stats: Map<string, number> } | null;
            legs?: { name: string; stats: Map<string, number> } | null;
          } | null;
        } = {};
        
        // When form sends same item name but empty stats (client omits stats), preserve DB stats
        const statsForItem = (
          formItem: { name: string; stats?: Record<string, number> } | null,
          dbItem: { name: string; stats?: Map<string, number> | Record<string, number> } | null | undefined
        ): Record<string, number> => {
          const formStats = formItem?.stats ?? {};
          if (Object.keys(formStats).length > 0) return formStats;
          if (dbItem && formItem && dbItem.name === formItem.name) {
            return normalizeStats(dbItem.stats);
          }
          return formStats;
        };

        // Handle weapon - set to null if explicitly undefined/null, otherwise convert
        if (equippedGearData.gearWeapon !== undefined) {
          if (equippedGearData.gearWeapon) {
            const stats = statsForItem(equippedGearData.gearWeapon, char.gearWeapon);
            gear.gearWeapon = {
              name: equippedGearData.gearWeapon.name,
              stats: new Map(Object.entries(normalizeStatsToModifierHearts(stats))),
            };
          } else {
            gear.gearWeapon = null;
          }
        }

        // Handle shield - set to null if explicitly undefined/null, otherwise convert
        if (equippedGearData.gearShield !== undefined) {
          if (equippedGearData.gearShield) {
            const stats = statsForItem(equippedGearData.gearShield, char.gearShield);
            gear.gearShield = {
              name: equippedGearData.gearShield.name,
              stats: new Map(Object.entries(normalizeStatsToModifierHearts(stats))),
            };
          } else {
            gear.gearShield = null;
          }
        }

        // Handle armor
        if (equippedGearData.gearArmor !== undefined) {
          if (equippedGearData.gearArmor) {
            gear.gearArmor = {};
            if (equippedGearData.gearArmor.head) {
              const stats = statsForItem(equippedGearData.gearArmor.head, char.gearArmor?.head);
              gear.gearArmor.head = {
                name: equippedGearData.gearArmor.head.name,
                stats: new Map(Object.entries(normalizeStatsToModifierHearts(stats))),
              };
            }
            if (equippedGearData.gearArmor.chest) {
              const stats = statsForItem(equippedGearData.gearArmor.chest, char.gearArmor?.chest);
              gear.gearArmor.chest = {
                name: equippedGearData.gearArmor.chest.name,
                stats: new Map(Object.entries(normalizeStatsToModifierHearts(stats))),
              };
            }
            if (equippedGearData.gearArmor.legs) {
              const stats = statsForItem(equippedGearData.gearArmor.legs, char.gearArmor?.legs);
              gear.gearArmor.legs = {
                name: equippedGearData.gearArmor.legs.name,
                stats: new Map(Object.entries(normalizeStatsToModifierHearts(stats))),
              };
            }
          } else {
            gear.gearArmor = null;
          }
        }

        // Normalize weapon/shield slots: move shields out of weapon slot, clear weapons from shield slot
        const { default: Item } = await import("@/models/ItemModel.js");
        const getItemByName = async (name: string) => {
          const doc = await Item.findOne({ itemName: name })
            .select("categoryGear type subtype")
            .lean()
            .exec();
          const single = doc && !Array.isArray(doc) ? doc : null;
          return single ? { categoryGear: single.categoryGear, type: single.type, subtype: single.subtype } : null;
        };
        await normalizeGearSlots(gear, getItemByName);
        
        // Update gear on character (use form-sent keys so normalization clears slots when needed)
        if (equippedGearData.gearWeapon !== undefined) {
          char.gearWeapon = gear.gearWeapon ?? undefined;
        }
        if (equippedGearData.gearShield !== undefined) {
          char.gearShield = gear.gearShield ?? undefined;
        }
        if (gear.gearArmor !== undefined) {
          // Convert null values to empty object for Mongoose compatibility
          if (gear.gearArmor === null) {
            char.gearArmor = {};
          } else {
            // Convert null values within gearArmor to undefined
            char.gearArmor = {
              head: gear.gearArmor.head || undefined,
              chest: gear.gearArmor.chest || undefined,
              legs: gear.gearArmor.legs || undefined,
            };
          }
        }
        gearAppliedFromJson = true;
      } catch (e) {
        logger.warn("api/characters/[id] PUT equippedGear parse/apply failed", e instanceof Error ? e.message : String(e));
      }
    }

    // Always apply weapon/shield from plain form fields when present — guarantees user's selection is saved
    // (equippedGear JSON or normalizeGearSlots can drop/clear items; backup names are source of truth)
    const gearWeaponName = get("gearWeaponName") as string | undefined;
    const gearShieldName = get("gearShieldName") as string | undefined;
    if (canEditGear && (gearWeaponName?.trim() || gearShieldName?.trim())) {
      if (gearWeaponName?.trim()) {
        char.gearWeapon = {
          name: gearWeaponName.trim(),
          stats: new Map([["modifierHearts", 0]]),
        };
      }
      if (gearShieldName?.trim()) {
        char.gearShield = {
          name: gearShieldName.trim(),
          stats: new Map([["modifierHearts", 0]]),
        };
      }
    }

    // Only validate hearts/stamina if this is NOT a gear-only update
    if (!isGearOnlyUpdate) {
      const hearts = (() => {
        const v = get("hearts");
        if (v == null || v === "") return char.maxHearts;
        const n = parseInt(String(v), 10);
        return Number.isNaN(n) ? char.maxHearts : Math.max(1, n);
      })();
      const stamina = (() => {
        const v = get("stamina");
        if (v == null || v === "") return char.maxStamina;
        const n = parseInt(String(v), 10);
        return Number.isNaN(n) ? char.maxStamina : Math.max(1, n);
      })();

      // Validate hearts/stamina changes (always locked unless admin/moderator)
      if (!canBypassRestrictions) {
        const heartsValue = get("hearts");
        const staminaValue = get("stamina");
        
        if (heartsValue !== null && heartsValue !== undefined && heartsValue !== "") {
          const newHearts = parseInt(String(heartsValue), 10);
          if (!Number.isNaN(newHearts) && newHearts !== char.maxHearts) {
            return NextResponse.json(
              { error: "maxHearts cannot be edited by users" },
              { status: 403 }
            );
          }
        }
        
        if (staminaValue !== null && staminaValue !== undefined && staminaValue !== "") {
          const newStamina = parseInt(String(staminaValue), 10);
          if (!Number.isNaN(newStamina) && newStamina !== char.maxStamina) {
            return NextResponse.json(
              { error: "maxStamina cannot be edited by users" },
              { status: 403 }
            );
          }
        }
      }

      // Update character fields (only if not a gear-only update)
      // Build update object with only provided fields to ensure they're saved
      const updateData: Record<string, unknown> = {
        maxHearts: hearts,
        maxStamina: stamina,
      };
      
      // Only include fields that are provided in the request
      // This ensures locked fields that are sent (with their initial values) are preserved
      if (name !== undefined) updateData.name = (name as string).trim();
      if (age !== undefined) updateData.age = age ? parseInt(String(age), 10) : null;
      if (height !== undefined) updateData.height = height ? parseFloat(String(height)) : null;
      if (pronouns !== undefined) updateData.pronouns = (pronouns as string).trim();
      if (gender !== undefined) updateData.gender = typeof gender === "string" ? gender.trim() : "";
      if (race !== undefined) updateData.race = (race as string).trim();
      if (village !== undefined) updateData.homeVillage = (village as string).trim();
      if (job !== undefined) updateData.job = (job as string).trim();
      if (virtue !== undefined) updateData.virtue = (virtue ?? "TBA").trim().toLowerCase();
      if (personality !== undefined) updateData.personality = typeof personality === "string" ? personality.trim() : "";
      if (history !== undefined) updateData.history = typeof history === "string" ? history.trim() : "";
      if (extras !== undefined) updateData.extras = typeof extras === "string" ? extras.trim() : "";
      if (appLink !== undefined) updateData.appLink = typeof appLink === "string" ? appLink.trim() : "";
      if (birthday !== undefined) updateData.birthday = typeof birthday === "string" ? birthday.trim() : "";
      
      char.set(updateData);

      // Upload files to GCS if provided, otherwise keep existing URLs
      if (iconFile && iconFile instanceof File && iconFile.size > 0) {
      if (gcsUploadService.isConfigured()) {
        try {
          const uploadResult = await gcsUploadService.uploadFile(
            iconFile,
            user.id,
            String(char._id),
            "icon"
          );
          char.set({ icon: uploadResult.url });
        } catch (uploadError) {
          logger.error(
            "api/characters/[id] PUT",
            `Failed to upload icon to GCS: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`
          );
          // Fall through to use placeholder if upload fails
          char.set({ icon: PLACEHOLDER_ICON });
        }
      } else {
        char.set({ icon: PLACEHOLDER_ICON });
      }
    }
    
    if (appArtFile && appArtFile instanceof File && appArtFile.size > 0) {
      if (gcsUploadService.isConfigured()) {
        try {
          const uploadResult = await gcsUploadService.uploadFile(
            appArtFile,
            user.id,
            String(char._id),
            "appArt"
          );
          char.set({ appArt: uploadResult.url });
        } catch (uploadError) {
          logger.error(
            "api/characters/[id] PUT",
            `Failed to upload appArt to GCS: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`
          );
          // Fall through to use placeholder if upload fails
          char.set({ appArt: PLACEHOLDER_APPART });
        }
      } else {
        char.set({ appArt: PLACEHOLDER_APPART });
      }
    }
    }
    
    // Recalculate attack/defense stats from equipped gear (always run, even for gear-only updates).
    // Any future code path that mutates gearWeapon/gearShield/gearArmor must also call recalculateStats before save so attack/defense stay in sync.
    recalculateStats(char);
    
    await char.save();

    const out = typeof char.toObject === "function" ? char.toObject() : (char as unknown as Record<string, unknown>);
    return NextResponse.json({ character: out });
  } catch (e) {
    logger.error(
      "api/characters/[id] PUT",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to update character" },
      { status: 500 }
    );
  }
}
