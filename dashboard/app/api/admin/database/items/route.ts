// ============================================================================
// ------------------- Admin Database API -------------------
// GET /api/admin/database/items?model=Item - Fetch all items
// PUT /api/admin/database/items - Update an item by ID
// DELETE /api/admin/database/items - Delete an item by ID (body: { itemId, model })
// Admin-only access required
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect, getInventoriesConnection } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { logger } from "@/utils/logger";
import mongoose, { type Model } from "mongoose";
import { FIELD_OPTIONS } from "@/app/(dashboard)/admin/database/constants/field-options";
import { getModelConfig } from "@/app/(dashboard)/admin/database/config/model-configs";
import { fetchDiscordUsernames } from "@/lib/discord";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type ItemDoc = {
  _id: unknown;
  itemName: string;
  image?: string;
  imageType?: string;
  emoji?: string;
  itemRarity?: number;
  buyPrice?: number;
  sellPrice?: number;
  stackable?: boolean;
  maxStackSize?: number;
  modifierHearts?: number;
  staminaRecovered?: number;
  set: (data: Record<string, unknown>) => void;
  save: () => Promise<unknown>;
  toObject: () => Record<string, unknown>;
};

type ItemLean = {
  _id: unknown;
  itemName: string;
  image?: string;
  imageType?: string;
  emoji?: string;
  itemRarity?: number;
  buyPrice?: number;
  sellPrice?: number;
  stackable?: boolean;
  maxStackSize?: number;
  modifierHearts?: number;
  staminaRecovered?: number;
  // All other ItemModel fields (will be typed as unknown for now)
  [key: string]: unknown;
};

