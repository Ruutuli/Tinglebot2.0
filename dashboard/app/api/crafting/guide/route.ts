// ============================================================================
// ------------------- GET /api/crafting/guide -------------------
// ============================================================================
// Get craftable items for a character or all characters combined
// Query params:
//   - characterName (optional): Character name for single-character mode
//   - mode (optional): "single" or "all" (default: "single" if characterName provided, "all" otherwise)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";
import { generalCategories } from "@/lib/general-item-categories";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type CraftingMaterial = {
  itemName: string;
  quantity: number;
  emoji?: string;
};

type CraftableItem = {
  itemName: string;
  emoji?: string;
  category?: string | string[];
  staminaToCraft?: number;
  allJobs?: string[];
  craftingMaterial: CraftingMaterial[];
  canCraft: boolean;
  missingMaterials?: Array<{ itemName: string; required: number; owned: number }>;
  hasEnoughStamina?: boolean;
  charactersWithMaterials?: string[]; // For all-characters mode
  image?: string;
};

type ItemDocument = {
  itemName?: string;
  emoji?: string;
  category?: string | string[];
  staminaToCraft?: number;
  allJobs?: string[];
  craftingMaterial?: CraftingMaterial[];
  cook?: boolean;
  blacksmith?: boolean;
  craftsman?: boolean;
  maskMaker?: boolean;
  researcher?: boolean;
  weaver?: boolean;
  artist?: boolean;
  witch?: boolean;
  image?: string;
  [key: string]: unknown;
};

type CharacterDoc = {
  _id: mongoose.Types.ObjectId;
  name: string;
  currentStamina?: number;
  job?: string;
};

type InventoryItem = {
  itemName: string;
  quantity: number;
};

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

function normalizeError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// Check if a material requirement is met
function checkMaterialAvailability(
  material: CraftingMaterial,
  inventory: InventoryItem[],
  generalCategories: Record<string, string[]>
): { owned: number; hasEnough: boolean } {
  const requiredQty = material.quantity;
  let ownedQty = 0;

  // Check if it's a general category (e.g., "Any Fish", "Any Fruit")
  if (generalCategories[material.itemName]) {
    const categoryItems = generalCategories[material.itemName];
    ownedQty = inventory
      .filter((invItem) => categoryItems.includes(invItem.itemName))
      .reduce((sum, inv) => sum + inv.quantity, 0);
  } else {
    // Check specific item (case-insensitive)
    ownedQty = inventory
      .filter(
        (invItem) => invItem.itemName.toLowerCase() === material.itemName.toLowerCase()
      )
      .reduce((sum, inv) => sum + inv.quantity, 0);
  }

  return {
    owned: ownedQty,
    hasEnough: ownedQty >= requiredQty,
  };
}

// Get job fields that can craft an item
function getCraftingJobs(item: {
  allJobs?: string[];
  cook?: boolean;
  blacksmith?: boolean;
  craftsman?: boolean;
  maskMaker?: boolean;
  researcher?: boolean;
  weaver?: boolean;
  artist?: boolean;
  witch?: boolean;
}): string[] {
  const jobs: string[] = [];

  if (item.allJobs && Array.isArray(item.allJobs)) {
    jobs.push(...item.allJobs);
  }

  const jobFieldMap: Record<string, string> = {
    cook: "Cook",
    blacksmith: "Blacksmith",
    craftsman: "Craftsman",
    maskMaker: "Mask Maker",
    researcher: "Researcher",
    weaver: "Weaver",
    artist: "Artist",
    witch: "Witch",
  };

  for (const [field, jobName] of Object.entries(jobFieldMap)) {
    if (item[field as keyof typeof item] === true) {
      jobs.push(jobName);
    }
  }

  return [...new Set(jobs)]; // Remove duplicates
}

// Check if character can craft item (single character mode)
function canCharacterCraftItem(
  item: {
    craftingMaterial: CraftingMaterial[];
    staminaToCraft?: number;
  },
  inventory: InventoryItem[],
  characterStamina: number,
  generalCategories: Record<string, string[]>
): {
  canCraft: boolean;
  missingMaterials: Array<{ itemName: string; required: number; owned: number }>;
  hasEnoughStamina: boolean;
} {
  const missingMaterials: Array<{ itemName: string; required: number; owned: number }> = [];
  let canCraft = true;

  // Check materials
  for (const material of item.craftingMaterial) {
    const { owned, hasEnough } = checkMaterialAvailability(material, inventory, generalCategories);
    if (!hasEnough) {
      canCraft = false;
      missingMaterials.push({
        itemName: material.itemName,
        required: material.quantity,
        owned,
      });
    }
  }

  // Check stamina
  const staminaRequired = item.staminaToCraft || 0;
  const hasEnoughStamina = characterStamina >= staminaRequired;

  if (!hasEnoughStamina) {
    canCraft = false;
  }

  return {
    canCraft: canCraft && hasEnoughStamina,
    missingMaterials,
    hasEnoughStamina,
  };
}

