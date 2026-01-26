// ============================================================================
// ------------------- GET /api/users/profile -------------------
// ============================================================================
//
// Fetch current user's profile data from UserModel.
// Uses session Discord ID to query the database.
// Also fetches activity data: characters, pets, mounts, and message activity.

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type CharacterDoc = {
  _id: string;
  name: string;
  lastRollDate?: Date;
  dailyRoll?: Map<string, unknown> | Record<string, unknown>;
};

type PetDoc = {
  _id: string;
  name: string;
  lastRollDate?: Date;
};

type MountDoc = {
  _id: string;
  name: string;
  lastMountTravel?: Date;
};

type MessageActivityItem = {
  dayKey: string;
  count: number;
};

type MongooseDoc = {
  toObject?: () => unknown;
  _id?: { toString: () => string };
  [key: string]: unknown;
};

type MessageCountItem = {
  _id: string;
  count: number;
};

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const ACTIVITY_DAYS = 30;

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Generate Day Keys ------------------
// Generate array of day keys for the last N days

function generateDayKeys(days: number): string[] {
  const now = new Date();
  const dayKeys: string[] = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    dayKeys.push(date.toISOString().split("T")[0]);
  }
  
  return dayKeys;
}

// ------------------- Normalize Mongoose Document ------------------
// Convert Mongoose document to plain object, handling toObject() and _id

function normalizeMongooseDoc(doc: unknown): MongooseDoc {
  if (typeof doc !== "object" || doc === null) {
    throw new Error("[profile.ts]❌ Invalid document type");
  }
  
  const mongooseDoc = doc as MongooseDoc;
  return mongooseDoc.toObject ? (mongooseDoc.toObject() as MongooseDoc) : mongooseDoc;
}

// ------------------- Transform Character Document ------------------
// Convert character document to API response format

function transformCharacterDoc(doc: unknown): CharacterDoc {
  const normalized = normalizeMongooseDoc(doc);
  
  if (!normalized._id || typeof normalized._id.toString !== "function") {
    throw new Error("[profile.ts]❌ Invalid character document _id");
  }
  
  const dailyRoll = normalized.dailyRoll instanceof Map
    ? Object.fromEntries(normalized.dailyRoll)
    : (normalized.dailyRoll as Record<string, unknown> || {});
  
  return {
    _id: normalized._id.toString(),
    name: normalized.name as string,
    lastRollDate: normalized.lastRollDate as Date | undefined,
    dailyRoll,
  };
}

// ------------------- Transform Pet Document ------------------
// Convert pet document to API response format

function transformPetDoc(doc: unknown): PetDoc {
  const normalized = normalizeMongooseDoc(doc);
  
  if (!normalized._id || typeof normalized._id.toString !== "function") {
    throw new Error("[profile.ts]❌ Invalid pet document _id");
  }
  
  return {
    _id: normalized._id.toString(),
    name: normalized.name as string,
    lastRollDate: normalized.lastRollDate as Date | undefined,
  };
}

// ------------------- Transform Mount Document ------------------
// Convert mount document to API response format

function transformMountDoc(doc: unknown): MountDoc {
  const normalized = normalizeMongooseDoc(doc);
  
  if (!normalized._id || typeof normalized._id.toString !== "function") {
    throw new Error("[profile.ts]❌ Invalid mount document _id");
  }
  
  return {
    _id: normalized._id.toString(),
    name: normalized.name as string,
    lastMountTravel: normalized.lastMountTravel as Date | undefined,
  };
}

// ------------------- Normalize Error ------------------
// Convert unknown error to Error instance

function normalizeError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// ============================================================================
// ------------------- API Route Handler -------------------
// ============================================================================