// ============================================================================
// ------------------- GET Handler -------------------
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    // ------------------- Check Authentication -------------------
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ------------------- Check Admin Access -------------------
    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin) {
      logger.warn(
        "api/admin/database/items GET",
        `Access denied for user ${user.id} (${user.username}): not admin`
      );
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    // ------------------- Get Model Parameter -------------------
    const params = req.nextUrl.searchParams;
    const modelName = params.get("model") || "Item"; // Default to Item

    // ------------------- Connect to Database -------------------
    await connect();

    // ------------------- Get Model Configuration -------------------
    const modelConfig = getModelConfig(modelName);
    if (!modelConfig) {
      return NextResponse.json(
        { error: "Invalid model", message: `Model "${modelName}" is not supported` },
        { status: 400 }
      );
    }

    // ------------------- Inventory: two-level (characters list, then character's items) -------------------
    if (modelName === "Inventory") {
      const characterIdParam = params.get("characterId")?.trim() || null;
      const convert = (obj: unknown): unknown => {
        if (obj instanceof Map) return Object.fromEntries(obj);
        if (Array.isArray(obj)) return obj.map(convert);
        if (obj !== null && typeof obj === "object" && typeof (obj as { toString?: () => string }).toString === "function") {
          const str = (obj as { toString: () => string }).toString();
          if (str && /^[a-fA-F0-9]{24}$/.test(str)) return str;
        }
        if (obj !== null && typeof obj === "object") {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(obj)) out[k] = convert(v);
          return out;
        }
        return obj;
      };

      if (!characterIdParam) {
        // Return list of characters (from main DB) so user can pick one
        let CharacterModel: Model<unknown>;
        if (mongoose.models.Character) {
          CharacterModel = mongoose.models.Character;
        } else {
          const { default: CharModel } = await import("@/models/CharacterModel.js");
          CharacterModel = CharModel as unknown as Model<unknown>;
        }
        const characters = (await CharacterModel.find({})
          .sort({ name: 1 })
          .select("_id name userId race homeVillage job")
          .lean()) as unknown as ItemLean[];
        const convertedChars = characters.map(convert) as unknown as ItemLean[];
        logger.info("api/admin/database/items GET", `Fetched ${convertedChars.length} characters for Inventory picker`);
        return NextResponse.json({
          characters: convertedChars,
          items: [],
          filterOptions: {},
          meta: { model: "Inventory", mode: "characters", totalFetched: convertedChars.length },
        });
      }

      // Return inventory items for the selected character (inventories DB)
      // Bot uses one collection per character: collection name = character.name.toLowerCase()
      let CharacterModel: Model<unknown>;
      if (mongoose.models.Character) {
        CharacterModel = mongoose.models.Character;
      } else {
        const { default: CharModel } = await import("@/models/CharacterModel.js");
        CharacterModel = CharModel as unknown as Model<unknown>;
      }
      const character = await CharacterModel.findById(characterIdParam).select("name").lean();
      const characterName = character && typeof character === "object" ? (character as unknown as { name?: string }).name : null;
      if (!characterName) {
        return NextResponse.json(
          { error: "Character not found", message: "No character found with that ID" },
          { status: 404 }
        );
      }
      const collectionName = characterName.toLowerCase();

      const conn = await getInventoriesConnection();
      const db = conn.useDb("inventories");
      const collection = db.collection(collectionName);
      const rawRecords = await collection.find({}).sort({ itemName: 1 }).toArray();
      const records = rawRecords as unknown as ItemLean[];
      const convertedRecords = records.map(convert) as unknown as ItemLean[];

      const filterOptionsInv: Record<string, (string | number)[]> = {};
      const categorySet = new Set<string>();
      const typeSet = new Set<string>();
      convertedRecords.forEach((record) => {
        const r = record as { category?: string; type?: string };
        if (r.category) categorySet.add(r.category);
        if (r.type) typeSet.add(r.type);
      });
      filterOptionsInv.category = Array.from(categorySet).sort();
      filterOptionsInv.type = Array.from(typeSet).sort();

      logger.info("api/admin/database/items GET", `Fetched ${convertedRecords.length} inventory items for character ${characterIdParam} (collection: ${collectionName})`);
      return NextResponse.json({
        items: convertedRecords,
        filterOptions: filterOptionsInv,
        meta: { model: "Inventory", characterId: characterIdParam, totalFetched: convertedRecords.length },
      });
    }

    // ------------------- Get Model -------------------
    let Model: Model<unknown>;
    const sortField = modelConfig.sortField;

    if (modelName === "Item") {
      if (mongoose.models.Item) {
        Model = mongoose.models.Item;
      } else {
        const { default: ItemModel } = await import("@/models/ItemModel.js");
        Model = ItemModel as unknown as Model<unknown>;
      }
    } else if (modelName === "Monster") {
      if (mongoose.models.Monster) {
        Model = mongoose.models.Monster;
      } else {
        const { default: MonsterModel } = await import("@/models/MonsterModel.js");
        Model = MonsterModel as unknown as Model<unknown>;
      }
    } else if (modelName === "Pet") {
      if (mongoose.models.Pet) {
        Model = mongoose.models.Pet;
      } else {
        const { default: PetModel } = await import("@/models/PetModel.js");
        Model = PetModel as unknown as Model<unknown>;
      }
    } else if (modelName === "Character") {
      if (mongoose.models.Character) {
        Model = mongoose.models.Character;
      } else {
        const { default: CharacterModel } = await import("@/models/CharacterModel.js");
        Model = CharacterModel as unknown as Model<unknown>;
      }
    } else if (modelName === "Village") {
      if (mongoose.models.Village) {
        Model = mongoose.models.Village;
      } else {
        const { Village } = await import("@/models/VillageModel.js");
        Model = Village as unknown as Model<unknown>;
      }
    } else if (modelName === "ExploringMap") {
      if (mongoose.models.Square) {
        Model = mongoose.models.Square;
      } else {
        const mapModel = await import("@/models/mapModel.js");
        Model = (mapModel.default || mapModel) as unknown as Model<unknown>;
      }
    } else if (modelName === "User") {
      if (mongoose.models.User) {
        Model = mongoose.models.User;
      } else {
        const { default: UserModel } = await import("@/models/UserModel.js");
        Model = UserModel as unknown as Model<unknown>;
      }
    } else if (modelName === "Quest") {
      if (mongoose.models.Quest) {
        Model = mongoose.models.Quest;
      } else {
        const QuestModel = await import("@/models/QuestModel.js");
        Model = (QuestModel.default ?? QuestModel) as unknown as Model<unknown>;
      }
    } else if (modelName === "Relic") {
      if (mongoose.models.Relic) {
        Model = mongoose.models.Relic;
      } else {
        const { default: RelicModel } = await import("@/models/RelicModel.js");
        Model = RelicModel as unknown as Model<unknown>;
      }
    } else {
      return NextResponse.json(
        { error: "Invalid model", message: `Model "${modelName}" is not supported` },
        { status: 400 }
      );
    }

    // ------------------- Optional: Fetch Single Item by Name (Item model only) -------------------
    const itemNameParam = params.get("itemName");
    if (modelName === "Item" && itemNameParam && itemNameParam.trim()) {
      const nameField = modelConfig.nameField;
      const singleRecord = (await Model.findOne({ [nameField]: itemNameParam.trim() }).lean()) as ItemLean | null;
      if (!singleRecord) {
        return NextResponse.json(
          { error: "Item not found", message: `No item found with name "${itemNameParam.trim()}"` },
          { status: 404 }
        );
      }
      const convertMapsToObjects = (obj: unknown): unknown => {
        if (obj instanceof Map) return Object.fromEntries(obj);
        if (obj instanceof Date) return Number.isFinite((obj as Date).getTime()) ? (obj as Date).toISOString() : null;
        if (Array.isArray(obj)) return obj.map(convertMapsToObjects);
        // Preserve Mongoose/BSON ObjectId as string so _id is not turned into an empty object
        if (obj !== null && typeof obj === "object" && typeof (obj as { toString?: () => string }).toString === "function") {
          const str = (obj as { toString: () => string }).toString();
          if (str && /^[a-fA-F0-9]{24}$/.test(str)) return str;
        }
        if (obj !== null && typeof obj === "object") {
          const converted: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(obj)) {
            converted[key] = convertMapsToObjects(value);
          }
          return converted;
        }
        return obj;
      };
      const converted = convertMapsToObjects(singleRecord) as ItemLean;
      logger.info("api/admin/database/items GET", `Fetched single Item by name: ${itemNameParam.trim()}`);
      return NextResponse.json({ item: converted });
    }

    // ------------------- Fetch All Records -------------------
    // Fetch all records sorted by itemName for consistency
    const records = (await Model.find({})
      .sort({ [sortField]: 1 })
      .lean()) as unknown as ItemLean[];

    // Convert Map objects to plain objects for JSON serialization.
    // Preserve Mongoose/BSON ObjectId as string; preserve Date as ISO string (so not turned into {}).
    const convertMapsToObjects = (obj: unknown): unknown => {
      if (obj instanceof Map) {
        return Object.fromEntries(obj);
      }
      if (obj instanceof Date) {
        return Number.isFinite((obj as Date).getTime()) ? (obj as Date).toISOString() : null;
      }
      if (Array.isArray(obj)) {
        return obj.map(convertMapsToObjects);
      }
      if (obj !== null && typeof obj === "object" && typeof (obj as { toString?: () => string }).toString === "function") {
        const str = (obj as { toString: () => string }).toString();
        if (str && /^[a-fA-F0-9]{24}$/.test(str)) return str;
      }
      if (obj !== null && typeof obj === "object") {
        const converted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          converted[key] = convertMapsToObjects(value);
        }
        return converted;
      }
      return obj;
    };

    const convertedRecords = records.map(convertMapsToObjects) as unknown as ItemLean[];

    // ------------------- User model: fill missing usernames from Discord and persist -------------------
    if (modelName === "User") {
      const needsUsername = (convertedRecords as Array<{ discordId?: string; username?: string }>).filter(
        (u) => u.discordId && (!u.username || String(u.username).trim() === "")
      );
      const discordIdsToFetch = needsUsername.map((u) => String(u.discordId!));
      if (discordIdsToFetch.length > 0) {
        try {
          const usernameMap = await fetchDiscordUsernames(discordIdsToFetch);
          for (const record of convertedRecords as Array<Record<string, unknown>>) {
            const discordId = record.discordId;
            const currentUsername = record.username;
            if (
              typeof discordId === "string" &&
              discordId &&
              (!currentUsername || String(currentUsername).trim() === "") &&
              usernameMap[discordId]
            ) {
              const name = usernameMap[discordId];
              record.username = name;
              await Model.updateOne(
                { discordId },
                { $set: { username: name } }
              ).exec();
            }
          }
          if (Object.keys(usernameMap).length > 0) {
            logger.info(
              "api/admin/database/items GET",
              `Filled ${Object.keys(usernameMap).length} missing usernames from Discord for User model`
            );
          }
        } catch (e) {
          logger.warn(
            "api/admin/database/items GET",
            `Failed to fetch Discord usernames: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }

    logger.info(
      "api/admin/database/items GET",
      `Fetched ${convertedRecords.length} ${modelName} records`
    );

    // ------------------- Build Filter Options -------------------
    const filterOptions: Record<string, (string | number)[]> = {};

    if (modelName === "Item") {
      // Extract unique values from convertedRecords for dynamic filters
      const raritySet = new Set<number>();
      convertedRecords.forEach((record) => {
        if (typeof (record as { itemRarity?: number }).itemRarity === "number" && !Number.isNaN((record as { itemRarity?: number }).itemRarity)) {
          raritySet.add((record as { itemRarity?: number }).itemRarity!);
        }
      });
      const rarityOpts = Array.from(raritySet).sort((a, b) => a - b);

      filterOptions.category = FIELD_OPTIONS.category;
      filterOptions.type = FIELD_OPTIONS.type;
      filterOptions.categoryGear = FIELD_OPTIONS.categoryGear;
      filterOptions.subtype = FIELD_OPTIONS.subtype;
      filterOptions.rarity = rarityOpts;
      filterOptions.source = ["Gathering", "Looting", "Traveling", "Exploring", "Vending", "Crafting", "Special Weather", "Pet Perk"];
      filterOptions.location = [
        "Central Hyrule",
        "Eldin",
        "Faron",
        "Gerudo",
        "Hebra",
        "Lanayru",
        "Path of Scarlet Leaves",
        "Leaf Dew Way",
      ];
      filterOptions.job = [
        "Farmer",
        "Forager",
        "Rancher",
        "Herbalist",
        "Adventurer",
        "Artist",
        "Beekeeper",
        "Blacksmith",
        "Cook",
        "Craftsman",
        "Fisherman",
        "Gravekeeper",
        "Guard",
        "Mask Maker",
        "Hunter",
        "Hunter (Looting)",
        "Mercenary",
        "Miner",
        "Researcher",
        "Scout",
        "Weaver",
        "Witch",
      ];
      filterOptions.craftable = ["true", "false"];
      filterOptions.stackable = ["true", "false"];
    } else if (modelName === "Monster") {
      // Extract distinct values for Monster filters
      const speciesSet = new Set<string>();
      const typeSet = new Set<string>();
      const tierSet = new Set<number>();
      
      convertedRecords.forEach((record) => {
        const r = record as { species?: string; type?: string; tier?: number };
        if (r.species) speciesSet.add(r.species);
        if (r.type) typeSet.add(r.type);
        if (typeof r.tier === "number" && !Number.isNaN(r.tier)) tierSet.add(r.tier);
      });

      filterOptions.species = Array.from(speciesSet).sort();
      filterOptions.type = Array.from(typeSet).sort();
      filterOptions.tier = Array.from(tierSet).sort((a, b) => a - b);
    } else if (modelName === "Pet") {
      // Extract distinct values for Pet filters
      const statusSet = new Set<string>();
      const speciesSet = new Set<string>();
      const petTypeSet = new Set<string>();
      
      convertedRecords.forEach((record) => {
        const r = record as { status?: string; species?: string; petType?: string };
        if (r.status) statusSet.add(r.status);
        if (r.species) speciesSet.add(r.species);
        if (r.petType) petTypeSet.add(r.petType);
      });

      filterOptions.status = Array.from(statusSet).sort();
      filterOptions.species = Array.from(speciesSet).sort();
      filterOptions.petType = Array.from(petTypeSet).sort();
    } else if (modelName === "Character") {
      // Extract distinct values for Character filters
      const raceSet = new Set<string>();
      const villageSet = new Set<string>();
      const jobSet = new Set<string>();
      
      convertedRecords.forEach((record) => {
        const r = record as { race?: string; homeVillage?: string; currentVillage?: string; job?: string };
        if (r.race) raceSet.add(r.race);
        if (r.homeVillage) villageSet.add(r.homeVillage);
        if (r.currentVillage) villageSet.add(r.currentVillage);
        if (r.job) jobSet.add(r.job);
      });

      filterOptions.race = Array.from(raceSet).sort();
      filterOptions.village = Array.from(villageSet).sort();
      filterOptions.job = Array.from(jobSet).sort();
    } else if (modelName === "Village") {
      // Extract distinct values for Village filters
      const regionSet = new Set<string>();
      
      convertedRecords.forEach((record) => {
        const r = record as { region?: string };
        if (r.region) regionSet.add(r.region);
      });

      filterOptions.region = Array.from(regionSet).sort();
    } else if (modelName === "ExploringMap") {
      // Extract distinct values for Exploring Map filters
      const regionSet = new Set<string>();
      const statusSet = new Set<string>();

      convertedRecords.forEach((record) => {
        const r = record as { region?: string; status?: string };
        if (r.region) regionSet.add(r.region);
        if (r.status) statusSet.add(r.status);
      });

      filterOptions.region = Array.from(regionSet).sort();
      filterOptions.status = Array.from(statusSet).sort();
    } else if (modelName === "User") {
      const statusSet = new Set<string>();
      convertedRecords.forEach((record) => {
        const r = record as { status?: string };
        if (r.status) statusSet.add(r.status);
      });
      filterOptions.status = Array.from(statusSet).sort();
    } else if (modelName === "Quest") {
      const statusSet = new Set<string>();
      const questTypeSet = new Set<string>();
      convertedRecords.forEach((record) => {
        const r = record as { status?: string; questType?: string };
        if (r.status) statusSet.add(r.status);
        if (r.questType) questTypeSet.add(r.questType);
      });
      filterOptions.status = Array.from(statusSet).sort();
      filterOptions.questType = Array.from(questTypeSet).sort();
    } else if (modelName === "Relic") {
      const appraisedSet = new Set<string>();
      const archivedSet = new Set<string>();
      const discoveredBySet = new Set<string>();
      convertedRecords.forEach((record) => {
        const r = record as { appraised?: boolean; archived?: boolean; discoveredBy?: string };
        appraisedSet.add(String(!!r.appraised));
        archivedSet.add(String(!!r.archived));
        if (r.discoveredBy) discoveredBySet.add(r.discoveredBy);
      });
      filterOptions.appraised = Array.from(appraisedSet).sort();
      filterOptions.archived = Array.from(archivedSet).sort();
      filterOptions.discoveredBy = Array.from(discoveredBySet).sort();
    }

    // ------------------- Return Response -------------------
    return NextResponse.json({
      items: convertedRecords,
      filterOptions,
      meta: {
        model: modelName,
        totalFetched: convertedRecords.length,
      },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    
    logger.error(
      "api/admin/database/items GET",
      `Error: ${errorMessage}${errorStack ? `\nStack: ${errorStack}` : ""}`
    );
    
    return NextResponse.json(
      {
        error: "Failed to fetch records",
        message: errorMessage,
        details: process.env.NODE_ENV === "development" ? {
          message: errorMessage,
          stack: errorStack
        } : undefined
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// ------------------- PUT Handler -------------------
// ============================================================================

export async function PUT(req: NextRequest) {
  try {
    // ------------------- Check Authentication -------------------
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ------------------- Check Admin Access -------------------
    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin) {
      logger.warn(
        "api/admin/database/items PUT",
        `Access denied for user ${user.id} (${user.username}): not admin`
      );
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    // ------------------- Parse Request Body -------------------
    const body = await req.json().catch(() => ({}));
    const { itemId: rawItemId, updates, model: modelName, characterId: bodyCharacterId } = body as {
      itemId?: string | { $oid?: string; oid?: string };
      updates?: Record<string, unknown>;
      model?: string;
      characterId?: string;
    };

    // Normalize itemId: accept string or ObjectId-like object; reject "[object Object]"
    let itemId: string;
    if (typeof rawItemId === "string" && rawItemId) {
      itemId = rawItemId;
    } else if (rawItemId && typeof rawItemId === "object") {
      const oid = (rawItemId as { $oid?: string; oid?: string }).$oid ?? (rawItemId as { $oid?: string; oid?: string }).oid;
      if (typeof oid === "string" && oid) itemId = oid;
      else itemId = "";
    } else {
      itemId = "";
    }
    if (!itemId || itemId === "[object Object]") {
      return NextResponse.json(
        { error: "Item ID is required and must be a valid ID string" },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== "object") {
      return NextResponse.json(
        { error: "Updates object is required" },
        { status: 400 }
      );
    }

    const model = modelName || "Item";

    // ------------------- Connect to Database -------------------
    await connect();

    // ------------------- Get Model Configuration -------------------
    const modelConfig = getModelConfig(model);
    if (!modelConfig) {
      return NextResponse.json(
        { error: "Invalid model", message: `Model "${model}" is not supported` },
        { status: 400 }
      );
    }

    // ------------------- Inventory: update in per-character collection -------------------
    if (model === "Inventory") {
      const invCharacterId = bodyCharacterId && typeof bodyCharacterId === "string" ? bodyCharacterId : "";
      if (!invCharacterId) {
        return NextResponse.json(
          { error: "characterId is required for Inventory updates" },
          { status: 400 }
        );
      }
      let CharModel: Model<unknown> = mongoose.models.Character as Model<unknown>;
      if (!CharModel) {
        const { default: C } = await import("@/models/CharacterModel.js");
        CharModel = C as unknown as Model<unknown>;
      }
      const char = await CharModel.findById(invCharacterId).select("name").lean();
      const charName = char && typeof char === "object" ? (char as unknown as { name?: string }).name : null;
      if (!charName) {
        return NextResponse.json(
          { error: "Character not found", message: "No character found with that ID" },
          { status: 404 }
        );
      }
      const collectionName = charName.toLowerCase();
      const conn = await getInventoriesConnection();
      const db = conn.useDb("inventories");
      const collection = db.collection(collectionName);
      const allowedFields = [
        "characterId", "itemName", "itemId", "quantity", "category", "type", "subtype",
        "job", "perk", "location", "date", "craftedAt", "gatheredAt", "obtain", "synced", "fortuneTellerBoost",
      ];
      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (!allowedFields.includes(key)) continue;
        if (key === "characterId" || key === "itemId") {
          updateData[key] = value && typeof value === "string" && mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : value;
        } else if (key === "date" || key === "craftedAt" || key === "gatheredAt") {
          updateData[key] = value instanceof Date ? value : value ? new Date(value as string | number) : value;
        } else {
          updateData[key] = value;
        }
      }
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json(
          { error: "No valid fields to update", message: "No valid fields to update" },
          { status: 400 }
        );
      }
      const convertObj = (obj: unknown): unknown => {
        if (obj instanceof Map) return Object.fromEntries(obj);
        if (Array.isArray(obj)) return obj.map(convertObj);
        if (obj !== null && typeof obj === "object" && typeof (obj as { toString?: () => string }).toString === "function") {
          const s = (obj as { toString: () => string }).toString();
          if (s && /^[a-fA-F0-9]{24}$/.test(s)) return s;
        }
        if (obj !== null && typeof obj === "object") {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(obj)) out[k] = convertObj(v);
          return out;
        }
        return obj;
      };
      const result = await collection.findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(itemId) },
        { $set: updateData },
        { returnDocument: "after" }
      );
      if (!result) {
        return NextResponse.json(
          { error: "Record not found", message: "No inventory entry found with that ID" },
          { status: 404 }
        );
      }
      logger.info("api/admin/database/items PUT", `Updated Inventory ${itemId} in collection ${collectionName}`);
      return NextResponse.json({
        item: convertObj(result) as Record<string, unknown>,
        message: "Inventory updated successfully",
      });
    }

    // ------------------- Get Model -------------------
    let Model: Model<unknown>;
    if (model === "Item") {
      if (mongoose.models.Item) {
        Model = mongoose.models.Item;
      } else {
        const { default: ItemModel } = await import("@/models/ItemModel.js");
        Model = ItemModel as unknown as Model<unknown>;
      }
    } else if (model === "Monster") {
      if (mongoose.models.Monster) {
        Model = mongoose.models.Monster;
      } else {
        const { default: MonsterModel } = await import("@/models/MonsterModel.js");
        Model = MonsterModel as unknown as Model<unknown>;
      }
    } else if (model === "Pet") {
      if (mongoose.models.Pet) {
        Model = mongoose.models.Pet;
      } else {
        const { default: PetModel } = await import("@/models/PetModel.js");
        Model = PetModel as unknown as Model<unknown>;
      }
    } else if (model === "Character") {
      if (mongoose.models.Character) {
        Model = mongoose.models.Character;
      } else {
        const { default: CharacterModel } = await import("@/models/CharacterModel.js");
        Model = CharacterModel as unknown as Model<unknown>;
      }
    } else if (model === "Village") {
      if (mongoose.models.Village) {
        Model = mongoose.models.Village;
      } else {
        const { Village } = await import("@/models/VillageModel.js");
        Model = Village as unknown as Model<unknown>;
      }
    } else if (model === "ExploringMap") {
      if (mongoose.models.Square) {
        Model = mongoose.models.Square;
      } else {
        const mapModel = await import("@/models/mapModel.js");
        Model = (mapModel.default || mapModel) as unknown as Model<unknown>;
      }
    } else if (model === "User") {
      if (mongoose.models.User) {
        Model = mongoose.models.User;
      } else {
        const { default: UserModel } = await import("@/models/UserModel.js");
        Model = UserModel as unknown as Model<unknown>;
      }
    } else if (model === "Quest") {
      if (mongoose.models.Quest) {
        Model = mongoose.models.Quest;
      } else {
        const QuestModel = await import("@/models/QuestModel.js");
        Model = (QuestModel.default ?? QuestModel) as unknown as Model<unknown>;
      }
    } else if (model === "Relic") {
      if (mongoose.models.Relic) {
        Model = mongoose.models.Relic;
      } else {
        const { default: RelicModel } = await import("@/models/RelicModel.js");
        Model = RelicModel as unknown as Model<unknown>;
      }
    } else {
      return NextResponse.json(
        { error: "Invalid model", message: `Model "${model}" is not supported` },
        { status: 400 }
      );
    }

    // ------------------- Find Record by ID -------------------
    const record = (await Model.findById(itemId)) as ItemDoc | null;
    if (!record) {
      return NextResponse.json(
        { error: "Record not found" },
        { status: 404 }
      );
    }

    // ------------------- Update Record Fields -------------------
    // Only update fields that are provided in updates object
    // For Item model, use specific allowed fields
    // For other models, allow all fields (can be refined later)
    let allowedFields: string[] = [];
    
    if (model === "Item") {
      allowedFields = [
      // Identity & Display
      "itemName", "image", "imageType", "emoji",
      // Classification
      "itemRarity", "category", "categoryGear", "type", "subtype", "recipeTag",
      // Economics
      "buyPrice", "sellPrice",
      // Effects / Stats
      "modifierHearts", "staminaRecovered",
      // Stack Rules
      "stackable", "maxStackSize",
      // Crafting
      "craftingMaterial", "staminaToCraft", "crafting", "craftingJobs",
      // Activities & Obtain
      "gathering", "looting", "vending", "traveling", "exploring",
      "obtain", "gatheringJobs", "lootingJobs",
      // Weather
      "specialWeather",
      // Pet Perks
      "petPerk", "petperkobtain", "petprey", "petforage", "lgpetprey",
      "petmon", "petchu", "petfirechu", "peticechu", "petelectricchu",
      // Location Metadata
      "locations", "centralHyrule", "eldin", "faron", "gerudo",
      "hebra", "lanayru", "pathOfScarletLeaves", "leafDewWay", "terrain", "terrains",
      // Job Flags (all 20+ job flags)
      "adventurer", "artist", "beekeeper", "blacksmith", "cook", "craftsman",
      "farmer", "fisherman", "forager", "gravekeeper", "guard", "maskMaker",
      "rancher", "herbalist", "hunter", "hunterLooting", "mercenary", "miner",
      "researcher", "scout", "weaver", "witch",
      // Boost/Item Tags
      "allJobs", "entertainerItems", "divineItems",
      // Monsters
      "monsterList", "blackBokoblin", "blueBokoblin", "cursedBokoblin", "goldenBokoblin",
      "silverBokoblin", "bokoblin", "electricChuchuLarge", "fireChuchuLarge", "iceChuchuLarge",
      "chuchuLarge", "electricChuchuMedium", "fireChuchuMedium", "iceChuchuMedium", "chuchuMedium",
      "electricChuchuSmall", "fireChuchuSmall", "iceChuchuSmall", "chuchuSmall",
      "blackHinox", "blueHinox", "hinox", "electricKeese", "fireKeese", "iceKeese", "keese",
      "blackLizalfos", "blueLizalfos", "cursedLizalfos", "electricLizalfos", "fireBreathLizalfos",
      "goldenLizalfos", "iceBreathLizalfos", "silverLizalfos", "lizalfos",
      "blueManedLynel", "goldenLynel", "silverLynel", "whiteManedLynel", "lynel",
      "blackMoblin", "blueMoblin", "cursedMoblin", "goldenMoblin", "silverMoblin", "moblin",
      "molduga", "molduking", "forestOctorok", "rockOctorok", "skyOctorok", "snowOctorok",
      "treasureOctorok", "waterOctorok", "frostPebblit", "igneoPebblit", "stonePebblit",
      "stalizalfos", "stalkoblin", "stalmoblin", "stalnox",
      "frostTalus", "igneoTalus", "luminousTalus", "rareTalus", "stoneTalus",
      "blizzardWizzrobe", "electricWizzrobe", "fireWizzrobe", "iceWizzrobe", "meteoWizzrobe", "thunderWizzrobe",
      "likeLike", "evermean", "gibdo", "horriblin", "gloomHands", "bossBokoblin",
      "mothGibdo", "littleFrox", "yigaBlademaster", "yigaFootsoldier",
      "normalBokoblin", "normalGibdo", "normalHinox", "normalHorriblin",
      "normalKeese", "normalLizalfos", "normalLynel", "normalMoblin",
      ];
    } else if (model === "ExploringMap") {
      allowedFields = [
        "squareId", "region", "status", "image", "pathImageUrl", "quadrants",
        "mapCoordinates", "displayProperties", "createdAt", "updatedAt",
        "displayProperties.visible", "displayProperties.opacity", "displayProperties.zIndex",
        "mapCoordinates.center.lat", "mapCoordinates.center.lng",
        "mapCoordinates.bounds.north", "mapCoordinates.bounds.south",
        "mapCoordinates.bounds.east", "mapCoordinates.bounds.west",
      ];
    } else if (model === "User") {
      allowedFields = [
        "discordId", "username", "timezone", "tokens", "characterSlot", "status",
        "blightedcharacter", "statusChangedAt", "lastMessageContent", "lastMessageTimestamp",
        "introPostedAt", "googleSheetsUrl", "tokenTracker", "tokensSynced",
        "leveling.xp", "leveling.level", "leveling.totalMessages", "leveling.lastMessageTime",
        "leveling.lastExchangedLevel", "leveling.totalLevelsExchanged",
        "leveling.hasImportedFromMee6", "leveling.importedMee6Level", "leveling.mee6ImportDate",
        "quests.bot.completed", "quests.bot.pending", "quests.legacy.completed", "quests.legacy.pending",
        "quests.lastCompletionAt", "quests.turnIns.totalSetsTurnedIn", "quests.turnIns.lastTurnedInAt",
        "quests.completions",
        "helpWanted.lastCompletion", "helpWanted.cooldownUntil", "helpWanted.totalCompletions",
        "helpWanted.currentCompletions", "helpWanted.lastExchangeAt", "helpWanted.lastExchangeAmount",
        "birthday.month", "birthday.day", "birthday.lastBirthdayReward", "birthday.birthdayDiscountExpiresAt",
        "boostRewards.lastRewardMonth", "boostRewards.totalRewards",
      ];
    } else if (model === "Quest") {
      allowedFields = [
        "questID", "title", "description", "questType", "status", "location", "date", "timeLimit", "timeLimitEndDate",
        "participantCap", "minRequirements", "tableroll", "itemReward", "itemRewardQty", "itemRewards",
        "signupDeadline", "postRequirement", "specialNote", "tokenReward",
        "targetChannel", "posted", "postedAt", "botNotes", "messageID", "roleID", "guildId",
        "rpThreadParentChannel", "rpThreadId",
        "completionReason", "completedAt", "completionProcessed", "lastCompletionCheck",
        "participants", "leftParticipants",
        "collabAllowed", "collabRule", "rules", "artWritingMode",
        "tableRollName", "tableRollConfig", "requiredRolls", "rollSuccessCriteria",
        "createdByUserId", "createdByUsername", "isMemberQuest", "runByUserId", "runByUsername",
      ];
    } else if (model === "Relic") {
      allowedFields = [
        "relicId", "name", "rollOutcome", "emoji", "unique", "duplicateOf",
        "discoveredBy", "characterId", "discoveredDate", "locationFound", "region", "square", "quadrant",
        "appraised", "appraisedBy", "appraisalDate", "appraisalDeadline", "artDeadline",
        "appraisalDescription", "npcAppraisal", "appraisalRequestId",
        "artSubmitted", "imageUrl",
        "libraryPositionX", "libraryPositionY", "libraryDisplaySize",
        "archived", "deteriorated", "firstCompletionRewardGiven", "duplicateRewardGiven",
        "description", "functionality", "origins", "uses",
      ];
    } else {
      // For other models, allow all fields (can be refined per model later)
      allowedFields = Object.keys(updates);
    }

    // ------------------- Update Item Fields -------------------
    // Only update fields that are provided in updates object
    // Data integrity: Preserve special characters (<, :, etc.) and only trim where necessary
    // Arrays and objects are passed through unchanged to maintain structure
    const updateData: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        // Type validation and conversion based on field type
        // Only trim specific user-input fields that should not have leading/trailing whitespace
        if (key === "itemName" && typeof value === "string") {
          updateData[key] = value.trim();
        } else if (key === "image" && typeof value === "string") {
          updateData[key] = value.trim();
        } else if (key === "imageType" && typeof value === "string") {
          updateData[key] = value.trim();
        } else if (key === "emoji" && typeof value === "string") {
          updateData[key] = value.trim();
        } else if (key === "categoryGear" && typeof value === "string") {
          // categoryGear comes from dropdown - preserve as-is (no trimming needed)
          updateData[key] = value;
        } else if (key === "itemRarity" && typeof value === "number") {
          updateData[key] = Math.max(1, Math.min(10, value)); // Clamp between 1-10
        } else if ((key === "buyPrice" || key === "sellPrice") && typeof value === "number") {
          updateData[key] = Math.max(0, value); // No negative prices
        } else if (key === "maxStackSize" && typeof value === "number") {
          updateData[key] = Math.max(1, value); // At least 1
        } else if (key === "specialWeather" && typeof value === "object" && value !== null) {
          // Handle nested specialWeather object - preserve structure
          updateData[key] = value;
        } else if (key === "craftingMaterial" && Array.isArray(value)) {
          // Handle craftingMaterial array - preserve array structure and all special characters
          updateData[key] = value;
        } else if (Array.isArray(value)) {
          // Handle array fields (category, type, subtype, etc.) - preserve all elements and special characters
          updateData[key] = value;
        } else if (typeof value === "boolean") {
          // Handle boolean fields
          updateData[key] = value;
        } else if (key === "quests.completions" && Array.isArray(value)) {
          const normalized = value.map((entry: Record<string, unknown>) => {
            const out = { ...entry };
            const toDate = (v: unknown): Date | null => {
              if (v == null) return null;
              if (typeof v === "string") {
                const d = new Date(v);
                return Number.isFinite(d.getTime()) ? d : null;
              }
              if (v instanceof Date && Number.isFinite((v as Date).getTime())) return v as Date;
              return null;
            };
            out.completedAt = toDate(out.completedAt);
            out.rewardedAt = toDate(out.rewardedAt);
            if (Array.isArray(out.itemsEarned)) {
              out.itemsEarned = out.itemsEarned.map((i: Record<string, unknown>) => ({
                name: i.name,
                quantity: typeof i.quantity === "number" ? i.quantity : 0,
              }));
            }
            return out;
          });
          updateData[key] = normalized;
        } else if (key === "birthday.month" || key === "birthday.day") {
          // User birthday: schema allows 1–12 / 1–31 or null; store null for empty/0 so validation passes
          const n = typeof value === "number" ? value : Number(value);
          if (Number.isFinite(n) && n >= 1 && (key === "birthday.month" ? n <= 12 : n <= 31)) {
            updateData[key] = n;
          } else {
            updateData[key] = null;
          }
        } else if (typeof value === "number") {
          // Handle number fields
          updateData[key] = value;
        } else if (key === "participants" && model === "Quest" && value && typeof value === "object" && !Array.isArray(value)) {
          // Quest participants: plain object → Map; normalize nested dates
          const plain = value as Record<string, Record<string, unknown>>;
          const map = new Map<string, Record<string, unknown>>();
          const toDate = (v: unknown): Date | null => {
            if (v == null) return null;
            if (typeof v === "string") {
              const d = new Date(v);
              return Number.isFinite(d.getTime()) ? d : null;
            }
            if (v instanceof Date && Number.isFinite((v as Date).getTime())) return v as Date;
            return null;
          };
          for (const [userId, p] of Object.entries(plain)) {
            if (p && typeof p === "object") {
              const entry = { ...p } as Record<string, unknown>;
              if (entry.joinedAt !== undefined) entry.joinedAt = toDate(entry.joinedAt);
              if (entry.leftAt !== undefined) entry.leftAt = toDate(entry.leftAt);
              if (entry.completedAt !== undefined) entry.completedAt = toDate(entry.completedAt);
              if (entry.rewardedAt !== undefined) entry.rewardedAt = toDate(entry.rewardedAt);
              if (entry.voucherUsedAt !== undefined) entry.voucherUsedAt = toDate(entry.voucherUsedAt);
              if (entry.lastVillageCheck !== undefined) entry.lastVillageCheck = toDate(entry.lastVillageCheck);
              if (entry.disqualifiedAt !== undefined) entry.disqualifiedAt = toDate(entry.disqualifiedAt);
              if (entry.updatedAt !== undefined) entry.updatedAt = toDate(entry.updatedAt);
              if (entry.lastCompletionCheck !== undefined) entry.lastCompletionCheck = toDate(entry.lastCompletionCheck);
              if (Array.isArray(entry.submissions)) {
                entry.submissions = entry.submissions.map((s: Record<string, unknown>) => ({
                  ...s,
                  submittedAt: s.submittedAt != null ? toDate(s.submittedAt) : undefined,
                  approvedAt: s.approvedAt != null ? toDate(s.approvedAt) : undefined,
                }));
              }
              map.set(userId, entry);
            }
          }
          updateData[key] = map;
        } else if (typeof value === "string") {
          // Handle other string fields - preserve as-is (no trimming) to maintain special characters
          // Only itemName, image, imageType, and emoji are trimmed above
          updateData[key] = value;
        } else if (value === null || value === undefined) {
          // Allow null/undefined for optional fields
          updateData[key] = value;
        }
      }
    }

    // ------------------- Character model: sanitize values that cause validation errors -------------------
    if (model === "Character") {
      // ObjectId refs cannot be empty string; use null so Mongoose accepts "no reference"
      if (updateData.currentActivePet === "" || (typeof updateData.currentActivePet === "string" && !mongoose.Types.ObjectId.isValid(updateData.currentActivePet as string))) {
        updateData.currentActivePet = null;
      }
      if (updateData.currentActiveMount === "" || (typeof updateData.currentActiveMount === "string" && !mongoose.Types.ObjectId.isValid(updateData.currentActiveMount as string))) {
        updateData.currentActiveMount = null;
      }
      // Gear subdocuments require both name and stats. If we only have dot-path .name, merge with existing subdoc so stats is preserved.
      const recordObj = record as unknown as { get?: (path: string) => unknown };
      const getExisting = (path: string): Record<string, unknown> | null => {
        const v = recordObj.get?.(path);
        if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
        return null;
      };
      const gearPaths = [
        "gearArmor.head",
        "gearArmor.chest",
        "gearArmor.legs",
        "gearWeapon",
        "gearShield",
      ] as const;
      for (const gearPath of gearPaths) {
        const nameKey = gearPath === "gearWeapon" || gearPath === "gearShield" ? `${gearPath}.name` : `${gearPath}.name`;
        const nameValue = updateData[nameKey];
        if (nameValue === undefined) continue;
        const nameStr = typeof nameValue === "string" ? nameValue.trim() : String(nameValue ?? "").trim();
        delete (updateData as Record<string, unknown>)[nameKey];
        // GearSchema requires name to be non-empty; empty name means "no gear" so set path to null
        if (!nameStr) {
          (updateData as Record<string, unknown>)[gearPath] = null;
          continue;
        }
        const existing = getExisting(gearPath);
        const existingStats = existing?.stats;
        const statsMap =
          existingStats instanceof Map
            ? existingStats
            : existingStats && typeof existingStats === "object" && !Array.isArray(existingStats)
              ? new Map(Object.entries(existingStats as Record<string, number>))
              : new Map<string, number>();
        (updateData as Record<string, unknown>)[gearPath] = {
          name: nameStr,
          stats: statsMap,
        };
      }
    }

    // ------------------- User model: sanitize birthday so validation passes -------------------
    if (model === "User") {
      const month = (updateData as Record<string, unknown>)["birthday.month"];
      const day = (updateData as Record<string, unknown>)["birthday.day"];
      if (month !== undefined) {
        const n = typeof month === "number" ? month : Number(month);
        if (n < 1 || !Number.isFinite(n)) {
          (updateData as Record<string, unknown>)["birthday.month"] = null;
        }
      }
      if (day !== undefined) {
        const n = typeof day === "number" ? day : Number(day);
        if (n < 1 || !Number.isFinite(n)) {
          (updateData as Record<string, unknown>)["birthday.day"] = null;
        }
      }
    }

    // ------------------- Relic model: ObjectId refs must be null when empty -------------------
    if (model === "Relic") {
      const ud = updateData as Record<string, unknown>;
      if (ud.characterId === "" || (typeof ud.characterId === "string" && !mongoose.Types.ObjectId.isValid(ud.characterId))) {
        ud.characterId = null;
      } else if (typeof ud.characterId === "string" && mongoose.Types.ObjectId.isValid(ud.characterId)) {
        ud.characterId = new mongoose.Types.ObjectId(ud.characterId as string);
      }
      if (ud.duplicateOf === "" || (typeof ud.duplicateOf === "string" && !mongoose.Types.ObjectId.isValid(ud.duplicateOf))) {
        ud.duplicateOf = null;
      } else if (typeof ud.duplicateOf === "string" && mongoose.Types.ObjectId.isValid(ud.duplicateOf)) {
        ud.duplicateOf = new mongoose.Types.ObjectId(ud.duplicateOf as string);
      }
      const relicDateKeys = ["discoveredDate", "appraisalDate", "appraisalDeadline", "artDeadline"];
      for (const k of relicDateKeys) {
        if (ud[k] !== undefined && ud[k] !== null) {
          const v = ud[k];
          ud[k] = v instanceof Date ? v : new Date(v as string | number);
        }
      }
    }

    // ------------------- Monster model: prevent validation errors on save -------------------
    if (model === "Monster") {
      const ud = updateData as Record<string, unknown>;
      // Schema requires name and nameMapping; do not overwrite with empty string
      if ("name" in ud) {
        const s = typeof ud.name === "string" ? ud.name.trim() : String(ud.name ?? "").trim();
        if (s) ud.name = s; else delete ud.name;
      }
      if ("nameMapping" in ud) {
        const s = typeof ud.nameMapping === "string" ? ud.nameMapping.trim() : String(ud.nameMapping ?? "").trim();
        if (s) ud.nameMapping = s; else delete ud.nameMapping;
      }
      // Coerce number fields so Mongoose validation passes (tier, hearts, dmg)
      if ("tier" in ud) {
        const n = typeof ud.tier === "number" ? ud.tier : Number(ud.tier);
        ud.tier = Number.isFinite(n) && n >= 1 ? Math.min(10, Math.max(1, n)) : 1;
      }
      if ("hearts" in ud) {
        const n = typeof ud.hearts === "number" ? ud.hearts : Number(ud.hearts);
        ud.hearts = Number.isFinite(n) && n >= 0 ? n : 0;
      }
      if ("dmg" in ud) {
        const n = typeof ud.dmg === "number" ? ud.dmg : Number(ud.dmg);
        ud.dmg = Number.isFinite(n) && n >= 0 ? n : 0;
      }
      // Monster schema has no "element" field; omit so strict mode doesn't persist it
      if ("element" in ud) {
        delete ud.element;
      }
    }

    // ------------------- Apply Updates -------------------
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update", message: "No valid fields to update" },
        { status: 400 }
      );
    }

    record.set(updateData);
    await record.save();

    const nameField = modelConfig.nameField;
    const recordName = (record as Record<string, unknown>)[nameField] || itemId;

    const fieldCount = Object.keys(updateData).length;
    logger.info(
      "api/admin/database/items PUT",
      `Updated ${model} ${itemId} (${recordName}): ${fieldCount} field${fieldCount === 1 ? "" : "s"}`
    );

    // ------------------- Return Updated Record -------------------
    const updatedRecord = typeof record.toObject === "function"
      ? record.toObject()
      : (record as unknown as Record<string, unknown>);

    return NextResponse.json({
      item: updatedRecord,
      message: `${model} updated successfully`,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    
    logger.error(
      "api/admin/database/items PUT",
      `Error: ${errorMessage}${errorStack ? `\nStack: ${errorStack}` : ""}`
    );
    
    return NextResponse.json(
      {
        error: "Failed to update record",
        message: errorMessage,
        details: process.env.NODE_ENV === "development" ? {
          message: errorMessage,
          stack: errorStack
        } : undefined
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// ------------------- DELETE Handler -------------------
// ============================================================================

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin) {
      logger.warn("api/admin/database/items DELETE", `Access denied for user ${user.id}: not admin`);
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { itemId: rawItemId, model: modelName, characterId: bodyCharacterId } = body as {
      itemId?: string | { $oid?: string; oid?: string };
      model?: string;
      characterId?: string;
    };

    let itemId: string;
    if (typeof rawItemId === "string" && rawItemId) {
      itemId = rawItemId;
    } else if (rawItemId && typeof rawItemId === "object") {
      const oid = (rawItemId as { $oid?: string; oid?: string }).$oid ?? (rawItemId as { $oid?: string; oid?: string }).oid;
      itemId = typeof oid === "string" && oid ? oid : "";
    } else {
      itemId = "";
    }
    if (!itemId || itemId === "[object Object]") {
      return NextResponse.json(
        { error: "Item ID is required and must be a valid ID string" },
        { status: 400 }
      );
    }

    const model = modelName || "Item";
    const modelConfig = getModelConfig(model);
    if (!modelConfig) {
      return NextResponse.json(
        { error: "Invalid model", message: `Model "${model}" is not supported` },
        { status: 400 }
      );
    }

    // ------------------- Inventory: delete from per-character collection -------------------
    if (model === "Inventory") {
      const invCharacterId = bodyCharacterId && typeof bodyCharacterId === "string" ? bodyCharacterId : "";
      if (!invCharacterId) {
        return NextResponse.json(
          { error: "characterId is required for Inventory delete" },
          { status: 400 }
        );
      }
      await connect();
      let CharModel: Model<unknown> = mongoose.models.Character as Model<unknown>;
      if (!CharModel) {
        const { default: C } = await import("@/models/CharacterModel.js");
        CharModel = C as unknown as Model<unknown>;
      }
      const char = await CharModel.findById(invCharacterId).select("name").lean();
      const charName = char && typeof char === "object" ? (char as unknown as { name?: string }).name : null;
      if (!charName) {
        return NextResponse.json(
          { error: "Character not found", message: "No character found with that ID" },
          { status: 404 }
        );
      }
      const collectionName = charName.toLowerCase();
      const conn = await getInventoriesConnection();
      const db = conn.useDb("inventories");
      const collection = db.collection(collectionName);
      const deleteResult = await collection.deleteOne({ _id: new mongoose.Types.ObjectId(itemId) });
      if (deleteResult.deletedCount === 0) {
        return NextResponse.json(
          { error: "Record not found", message: "No inventory entry found with that ID" },
          { status: 404 }
        );
      }
      logger.info("api/admin/database/items DELETE", `Deleted Inventory ${itemId} from collection ${collectionName}`);
      return NextResponse.json({
        message: "Inventory entry deleted successfully",
        deletedId: itemId,
      });
    }

    await connect();

    let Model: Model<unknown>;
    if (model === "Item") {
      Model = (mongoose.models.Item ?? (await import("@/models/ItemModel.js")).default) as unknown as Model<unknown>;
    } else if (model === "Monster") {
      Model = (mongoose.models.Monster ?? (await import("@/models/MonsterModel.js")).default) as unknown as Model<unknown>;
    } else if (model === "Pet") {
      Model = (mongoose.models.Pet ?? (await import("@/models/PetModel.js")).default) as unknown as Model<unknown>;
    } else if (model === "Character") {
      Model = (mongoose.models.Character ?? (await import("@/models/CharacterModel.js")).default) as unknown as Model<unknown>;
    } else if (model === "Village") {
      const { Village } = await import("@/models/VillageModel.js");
      Model = Village as unknown as Model<unknown>;
    } else if (model === "ExploringMap") {
      if (mongoose.models.Square) {
        Model = mongoose.models.Square;
      } else {
        const mapModel = await import("@/models/mapModel.js");
        Model = (mapModel.default || mapModel) as unknown as Model<unknown>;
      }
    } else if (model === "User") {
      Model = (mongoose.models.User ?? (await import("@/models/UserModel.js")).default) as unknown as Model<unknown>;
    } else if (model === "Quest") {
      Model = (mongoose.models.Quest ?? (await import("@/models/QuestModel.js")).default) as unknown as Model<unknown>;
    } else if (model === "Relic") {
      Model = (mongoose.models.Relic ?? (await import("@/models/RelicModel.js")).default) as unknown as Model<unknown>;
    } else {
      return NextResponse.json(
        { error: "Invalid model", message: `Model "${model}" is not supported` },
        { status: 400 }
      );
    }

    const deleted = await Model.findByIdAndDelete(itemId);
    if (!deleted) {
      return NextResponse.json(
        { error: "Record not found", message: "No record found with that ID" },
        { status: 404 }
      );
    }

    logger.info("api/admin/database/items DELETE", `Deleted ${model} ${itemId}`);
    return NextResponse.json({
      message: `${model} deleted successfully`,
      deletedId: itemId,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/admin/database/items DELETE", `Error: ${errorMessage}`);
    return NextResponse.json(
      { error: "Failed to delete record", message: errorMessage },
      { status: 500 }
    );
  }
}