// Check if item can be crafted across all characters (all-characters mode)
function canCraftAcrossAllCharacters(
  item: {
    craftingMaterial: CraftingMaterial[];
  },
  allInventories: Map<string, InventoryItem[]>,
  generalCategories: Record<string, string[]>
): {
  canCraft: boolean;
  missingMaterials: Array<{ itemName: string; required: number; owned: number }>;
  charactersWithMaterials: string[];
} {
  const missingMaterials: Array<{ itemName: string; required: number; owned: number }> = [];
  const charactersWithMaterials: string[] = [];
  let canCraft = true;

  // Aggregate all materials across all characters
  const aggregatedInventory: InventoryItem[] = [];
  const itemMap = new Map<string, number>();

  for (const [characterName, inventory] of allInventories.entries()) {
    for (const invItem of inventory) {
      const key = invItem.itemName.toLowerCase();
      const existing = itemMap.get(key) || 0;
      itemMap.set(key, existing + invItem.quantity);
    }
  }

  // Convert map back to array
  for (const [itemName, quantity] of itemMap.entries()) {
    // Find original item name (preserve casing)
    let originalName = itemName;
    for (const [, inventory] of allInventories.entries()) {
      const found = inventory.find((inv) => inv.itemName.toLowerCase() === itemName);
      if (found) {
        originalName = found.itemName;
        break;
      }
    }
    aggregatedInventory.push({ itemName: originalName, quantity });
  }

  // Check materials
  for (const material of item.craftingMaterial) {
    const { owned, hasEnough } = checkMaterialAvailability(
      material,
      aggregatedInventory,
      generalCategories
    );
    if (!hasEnough) {
      canCraft = false;
      missingMaterials.push({
        itemName: material.itemName,
        required: material.quantity,
        owned,
      });
    } else {
      // Find which characters have this material
      for (const [characterName, inventory] of allInventories.entries()) {
        const check = checkMaterialAvailability(material, inventory, generalCategories);
        if (check.owned > 0 && !charactersWithMaterials.includes(characterName)) {
          charactersWithMaterials.push(characterName);
        }
      }
    }
  }

  return {
    canCraft,
    missingMaterials,
    charactersWithMaterials,
  };
}

