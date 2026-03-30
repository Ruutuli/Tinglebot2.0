/**
 * Character of the Week rotation logic
 * Handles selection algorithm and rotation functions
 */

import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { getNextSundayMidnightEST, getCurrentWeekStartDate } from "@/lib/date-utils";
import { tryAcquireLock, releaseLock } from "@/lib/distributed-lock";
import { logger } from "@/utils/logger";

/** Same key as character-of-week-rotation job — one rotation at a time across all callers */
const ROTATION_LOCK_KEY = "character-of-week-rotation-run";
const ROTATION_LOCK_TTL_MS = 5 * 60 * 1000;

type CharacterOfWeekRecord = {
  _id: unknown;
  characterId: unknown;
  characterName: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  isActive?: boolean;
  featuredReason?: string;
  views?: number;
  __v?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

type CharacterFull = {
  _id: mongoose.Types.ObjectId;
  name: string;
  race: string;
  job: string;
  currentVillage?: string;
  homeVillage: string;
  icon?: string;
  userId: string;
};

export type CurrentCharacterOfWeek = CharacterOfWeekRecord & {
  character: CharacterFull;
};

/**
 * Select a character for the week using the fair rotation algorithm
 * Priority 1: Characters never featured (randomly selected)
 * Priority 2: If all have been featured, pick the one featured longest ago
 */
export async function selectCharacterForWeek(): Promise<{
  characterId: string;
  characterName: string;
  userId: string;
} | null> {
  await connect();
  
  const Character = (await import("@/models/CharacterModel.js")).default;
  const CharacterOfWeek = (await import("@/models/CharacterOfWeekModel.js")).default;
  
  try {
    // Get all accepted characters
    type CharacterSelectDoc = {
      _id: mongoose.Types.ObjectId;
      name: string;
      userId: string;
    };
    const allCharacters = await Character.find({ status: "accepted" })
      .select("_id name userId")
      .lean<CharacterSelectDoc[]>();
    
    if (allCharacters.length === 0) {
      logger.warn("character-of-week", "No accepted characters found");
      return null;
    }
    
    // Get all previously featured character IDs
    const featuredCharacterIds = await CharacterOfWeek.distinct("characterId");
    const featuredIdsSet = new Set(
      featuredCharacterIds.map((id: unknown) => String(id))
    );
    
    // Find characters never featured
    const neverFeatured = allCharacters.filter(
      (char) => !featuredIdsSet.has(String(char._id))
    );
    
    let selectedCharacter;
    
    if (neverFeatured.length > 0) {
      // Priority 1: Randomly select from never-featured characters
      const randomIndex = Math.floor(Math.random() * neverFeatured.length);
      selectedCharacter = neverFeatured[randomIndex];
      logger.info(
        "character-of-week",
        `Selected never-featured character: ${selectedCharacter.name}`
      );
    } else {
      // Priority 2: All have been featured, find the one featured longest ago
      type CharacterOfWeekSelectDoc = {
        characterId: mongoose.Types.ObjectId;
        endDate: Date;
      };
      const featuredHistory = await CharacterOfWeek.find({
        characterId: { $in: allCharacters.map((c) => c._id) },
      })
        .select("characterId endDate")
        .sort({ endDate: 1 }) // Sort by endDate ascending (oldest first)
        .lean<CharacterOfWeekSelectDoc[]>();
      
      if (featuredHistory.length === 0) {
        // Fallback: just pick a random character
        const randomIndex = Math.floor(Math.random() * allCharacters.length);
        selectedCharacter = allCharacters[randomIndex];
        logger.warn(
          "character-of-week",
          "No featured history found, selecting random character"
        );
      } else {
        // Get the character ID that was featured longest ago
        const oldestFeaturedId = String(featuredHistory[0].characterId);
        selectedCharacter = allCharacters.find(
          (char) => String(char._id) === oldestFeaturedId
        );
        
        if (!selectedCharacter) {
          // Fallback if character not found
          const randomIndex = Math.floor(Math.random() * allCharacters.length);
          selectedCharacter = allCharacters[randomIndex];
          logger.warn(
            "character-of-week",
            "Selected character not found, using random fallback"
          );
        } else {
          logger.info(
            "character-of-week",
            `Selected character featured longest ago: ${selectedCharacter.name}`
          );
        }
      }
    }
    
    if (!selectedCharacter) {
      logger.error("character-of-week", "Failed to select a character");
      return null;
    }
    
    return {
      characterId: String(selectedCharacter._id),
      characterName: selectedCharacter.name,
      userId: selectedCharacter.userId,
    };
  } catch (error) {
    logger.error(
      "character-of-week",
      `Error selecting character: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Rotate the Character of the Week
 * Deactivates current featured character and creates a new one
 *
 * Uses a distributed lock so Agenda, init, and API calls cannot interleave.
 * Idempotent for the same week: if an active row already exists for this period, no-op (unless force).
 */
export async function rotateCharacterOfWeek(
  featuredReason: string = "Weekly rotation",
  options?: { force?: boolean }
): Promise<void> {
  await connect();

  const acquired = await tryAcquireLock(ROTATION_LOCK_KEY, ROTATION_LOCK_TTL_MS);
  if (!acquired) {
    logger.info(
      "character-of-week",
      "Rotation lock not acquired (another instance is rotating), skipping"
    );
    return;
  }

  const CharacterOfWeek = (await import("@/models/CharacterOfWeekModel.js")).default;

  try {
    const startDate = getCurrentWeekStartDate();
    const endDate = getNextSundayMidnightEST();

    if (!options?.force) {
      const alreadyActive = await CharacterOfWeek.findOne({
        startDate,
        endDate,
        isActive: true,
      }).lean();
      if (alreadyActive) {
        logger.info(
          "character-of-week",
          "Active character of the week already exists for this week window, skipping duplicate rotation"
        );
        return;
      }
    }

    // Deactivate current featured character
    await CharacterOfWeek.updateMany(
      { isActive: true },
      { isActive: false }
    );

    // Select new character
    const selected = await selectCharacterForWeek();

    if (!selected) {
      throw new Error("Failed to select a character for the week");
    }

    // Create new Character of the Week record
    await CharacterOfWeek.create({
      characterId: selected.characterId,
      characterName: selected.characterName,
      userId: selected.userId,
      startDate,
      endDate,
      isActive: true,
      featuredReason,
      views: 0,
    });

    logger.success(
      "character-of-week",
      `Rotated to new character: ${selected.characterName} (${selected.characterId})`
    );
  } catch (error) {
    logger.error(
      "character-of-week",
      `Error rotating character of the week: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  } finally {
    await releaseLock(ROTATION_LOCK_KEY);
  }
}

/**
 * Get the current featured character
 * If multiple rows are active for the same week (duplicate rotations), keeps the first
 * rotation (earliest createdAt) and deactivates the rest so reads are deterministic.
 */
export async function getCurrentCharacterOfWeek(): Promise<CurrentCharacterOfWeek | null> {
  await connect();
  
  const CharacterOfWeek = (await import("@/models/CharacterOfWeekModel.js")).default;
  const Character = (await import("@/models/CharacterModel.js")).default;
  
  try {
    const weekStart = getCurrentWeekStartDate();
    const weekEnd = getNextSundayMidnightEST();
    const ws = weekStart.getTime();
    const we = weekEnd.getTime();

    const actives = await CharacterOfWeek.find({ isActive: true }).lean();
    type LeanDoc = CharacterOfWeekRecord & { _id: mongoose.Types.ObjectId; createdAt?: Date };
    const sameWeek = (actives as LeanDoc[])
      .filter((r) => {
        const sd = new Date(r.startDate).getTime();
        const ed = new Date(r.endDate).getTime();
        return sd === ws && ed === we;
      })
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      });

    if (sameWeek.length > 1) {
      const [, ...dupes] = sameWeek;
      await CharacterOfWeek.updateMany(
        { _id: { $in: dupes.map((d) => d._id) } },
        { $set: { isActive: false } }
      );
      logger.warn(
        "character-of-week",
        `Deactivated ${dupes.length} duplicate active character(s) for the same week window (kept first rotation)`
      );
    }

    let current: unknown | null =
      sameWeek.length > 0 ? sameWeek[0] : null;

    if (!current && actives.length > 0) {
      const fallback = [...(actives as LeanDoc[])].sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      })[0];
      current = fallback;
    }

    if (!current || Array.isArray(current)) {
      return null;
    }

    const currentRecord = current as CharacterOfWeekRecord;
    
    // Get full character data
    const characterId = String(currentRecord.characterId);
    const character = await Character.findById(characterId)
      .select("_id name race job currentVillage homeVillage icon userId")
      .lean<CharacterFull>();
    
    if (!character || Array.isArray(character)) {
      logger.warn(
        "character-of-week",
        `Character not found for ID: ${characterId}`
      );
      return null;
    }
    
    return {
      ...currentRecord,
      character: {
        _id: character._id,
        name: character.name,
        race: character.race,
        job: character.job,
        currentVillage: character.currentVillage,
        homeVillage: character.homeVillage,
        icon: character.icon,
        userId: character.userId,
      },
    };
  } catch (error) {
    logger.error(
      "character-of-week",
      `Error getting current character of the week: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Manually set a character as Character of the Week
 */
export async function setCharacterOfWeek(
  characterId: string,
  featuredReason: string = "Manual selection"
): Promise<void> {
  await connect();

  const acquired = await tryAcquireLock(ROTATION_LOCK_KEY, ROTATION_LOCK_TTL_MS);
  if (!acquired) {
    logger.info(
      "character-of-week",
      "Rotation lock not acquired (another instance is rotating), skipping manual set"
    );
    throw new Error("Character of the week update is in progress; try again shortly.");
  }

  const Character = (await import("@/models/CharacterModel.js")).default;
  const CharacterOfWeek = (await import("@/models/CharacterOfWeekModel.js")).default;

  try {
    // Verify character exists and is accepted
    type CharacterStatusDoc = {
      _id: mongoose.Types.ObjectId;
      name: string;
      userId: string;
      status: string;
    };
    const character = await Character.findById(characterId)
      .select("_id name userId status")
      .lean<CharacterStatusDoc>();
    
    if (!character || Array.isArray(character)) {
      throw new Error(`Character not found: ${characterId}`);
    }
    
    if (character.status !== "accepted") {
      throw new Error(`Character is not accepted: ${character.status}`);
    }
    
    // Deactivate current featured character
    await CharacterOfWeek.updateMany(
      { isActive: true },
      { isActive: false }
    );
    
    // Calculate dates
    const startDate = getCurrentWeekStartDate();
    const endDate = getNextSundayMidnightEST();
    
    // Create new Character of the Week record
    await CharacterOfWeek.create({
      characterId: character._id,
      characterName: character.name,
      userId: character.userId,
      startDate,
      endDate,
      isActive: true,
      featuredReason,
      views: 0,
    });
    
    logger.success(
      "character-of-week",
      `Manually set character of the week: ${character.name} (${characterId})`
    );
  } catch (error) {
    logger.error(
      "character-of-week",
      `Error setting character of the week: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  } finally {
    await releaseLock(ROTATION_LOCK_KEY);
  }
}

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type CharacterOfWeekData = {
  _id: unknown;
  characterId: unknown;
  characterName: unknown;
  userId: unknown;
  startDate: unknown;
  endDate: unknown;
  featuredReason: unknown;
  views: unknown;
  character: unknown;
};

/**
 * Serialize Character of the Week data for API responses
 */
export function serializeCharacterOfWeek(current: Awaited<ReturnType<typeof getCurrentCharacterOfWeek>>) {
  if (!current) return null;
  
  const data = current as unknown as CharacterOfWeekData;
  return {
    _id: data._id,
    characterId: data.characterId,
    characterName: data.characterName,
    userId: data.userId,
    startDate: data.startDate,
    endDate: data.endDate,
    featuredReason: data.featuredReason,
    views: data.views,
    character: data.character,
  };
}

/**
 * Build rotation info object for API responses
 */
export function buildRotationInfo(
  nextRotation: Date,
  timeUntilRotation?: string,
  totalRotations?: number
) {
  const info: {
    nextRotation: string;
    timeUntilRotation?: string;
    totalRotations?: number;
  } = {
    nextRotation: nextRotation.toISOString(),
  };
  
  if (timeUntilRotation) {
    info.timeUntilRotation = timeUntilRotation;
  }
  
  if (totalRotations !== undefined) {
    info.totalRotations = totalRotations;
  }
  
  return info;
}