export async function GET() {
  try {
    const session = await getSession();
    const discordId = session.user?.id;

    if (!discordId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    await connect();
    const { default: User } = await import("@/models/UserModel.js");

    const user = await User.findOne({ discordId }).lean();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Fetch activity data in parallel
    try {
      const [
        CharacterModule,
        ModCharacterModule,
        PetModule,
        MountModule,
        MessageTrackingModule,
      ] = await Promise.all([
        import("@/models/CharacterModel.js"),
        import("@/models/ModCharacterModel.js"),
        import("@/models/PetModel.js"),
        import("@/models/MountModel.js"),
        import("@/models/MessageTrackingModel.js"),
      ]);

      const Character = CharacterModule.default || CharacterModule;
      const ModCharacter = ModCharacterModule.default || ModCharacterModule;
      const Pet = PetModule.default || PetModule;
      const Mount = MountModule.default || MountModule;
      const MessageTracking = MessageTrackingModule.default || MessageTrackingModule;

      const dayKeys = generateDayKeys(ACTIVITY_DAYS);

      // Fetch all activity data in parallel
      const [characters, pets, mounts, messages] = await Promise.all([
        // Fetch characters (regular and mod) - don't use lean() to preserve Map types
        Promise.all([
          Character.find({ userId: discordId })
            .select("name lastRollDate dailyRoll"),
          ModCharacter.find({ userId: discordId })
            .select("name lastRollDate dailyRoll"),
        ]).then(async ([regular, mod]) => {
          const regularDocs = await Promise.all(
            regular.map((char) => transformCharacterDoc(char))
          );
          
          const modDocs = await Promise.all(
            mod.map((char) => transformCharacterDoc(char))
          );
          
          return [...regularDocs, ...modDocs];
        }),
        // Fetch pets
        Pet.find({ discordId })
          .select("name lastRollDate")
          .then((pets) => pets.map((pet) => transformPetDoc(pet))),
        // Fetch mounts
        Mount.find({ discordId })
          .select("name lastMountTravel")
          .then((mounts) => mounts.map((mount) => transformMountDoc(mount))),
        // Fetch message activity for last 30 days
        (async (): Promise<MessageActivityItem[]> => {
          const guildId = process.env.GUILD_ID;
          if (!guildId) {
            logger.warn("profile.ts", "⚠️ GUILD_ID not configured, skipping message activity");
            return [];
          }

          try {
            // Aggregate message counts by dayKey
            const messageCounts = await MessageTracking.aggregate([
              {
                $match: {
                  userId: discordId,
                  guildId: guildId,
                  dayKey: { $in: dayKeys },
                },
              },
              {
                $group: {
                  _id: "$dayKey",
                  count: { $sum: 1 },
                },
              },
            ]);

            // Create a map for quick lookup
            const countMap = new Map<string, number>(
              messageCounts.map((item: unknown) => {
                const normalized = item as MessageCountItem;
                return [normalized._id, normalized.count];
              })
            );

            // Return array with all dayKeys, filling in 0 for missing days
            return dayKeys.map((dayKey) => ({
              dayKey,
              count: countMap.get(dayKey) || 0,
            }));
          } catch (error) {
            const err = normalizeError(error);
            logger.error("profile.ts", `❌ Failed to fetch message activity: ${err.message}`);
            return [];
          }
        })(),
      ]);

      // Log activity data for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        logger.info("profile.ts", `Activity: ${characters.length} chars, ${pets.length} pets, ${mounts.length} mounts, ${messages.length} message days`);
      }

      return NextResponse.json({
        user,
        activity: {
          characters,
          pets,
          mounts,
          messages,
        },
      });
    } catch (activityError) {
      // Log error but don't fail the request - return user without activity data
      const err = normalizeError(activityError);
      logger.error("profile.ts", `❌ Failed to fetch activity data: ${err.message}`);
      return NextResponse.json({ user });
    }
  } catch (e) {
    const err = normalizeError(e);
    logger.error("profile.ts", `❌ Failed to fetch user profile: ${err.message}`);
    return NextResponse.json(
      { error: "Failed to fetch user profile" },
      { status: 500 }
    );
  }
}
