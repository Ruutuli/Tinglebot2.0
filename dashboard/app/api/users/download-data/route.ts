// ============================================================================
// ------------------- GET /api/users/download-data -------------------
// ============================================================================
//
// Fetch all user-related data for download.
// Aggregates profile, characters, pets, mounts, notifications, tokens, activity data, and inventories.
// Returns a ZIP file with separate JSON files for each model.

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import { NextResponse } from "next/server";
import archiver from "archiver";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type UserDoc = {
  _id?: unknown;
  tokens?: number;
  [key: string]: unknown;
};

type CharacterDoc = {
  _id?: unknown;
  name?: string;
  dailyRoll?: Map<string, unknown> | Record<string, unknown>;
  [key: string]: unknown;
};

type PetDoc = {
  _id?: unknown;
  name?: string;
  [key: string]: unknown;
};

type MountDoc = {
  _id?: unknown;
  name?: string;
  [key: string]: unknown;
};

type NotificationDoc = {
  _id?: unknown;
  type?: string;
  title?: string;
  message?: string;
  read?: boolean;
  createdAt?: Date;
  readAt?: Date;
  [key: string]: unknown;
};

type TokenTransactionDoc = {
  _id?: unknown;
  amount?: number;
  type?: string;
  category?: string;
  description?: string;
  link?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  timestamp?: Date;
  [key: string]: unknown;
};

type MessageTrackingDoc = {
  _id?: unknown;
  dayKey?: string;
  guildId?: string;
  timestamp?: Date;
  [key: string]: unknown;
};

type MongooseDoc = {
  toObject?: () => unknown;
  _id?: { toString?: () => string } | string;
  [key: string]: unknown;
};

type InventoryItem = {
  _id?: unknown;
  itemName?: string;
  quantity?: number;
  [key: string]: unknown;
};

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Normalize Mongoose Document ------------------
// Convert Mongoose document to plain object, handling toObject() and _id