// ============================================================================
// ------------------- API Route Handler -------------------
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    const isAuthenticated = !!user?.id;

    await connect();

    // Parse query parameters
    const params = req.nextUrl.searchParams;
    const characterName = params.get("characterName");
    const mode = params.get("mode") || (characterName ? "single" : isAuthenticated ? "all" : "public");

    // Load character models
    let Character, ModCharacter;
    try {
      const CharacterModule = await import("@/models/CharacterModel.js");
      const ModCharacterModule = await import("@/models/ModCharacterModel.js");
      Character = CharacterModule.default || CharacterModule;
      ModCharacter = ModCharacterModule.default || ModCharacterModule;
    } catch (importError) {
      const error = normalizeError(importError);
      logger.error("[crafting/guide/route.ts] ❌ Failed to import character models:", error.message);
      return NextResponse.json(
        { error: "Failed to load character models" },
        { status: 500 }
      );
    }

    // Load Item model
    let Item: mongoose.Model<unknown>;
    if (mongoose.models.Item) {
      Item = mongoose.models.Item;
    } else {
      const { default: ItemModel } = await import("@/models/ItemModel.js");
      Item = ItemModel as unknown as mongoose.Model<unknown>;
    }

    // Get all craftable items
    const craftableItems = await Item.find({
      crafting: true,
      craftingMaterial: { $exists: true, $ne: [] },
    })
      .select("itemName emoji category staminaToCraft allJobs craftingMaterial cook blacksmith craftsman maskMaker researcher weaver artist witch image")
      .lean() as ItemDocument[];

    // Public mode: return all recipes without checking inventory
    if (mode === "public" || !isAuthenticated) {
      const results: CraftableItem[] = craftableItems.map((item) => ({
        itemName: String(item.itemName || ""),
        emoji: item.emoji ? String(item.emoji) : undefined,
        category: item.category,
        staminaToCraft: item.staminaToCraft,
        allJobs: getCraftingJobs(item),
        craftingMaterial: (item.craftingMaterial || []) as CraftingMaterial[],
        canCraft: false, // Not checked in public mode
        image: item.image ? String(item.image) : undefined,
      }));

      // Sort results by category and name
      results.sort((a, b) => {
        const categoryA = Array.isArray(a.category) ? a.category[0] : a.category || "";
        const categoryB = Array.isArray(b.category) ? b.category[0] : b.category || "";
        if (categoryA !== categoryB) {
          return categoryA.localeCompare(categoryB);
        }
        return a.itemName.localeCompare(b.itemName);
      });

      const response = NextResponse.json({
        data: results,
        mode: "public",
        characterName: null,
      });
      response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
      return response;
    }

    // Authenticated mode: check what user can craft
    // Get user's characters
    const [regularChars, modChars] = await Promise.all([
      Character.find({ userId: user.id })
        .select("_id name currentStamina job")
        .lean<CharacterDoc[]>(),
      ModCharacter.find({ userId: user.id })
        .select("_id name currentStamina job")
        .lean<CharacterDoc[]>(),
    ]);

    const allCharacters: CharacterDoc[] = [...regularChars, ...modChars];

    if (allCharacters.length === 0) {
      return NextResponse.json({
        data: [],
        message: "No characters found",
      });
    }

    // Connect to inventories database
    const db = await getInventoriesDb();

    const results: CraftableItem[] = [];

    if (mode === "single" && characterName) {
      // Single character mode
      const character = allCharacters.find(
        (c) => c.name.toLowerCase() === characterName.toLowerCase()
      );

      if (!character) {
        return NextResponse.json(
          { error: `Character "${characterName}" not found` },
          { status: 404 }
        );
      }

      // Get character's inventory
      const collectionName = character.name.toLowerCase();
      const collection = db.collection(collectionName);
      const inventoryItems = await collection.find().toArray();
      const inventory: InventoryItem[] = inventoryItems.map((item) => ({
        itemName: String(item.itemName || ""),
        quantity: Number(item.quantity) || 0,
      }));

      const characterStamina = character.currentStamina || 0;

      // Check each craftable item
      for (const item of craftableItems) {
        const craftingMaterial = (item.craftingMaterial || []) as CraftingMaterial[];
        const { canCraft, missingMaterials, hasEnoughStamina } = canCharacterCraftItem(
          {
            craftingMaterial,
            staminaToCraft: item.staminaToCraft,
          },
          inventory,
          characterStamina,
          generalCategories
        );

        if (canCraft) {
          results.push({
            itemName: String(item.itemName || ""),
            emoji: item.emoji ? String(item.emoji) : undefined,
            category: item.category,
            staminaToCraft: item.staminaToCraft,
            allJobs: getCraftingJobs(item),
            craftingMaterial,
            canCraft: true,
            hasEnoughStamina: true,
            image: item.image ? String(item.image) : undefined,
          });
        }
      }
    } else {
      // All characters mode - aggregate inventories
      const allInventories = new Map<string, InventoryItem[]>();

      for (const character of allCharacters) {
        try {
          const collectionName = character.name.toLowerCase();
          const collection = db.collection(collectionName);
          const inventoryItems = await collection.find().toArray();
          const inventory: InventoryItem[] = inventoryItems.map((item) => ({
            itemName: String(item.itemName || ""),
            quantity: Number(item.quantity) || 0,
          }));
          allInventories.set(character.name, inventory);
        } catch (error) {
          const err = normalizeError(error);
          logger.warn(
            "[crafting/guide/route.ts]",
            `⚠️ Error processing inventory for ${character.name}: ${err.message}`
          );
        }
      }

      // Check each craftable item
      for (const item of craftableItems) {
        const craftingMaterial = (item.craftingMaterial || []) as CraftingMaterial[];
        const { canCraft, missingMaterials, charactersWithMaterials } =
          canCraftAcrossAllCharacters(
            { craftingMaterial },
            allInventories,
            generalCategories
          );

        if (canCraft) {
          results.push({
            itemName: String(item.itemName || ""),
            emoji: item.emoji ? String(item.emoji) : undefined,
            category: item.category,
            staminaToCraft: item.staminaToCraft,
            allJobs: getCraftingJobs(item),
            craftingMaterial,
            canCraft: true,
            charactersWithMaterials,
            image: item.image ? String(item.image) : undefined,
          });
        }
      }
    }

    // Sort results by category and name
    results.sort((a, b) => {
      const categoryA = Array.isArray(a.category) ? a.category[0] : a.category || "";
      const categoryB = Array.isArray(b.category) ? b.category[0] : b.category || "";
      if (categoryA !== categoryB) {
        return categoryA.localeCompare(categoryB);
      }
      return a.itemName.localeCompare(b.itemName);
    });

    const response = NextResponse.json({
      data: results,
      mode: mode === "public" ? "public" : mode,
      characterName: mode === "single" ? characterName : null,
      isAuthenticated,
    });
    response.headers.set("Cache-Control", "private, s-maxage=120, stale-while-revalidate=300");
    return response;
  } catch (err) {
    const error = normalizeError(err);
    logger.error("[crafting/guide/route.ts] ❌ Failed to fetch craftable items:", error.message);
    return NextResponse.json(
      {
        error: "Failed to fetch craftable items",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
