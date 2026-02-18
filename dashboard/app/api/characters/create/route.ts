// ============================================================================
// ------------------- Character create -------------------
// POST /api/characters/create
// Creates character as DRAFT. If submit=true, runs submit logic in same request.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { MOD_JOBS, ALL_JOBS } from "@/data/characterData";
import { recalculateStats, normalizeGearSlots, type EquippedGear } from "@/lib/gear-equip";
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
import { submitCharacter } from "@/lib/character-submit";
import { logger } from "@/utils/logger";
import { gcsUploadService } from "@/lib/services/gcsUploadService";
import { notifyCharacterCreation } from "@/lib/services/discordPostingService";

// ------------------- Placeholder URLs (fallback if GCS not configured) -------------------
const PLACEHOLDER_ICON = "/placeholder-icon.png";
const PLACEHOLDER_APPART = "/placeholder-appart.png";

// Default starter armor so every new character has chest/legs equipped
const DEFAULT_CHEST_ARMOR = "Old Shirt";
const DEFAULT_LEGS_ARMOR = "Well-Worn Trousers";

type StarterGearItem = {
  id: string;
  name: string;
  slot: "weapon" | "shield" | "chest" | "legs";
  stats: { attack: number; defense: number };
};

function buildGearFromStarter(
  items: StarterGearItem[]
): {
  gearWeapon?: { name: string; stats: Map<string, number> };
  gearShield?: { name: string; stats: Map<string, number> };
  gearArmor?: {
    head?: { name: string; stats: Map<string, number> };
    chest?: { name: string; stats: Map<string, number> };
    legs?: { name: string; stats: Map<string, number> };
  };
} {
  const gear: {
    gearWeapon?: { name: string; stats: Map<string, number> };
    gearShield?: { name: string; stats: Map<string, number> };
    gearArmor?: {
      head?: { name: string; stats: Map<string, number> };
      chest?: { name: string; stats: Map<string, number> };
      legs?: { name: string; stats: Map<string, number> };
    };
  } = {};
  for (const it of items) {
    const stats = new Map<string, number>([
      ["attack", it.stats?.attack ?? 0],
      ["defense", it.stats?.defense ?? 0],
    ]);
    const entry = { name: it.name, stats };
    if (it.slot === "weapon") gear.gearWeapon = entry;
    else if (it.slot === "shield") gear.gearShield = entry;
    else if (it.slot === "chest") {
      gear.gearArmor = gear.gearArmor ?? {};
      gear.gearArmor.chest = entry;
    } else if (it.slot === "legs") {
      gear.gearArmor = gear.gearArmor ?? {};
      gear.gearArmor.legs = entry;
    }
  }
  return gear;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connect();
    const { default: User } = await import("@/models/UserModel.js");
    const { default: Character } = await import("@/models/CharacterModel.js");

    type UserDoc = { characterSlot: number; save: () => Promise<unknown> };
    const dbUser = (await (User as unknown as { getOrCreateUser: (id: string) => Promise<UserDoc> }).getOrCreateUser(user.id)) as UserDoc;
    if (!dbUser || (dbUser.characterSlot ?? 0) < 1) {
      return NextResponse.json(
        { error: "No character slots available" },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const get = (k: string) => {
      const v = form.get(k);
      return v == null ? undefined : (v as string | File);
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
    const submitRaw = get("submit") as string | undefined;
    const starterGearRaw = get("starterGearSelected") as string | undefined;
    const equippedGearRaw = get("equippedGear") as string | undefined;
    const iconFile = form.get("icon") as File | null;
    const appArtFile = form.get("appArt") as File | null;

    const submit = submitRaw === "true";

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
      icon: iconFile,
      appArt: appArtFile,
    };
    let res = validateRequired(obj, ["name", "pronouns", "gender", "race", "village", "job", "virtue", "personality", "history"]);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    if (!iconFile || !(iconFile instanceof File) || iconFile.size === 0) {
      return NextResponse.json(
        { error: "Icon file is required" },
        { status: 400 }
      );
    }
    if (!appArtFile || !(appArtFile instanceof File) || appArtFile.size === 0) {
      return NextResponse.json(
        { error: "App art file is required" },
        { status: 400 }
      );
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
    res = validateFileTypes([iconFile, appArtFile], [...ALLOWED_IMAGE_TYPES]);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    res = validateFileSizes([iconFile, appArtFile], MAX_FILE_BYTES);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    const [raceOpts] = await Promise.all([
      (Character as { distinct: (f: string) => Promise<string[]> }).distinct("race"),
    ]);
    const races = (raceOpts ?? []).filter(Boolean).sort();
    // Use ALL_JOBS + MOD_JOBS from static data instead of database distinct jobs
    // This ensures validation matches what the form shows (Oracle, Sage, Dragon for mod chars)
    const jobs = [...ALL_JOBS, ...MOD_JOBS].sort();
    const villages = [...VILLAGES] as string[];

    res = validateRace(race, races);
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

    // Check if character name already exists (case-insensitive)
    const trimmedName = (name as string).trim();
    const { default: ModCharacter } = await import("@/models/ModCharacterModel.js");
    const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp(`^${escapedName}$`, "i");
    
    const existingCharacter = await Character.findOne({ name: nameRegex });
    const existingModCharacter = await ModCharacter.findOne({ name: nameRegex });
    
    if (existingCharacter || existingModCharacter) {
      return NextResponse.json(
        { error: `A character with the name "${trimmedName}" already exists. Character names must be unique.` },
        { status: 400 }
      );
    }

    let starterGear: StarterGearItem[] = [];
    if (typeof starterGearRaw === "string" && starterGearRaw.trim()) {
      try {
        const parsed = JSON.parse(starterGearRaw) as unknown;
        starterGear = Array.isArray(parsed) ? parsed : [];
      } catch {
        /* ignore invalid JSON */
      }
    }

    // Build gear from starter gear (for backward compatibility)
    let gear = buildGearFromStarter(starterGear);
    
    // Override with equipped gear if provided
    if (typeof equippedGearRaw === "string" && equippedGearRaw.trim()) {
      try {
        const equippedGearData = JSON.parse(equippedGearRaw) as {
          gearWeapon?: { name: string; stats: Record<string, number> };
          gearShield?: { name: string; stats: Record<string, number> };
          gearArmor?: {
            head?: { name: string; stats: Record<string, number> };
            chest?: { name: string; stats: Record<string, number> };
            legs?: { name: string; stats: Record<string, number> };
          };
        };
        
        // Convert equipped gear to the format expected by Character model
        if (equippedGearData.gearWeapon) {
          gear.gearWeapon = {
            name: equippedGearData.gearWeapon.name,
            stats: new Map(Object.entries(equippedGearData.gearWeapon.stats)),
          };
        }
        
        if (equippedGearData.gearShield) {
          gear.gearShield = {
            name: equippedGearData.gearShield.name,
            stats: new Map(Object.entries(equippedGearData.gearShield.stats)),
          };
        }
        
        if (equippedGearData.gearArmor) {
          gear.gearArmor = {};
          if (equippedGearData.gearArmor.head) {
            gear.gearArmor.head = {
              name: equippedGearData.gearArmor.head.name,
              stats: new Map(Object.entries(equippedGearData.gearArmor.head.stats)),
            };
          }
          if (equippedGearData.gearArmor.chest) {
            gear.gearArmor.chest = {
              name: equippedGearData.gearArmor.chest.name,
              stats: new Map(Object.entries(equippedGearData.gearArmor.chest.stats)),
            };
          }
          if (equippedGearData.gearArmor.legs) {
            gear.gearArmor.legs = {
              name: equippedGearData.gearArmor.legs.name,
              stats: new Map(Object.entries(equippedGearData.gearArmor.legs.stats)),
            };
          }
        }
      } catch {
        /* ignore invalid JSON */
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

    // Ensure every new character has default chest/legs armor if missing
    if (!gear.gearArmor) gear.gearArmor = {};
    if (!gear.gearArmor.chest) {
      gear.gearArmor.chest = {
        name: DEFAULT_CHEST_ARMOR,
        stats: new Map([
          ["attack", 0],
          ["defense", 0],
        ]),
      };
    }
    if (!gear.gearArmor.legs) {
      gear.gearArmor.legs = {
        name: DEFAULT_LEGS_ARMOR,
        stats: new Map([
          ["attack", 0],
          ["defense", 0],
        ]),
      };
    }

    const hearts = (() => {
      const v = get("hearts");
      if (v == null || v === "") return DEFAULT_HEARTS;
      const n = parseInt(String(v), 10);
      return Number.isNaN(n) ? DEFAULT_HEARTS : Math.max(1, n);
    })();
    const stamina = (() => {
      const v = get("stamina");
      if (v == null || v === "") return DEFAULT_STAMINA;
      const n = parseInt(String(v), 10);
      return Number.isNaN(n) ? DEFAULT_STAMINA : Math.max(1, n);
    })();

    // Upload files to GCS if configured, otherwise use placeholders
    let iconUrl = PLACEHOLDER_ICON;
    let appArtUrl = PLACEHOLDER_APPART;
    
    if (gcsUploadService.isConfigured() && iconFile && appArtFile) {
      try {
        // Upload files to GCS (characterId will be null initially, can be updated later)
        const uploadResult = await gcsUploadService.uploadCharacterImages(
          iconFile,
          appArtFile,
          user.id,
          null // characterId is null for new characters, will be set after creation
        );
        
        iconUrl = uploadResult.icon.url;
        appArtUrl = uploadResult.appArt.url;
      } catch (uploadError) {
        logger.error(
          "api/characters/create",
          `Failed to upload files to GCS: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`
        );
        // Fall through to use placeholders if upload fails
      }
    }
    
    // Create character with GCS URLs or placeholders
    type CharDoc = {
      save: () => Promise<unknown>;
      set: (o: Record<string, unknown>) => void;
      _id: unknown;
      userId: string;
      name: string;
      gearWeapon?: { name: string; stats: Map<string, number> };
      gearShield?: { name: string; stats: Map<string, number> };
      gearArmor?: {
        head?: { name: string; stats: Map<string, number> };
        chest?: { name: string; stats: Map<string, number> };
        legs?: { name: string; stats: Map<string, number> };
      };
      attack?: number;
      defense?: number;
      status: string | null;
      submittedAt: Date | null;
      applicationVersion?: number;
      toObject: () => Record<string, unknown>;
    };
    const Char = Character as new (doc: Record<string, unknown>) => CharDoc;
    const char = new Char({
      userId: user.id,
      name: (name as string).trim(),
      age: age ? parseInt(String(age), 10) : null,
      height: height ? parseFloat(String(height)) : null,
      pronouns: (pronouns as string).trim(),
      gender: typeof gender === "string" ? gender.trim() : "",
      race: (race as string).trim(),
      homeVillage: (village as string).trim(),
      job: (job as string).trim(),
      virtue: (virtue ?? "TBA").trim().toLowerCase(),
      personality: typeof personality === "string" ? personality.trim() : "",
      history: typeof history === "string" ? history.trim() : "",
      extras: typeof extras === "string" ? extras.trim() : "",
      appLink: typeof appLink === "string" ? appLink.trim() : "",
      icon: iconUrl,
      appArt: appArtUrl,
      maxHearts: hearts,
      currentHearts: hearts,
      maxStamina: stamina,
      currentStamina: stamina,
      birthday: "",
      status: null,
      applicationVersion: 1,
      submittedAt: null,
      ...gear,
    });
    
    // Recalculate attack/defense stats from equipped gear
    recalculateStats(char);
    
    await char.save();

    // Roles are assigned only when the character is accepted via mod actions (see ocApplicationService.checkVoteThresholds).

    // Notify moderators about new character creation (non-blocking)
    try {
      await notifyCharacterCreation(char);
    } catch (notificationError) {
      // Log error but don't fail character creation if notification fails
      logger.error(
        "api/characters/create",
        `Failed to send character creation notification: ${notificationError instanceof Error ? notificationError.message : String(notificationError)}`
      );
    }

    dbUser.characterSlot = Math.max(0, (dbUser.characterSlot ?? 0) - 1);
    await dbUser.save();

    // Add gear items to character inventory
    // This includes: weapon (if selected), shield (if selected), and default armor (Old Shirt, Well-Worn Trousers)
    // All equipped gear should be in the character's inventory so they can see what they have
    try {
      const { default: Item } = await import("@/models/ItemModel.js");
      
      // Connect to inventories database (using cached connection)
      const db = await getInventoriesDb();
      const collectionName = (name as string).toLowerCase().trim();
      const collection = db.collection(collectionName);
      
      // Collect all gear items from the character (includes defaults if auto-added)
      // Use char.gear* to ensure we get whatever gear the character actually has, including auto-added defaults
      const gearItems: Array<{ name: string }> = [];
      if (char.gearWeapon) gearItems.push({ name: char.gearWeapon.name });
      if (char.gearShield) gearItems.push({ name: char.gearShield.name });
      if (char.gearArmor?.head) gearItems.push({ name: char.gearArmor.head.name });
      if (char.gearArmor?.chest) gearItems.push({ name: char.gearArmor.chest.name });
      if (char.gearArmor?.legs) gearItems.push({ name: char.gearArmor.legs.name });
      
      // Add each gear item to inventory
      for (const gearItem of gearItems) {
        try {
          // Find the item in the Item collection to get its ID
          const itemDoc = await Item.findOne({ 
            itemName: { $regex: new RegExp(`^${gearItem.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } 
          }).lean();
          
          if (itemDoc) {
            const itemId = (itemDoc as { _id: unknown })._id;
            const characterId = (char as { _id: unknown })._id;
            const escapedItemName = gearItem.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            
            // Check if item already exists in inventory
            const existingItem = await collection.findOne({
              itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") },
              characterId: characterId
            });
            
            if (existingItem) {
              // Item exists, increment quantity
              await collection.updateOne(
                { 
                  itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") },
                  characterId: characterId
                },
                { $inc: { quantity: 1 } }
              );
            } else {
              // Item doesn't exist, insert it
              const itemCategory = (itemDoc as { category?: unknown }).category;
              const itemType = (itemDoc as { type?: unknown }).type;
              const itemSubtype = (itemDoc as { subtype?: unknown }).subtype;
              
              await collection.insertOne({
                characterId: characterId,
                itemName: gearItem.name,
                itemId: itemId,
                quantity: 1,
                category: Array.isArray(itemCategory) 
                  ? itemCategory[0] 
                  : (typeof itemCategory === "string" ? itemCategory : undefined),
                type: Array.isArray(itemType)
                  ? itemType[0]
                  : (typeof itemType === "string" ? itemType : undefined),
                subtype: Array.isArray(itemSubtype)
                  ? itemSubtype[0]
                  : (typeof itemSubtype === "string" ? itemSubtype : undefined),
                obtain: "starter gear",
                date: new Date(),
              });
            }
          } else {
            logger.warn(
              "api/characters/create",
              `Item "${gearItem.name}" not found in Item collection, skipping inventory addition`
            );
          }
        } catch (itemError) {
          logger.error(
            "api/characters/create",
            `Failed to add gear item "${gearItem.name}" to inventory: ${itemError instanceof Error ? itemError.message : String(itemError)}`
          );
          // Continue with other items even if one fails
        }
      }
    } catch (inventoryError) {
      // Log error but don't fail character creation if inventory addition fails
      logger.error(
        "api/characters/create",
        `Failed to add gear items to inventory: ${inventoryError instanceof Error ? inventoryError.message : String(inventoryError)}`
      );
    }

    if (submit) {
      await submitCharacter(char as unknown as Parameters<typeof submitCharacter>[0]);
    }

    const out = typeof char.toObject === "function" ? char.toObject() : (char as unknown as Record<string, unknown>);
    return NextResponse.json({ character: out }, { status: 201 });
  } catch (e) {
    logger.error(
      "api/characters/create",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to create character" },
      { status: 500 }
    );
  }
}