function normalizeMongooseDoc(doc: unknown): MongooseDoc {
  if (typeof doc !== "object" || doc === null) {
    throw new Error("[download-data.ts]❌ Invalid document type");
  }
  
  const mongooseDoc = doc as MongooseDoc;
  return mongooseDoc.toObject ? (mongooseDoc.toObject() as MongooseDoc) : mongooseDoc;
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

    // Import all models
    const [
      UserModule,
      CharacterModule,
      ModCharacterModule,
      PetModule,
      MountModule,
      NotificationModule,
      TokenTransactionModule,
      MessageTrackingModule,
    ] = await Promise.all([
      import("@/models/UserModel.js"),
      import("@/models/CharacterModel.js"),
      import("@/models/ModCharacterModel.js"),
      import("@/models/PetModel.js"),
      import("@/models/MountModel.js"),
      import("@/models/NotificationModel.js"),
      import("@/models/TokenTransactionModel.js"),
      import("@/models/MessageTrackingModel.js"),
    ]);

    const User = UserModule.default || UserModule;
    const Character = CharacterModule.default || CharacterModule;
    const ModCharacter = ModCharacterModule.default || ModCharacterModule;
    const Pet = PetModule.default || PetModule;
    const Mount = MountModule.default || MountModule;
    const Notification = NotificationModule.default || NotificationModule;
    const TokenTransaction = TokenTransactionModule.default || TokenTransactionModule;
    const MessageTracking = MessageTrackingModule.default || MessageTrackingModule;

    // Fetch all user data in parallel
    const [
      user,
      characters,
      modCharacters,
      pets,
      mounts,
      notifications,
      tokenTransactions,
      messageTracking,
    ] = await Promise.all([
      // User profile
      User.findOne({ discordId }).lean(),
      // Characters (regular)
      Character.find({ userId: discordId })
        .lean()
        .then((chars) =>
          chars.map((char: unknown) => {
            const doc = normalizeMongooseDoc(char) as CharacterDoc;
            // Convert Maps to objects
            const result: Record<string, unknown> = { ...doc };
            if (doc.dailyRoll instanceof Map) {
              result.dailyRoll = Object.fromEntries(doc.dailyRoll);
            }
            if (doc._id) {
              result._id = typeof doc._id === "object" && doc._id !== null && "toString" in doc._id
                ? doc._id.toString()
                : String(doc._id);
            }
            return result;
          })
        ),
      // Characters (mod)
      ModCharacter.find({ userId: discordId })
        .lean()
        .then((chars) =>
          chars.map((char: unknown) => {
            const doc = normalizeMongooseDoc(char) as CharacterDoc;
            const result: Record<string, unknown> = { ...doc };
            if (doc.dailyRoll instanceof Map) {
              result.dailyRoll = Object.fromEntries(doc.dailyRoll);
            }
            if (doc._id) {
              result._id = typeof doc._id === "object" && doc._id !== null && "toString" in doc._id
                ? doc._id.toString()
                : String(doc._id);
            }
            return result;
          })
        ),
      // Pets
      Pet.find({ discordId })
        .lean()
        .then((pets: unknown[]) =>
          pets.map((pet: unknown) => {
            const doc = normalizeMongooseDoc(pet) as PetDoc;
            return {
              ...doc,
              _id: doc._id
                ? (typeof doc._id === "object" && doc._id !== null && "toString" in doc._id
                    ? doc._id.toString()
                    : String(doc._id))
                : undefined,
            };
          })
        ),
      // Mounts
      Mount.find({ discordId })
        .lean()
        .then((mounts: unknown[]) =>
          mounts.map((mount: unknown) => {
            const doc = normalizeMongooseDoc(mount) as MountDoc;
            return {
              ...doc,
              _id: doc._id
                ? (typeof doc._id === "object" && doc._id !== null && "toString" in doc._id
                    ? doc._id.toString()
                    : String(doc._id))
                : undefined,
            };
          })
        ),
      // Notifications
      Notification.find({ userId: discordId })
        .sort({ createdAt: -1 })
        .lean()
        .then((notifs: unknown[]) =>
          notifs.map((n: unknown) => {
            const doc = normalizeMongooseDoc(n) as NotificationDoc;
            return {
              id: doc._id
                ? (typeof doc._id === "object" && doc._id !== null && "toString" in doc._id
                    ? doc._id.toString()
                    : String(doc._id))
                : "",
              type: doc.type,
              title: doc.title,
              message: doc.message,
              read: doc.read,
              createdAt: doc.createdAt,
              readAt: doc.readAt,
            };
          })
        ),
      // Token transactions
      TokenTransaction.find({ userId: discordId })
        .sort({ timestamp: -1 })
        .lean()
        .then((txns: unknown[]) =>
          txns.map((t: unknown) => {
            const doc = normalizeMongooseDoc(t) as TokenTransactionDoc;
            return {
              id: doc._id
                ? (typeof doc._id === "object" && doc._id !== null && "toString" in doc._id
                    ? doc._id.toString()
                    : String(doc._id))
                : "",
              amount: doc.amount,
              type: doc.type,
              category: doc.category,
              description: doc.description,
              link: doc.link,
              balanceBefore: doc.balanceBefore,
              balanceAfter: doc.balanceAfter,
              timestamp: doc.timestamp,
            };
          })
        ),
      // Message tracking
      MessageTracking.find({ userId: discordId })
        .sort({ dayKey: -1 })
        .limit(365) // Last year of data
        .lean()
        .then((msgs: unknown[]) =>
          msgs.map((m: unknown) => {
            const doc = normalizeMongooseDoc(m) as MessageTrackingDoc;
            return {
              dayKey: doc.dayKey,
              guildId: doc.guildId,
              timestamp: doc.timestamp,
            };
          })
        ),
    ]);

    // Fetch inventories for all characters
    const allCharacters = [
      ...characters.map((c: Record<string, unknown>) => ({ ...c, isModCharacter: false })),
      ...modCharacters.map((c: Record<string, unknown>) => ({ ...c, isModCharacter: true })),
    ];

    // Connect to inventories database (using cached connection)
    const db = await getInventoriesDb();

    // Fetch inventories for each character
    const characterInventories: Record<string, InventoryItem[]> = {};
    await Promise.all(
      allCharacters.map(async (character: Record<string, unknown>) => {
        try {
          const collectionName = typeof character.name === "string" ? character.name.toLowerCase() : undefined;
          if (!collectionName) return;

          const collection = db.collection(collectionName);
          const inventoryItems = await collection.find({ quantity: { $gt: 0 } }).toArray();
          
          // Convert MongoDB documents to plain objects
          const inventoryData: InventoryItem[] = inventoryItems.map((item: unknown) => {
            const doc = item as InventoryItem;
            const result: InventoryItem = {
              itemName: doc.itemName,
              quantity: doc.quantity,
            };
            if (doc._id) {
              result._id = typeof doc._id === "object" && doc._id !== null && "toString" in doc._id
                ? doc._id.toString()
                : String(doc._id);
            }
            return result;
          });

          if (inventoryData.length > 0 && typeof character.name === "string") {
            characterInventories[character.name] = inventoryData;
          }
        } catch (error) {
          // If collection doesn't exist or error, skip this character's inventory
          const err = normalizeError(error);
          const characterName = typeof character.name === "string" ? character.name : "unknown";
          logger.warn(
            "api/users/download-data",
            `Error fetching inventory for ${characterName}: ${err.message}`
          );
        }
      })
    );

    // Create ZIP archive
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    });

    // Type guard: ensure user is a single object, not an array
    const userDoc = Array.isArray(user) ? null : (user as UserDoc | null);

    // Prepare data for separate files
    const userData: Record<string, unknown> = {
      ...userDoc,
      _id: userDoc?._id
        ? (typeof userDoc._id === "object" && userDoc._id !== null && "toString" in userDoc._id
            ? userDoc._id.toString()
            : String(userDoc._id))
        : undefined,
    };

    const charactersData = {
      regular: characters,
      mod: modCharacters,
      total: characters.length + modCharacters.length,
    };

    const petsData = {
      data: pets,
      total: pets.length,
    };

    const mountsData = {
      data: mounts,
      total: mounts.length,
    };

    const notificationsData = {
      data: notifications,
      total: notifications.length,
      unread: notifications.filter((n) => !n.read).length,
    };

    const tokensData = {
      currentBalance: userDoc?.tokens || 0,
      transactions: tokenTransactions,
      totalTransactions: tokenTransactions.length,
    };

    const activityData = {
      messageTracking: messageTracking,
      totalDaysTracked: messageTracking.length,
    };

    const metadata = {
      exportedAt: new Date().toISOString(),
      userId: discordId,
      username: session.user?.username || "Unknown",
    };

    // Add files to ZIP
    archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });
    archive.append(JSON.stringify(userData, null, 2), { name: "user.json" });
    archive.append(JSON.stringify(charactersData, null, 2), { name: "characters.json" });
    archive.append(JSON.stringify(petsData, null, 2), { name: "pets.json" });
    archive.append(JSON.stringify(mountsData, null, 2), { name: "mounts.json" });
    archive.append(JSON.stringify(notificationsData, null, 2), { name: "notifications.json" });
    archive.append(JSON.stringify(tokensData, null, 2), { name: "tokens.json" });
    archive.append(JSON.stringify(activityData, null, 2), { name: "activity.json" });

    // Add inventory files for each character
    for (const [characterName, inventory] of Object.entries(characterInventories)) {
      const safeFileName = characterName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      archive.append(JSON.stringify(inventory, null, 2), {
        name: `inventories/${safeFileName}.json`,
      });
    }

    // Collect archive data into chunks
    const chunks: Buffer[] = [];
    
    archive.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    // Finalize the archive and wait for it to complete
    archive.finalize();

    await new Promise<void>((resolve, reject) => {
      archive.on("end", () => {
        resolve();
      });
      archive.on("error", (err) => {
        reject(err);
      });
    });

    // Combine all chunks into a single buffer
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const buffer = Buffer.concat(chunks, totalLength);

    // Generate filename with date
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `user-data-${dateStr}.zip`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (e) {
    const err = normalizeError(e);
    logger.error(
      "api/users/download-data",
      `❌ Failed to fetch user data: ${err.message}`
    );
    return NextResponse.json(
      { error: "Failed to fetch user data" },
      { status: 500 }
    );
  }
}
