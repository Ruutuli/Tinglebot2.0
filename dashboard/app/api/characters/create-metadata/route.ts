// ============================================================================
// ------------------- Create metadata (bootstrap) -------------------
// GET /api/characters/create-metadata
// Returns races, jobs, villages, starterGear in one request for character form.
// ============================================================================

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { VILLAGES } from "@/lib/character-validation";
import { logger } from "@/utils/logger";
import { getSession, isAdminUser } from "@/lib/session";
import { RACES, ALL_JOBS, JOB_PERKS, STARTER_GEAR_NAMES, MOD_JOBS } from "@/data/characterData";
import { getWeaponType, isShield, getArmorSlot } from "@/lib/gear-equip";
import mongoose from "mongoose";

export type StarterGearOption = {
  id: string;
  name: string;
  slot: "weapon" | "shield" | "chest" | "legs";
  stats: { attack: number; defense: number };
};

export type GearItemOption = {
  id: string;
  name: string;
  slot: "weapon" | "shield" | "head" | "chest" | "legs";
  modifierHearts: number;
  categoryGear?: string;
  type?: string[];
  subtype?: string[];
};

export type RaceOption = { name: string; value: string };

export type CreateMetadataResponse = {
  races: RaceOption[];
  jobs: string[];
  jobsByVillage: Record<string, string[]>; // Jobs organized by village
  villages: string[];
  starterGear: StarterGearOption[];
  gearItems: {
    weapons: GearItemOption[];
    shields: GearItemOption[];
    headArmor: GearItemOption[];
    chestArmor: GearItemOption[];
    legsArmor: GearItemOption[];
  };
};

// ------------------- Map item to starter gear slot -------------------
// Check shield before weapon so mis-categorized items (e.g. category Weapon but subtype Shield) get slot "shield".
function slotFromItem(
  categoryGear: string,
  type: string[] | undefined,
  subtype: string[] | undefined
): StarterGearOption["slot"] | null {
  const c = (categoryGear || "").toLowerCase();
  const types = (type || []).map((t) => String(t).toLowerCase());
  const sub = (subtype || []).map((s) => String(s).toLowerCase());
  if (c === "shield" || sub.some((s) => s.includes("shield"))) return "shield";
  if (c === "weapon") return "weapon";
  if (c === "armor") {
    // Armor slot from type array (e.g. Chest, Legs, Head) so Old Shirt / Well-Worn Trousers map correctly
    if (types.some((t) => t === "chest")) return "chest";
    if (types.some((t) => t === "legs")) return "legs";
    // head is not in StarterGearOption.slot; head armor is excluded from starter gear
    if (sub.some((s) => s.includes("chest") || s.includes("body"))) return "chest";
    if (sub.some((s) => s.includes("leg") || s.includes("foot") || s.includes("ankle")))
      return "legs";
  }
  return null;
}

export async function GET() {
  try {
    await connect();
    
    // Get Item model - check if already compiled to avoid recompilation error
    let Item: mongoose.Model<unknown>;
    if (mongoose.models.Item) {
      Item = mongoose.models.Item;
    } else {
      const { default: ItemModel } = await import("@/models/ItemModel.js");
      Item = ItemModel as unknown as mongoose.Model<unknown>;
    }
    
    // Check if user is admin
    const session = await getSession();
    const user = session.user ?? null;
    const isAdmin = user ? await isAdminUser(user.id) : false;

    // Use static data for races and jobs (name for display, value for form state/API)
    const races = RACES.map((r) => ({ name: r.name, value: r.value })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    // Filter out mod jobs for non-admins
    const availableJobs = isAdmin 
      ? [...ALL_JOBS] 
      : ALL_JOBS.filter(job => !MOD_JOBS.includes(job as typeof MOD_JOBS[number]));
    const jobs = [...availableJobs].sort();
    
    // Organize jobs by village
    const jobsByVillage: Record<string, string[]> = {};
    const generalJobs: string[] = [];
    
    // Get general jobs (jobs with village: null), excluding mod jobs for non-admins
    for (const perk of JOB_PERKS) {
      if (perk.village === null && !generalJobs.includes(perk.job)) {
        // Skip mod jobs for non-admins
        if (!isAdmin && MOD_JOBS.includes(perk.job as typeof MOD_JOBS[number])) {
          continue;
        }
        generalJobs.push(perk.job);
      }
    }
    
    // Initialize all villages with general jobs
    for (const village of VILLAGES) {
      jobsByVillage[village] = [...generalJobs];
    }
    
    // Add village-specific jobs (excluding mod jobs for non-admins)
    for (const perk of JOB_PERKS) {
      if (perk.village && jobsByVillage[perk.village]) {
        // Skip mod jobs for non-admins
        if (!isAdmin && MOD_JOBS.includes(perk.job as typeof MOD_JOBS[number])) {
          continue;
        }
        if (!jobsByVillage[perk.village].includes(perk.job)) {
          jobsByVillage[perk.village].push(perk.job);
        }
      }
    }
    
    // Sort jobs within each village
    for (const village of VILLAGES) {
      jobsByVillage[village].sort();
    }

    type ItemGearDoc = {
      _id: mongoose.Types.ObjectId;
      itemName?: string;
      categoryGear?: string;
      type?: string[];
      subtype?: string[];
      modifierHearts?: number;
    };
    const [starterItems, allWeapons, allShields, allArmor] = await Promise.all([
      Item.find({
        itemName: { $in: [...STARTER_GEAR_NAMES] },
      })
        .select("_id itemName categoryGear type subtype modifierHearts")
        .lean<ItemGearDoc[]>()
        .exec(),
      Item.find({
        categoryGear: "Weapon",
      })
        .select("_id itemName categoryGear type subtype modifierHearts")
        .lean<ItemGearDoc[]>()
        .exec(),
      Item.find({
        $or: [
          { categoryGear: "Shield" },
          { subtype: { $regex: /shield/i } }
        ]
      })
        .select("_id itemName categoryGear type subtype modifierHearts")
        .lean<ItemGearDoc[]>()
        .exec(),
      Item.find({
        categoryGear: "Armor",
      })
        .select("_id itemName categoryGear type subtype modifierHearts")
        .lean<ItemGearDoc[]>()
        .exec(),
    ]);

    const starterGear: StarterGearOption[] = [];
    const seen = new Set<string>();
    for (const it of starterItems as Array<{
      _id: unknown;
      itemName?: string;
      categoryGear?: string;
      type?: string[];
      subtype?: string[];
      modifierHearts?: number;
    }>) {
      const id = String(it._id);
      const slot = slotFromItem(it.categoryGear || "", it.type, it.subtype);
      if (!slot || seen.has(`${slot}:${id}`)) continue;
      seen.add(`${slot}:${id}`);
      starterGear.push({
        id,
        name: it.itemName || "Unknown",
        slot,
        stats: { attack: it.modifierHearts || 0, defense: it.modifierHearts || 0 },
      });
    }

    // Process all gear items
    const weapons: GearItemOption[] = [];
    const shields: GearItemOption[] = [];
    const headArmor: GearItemOption[] = [];
    const chestArmor: GearItemOption[] = [];
    const legsArmor: GearItemOption[] = [];

    for (const it of allWeapons as Array<{
      _id: unknown;
      itemName?: string;
      categoryGear?: string;
      type?: string[];
      subtype?: string[];
      modifierHearts?: number;
    }>) {
      const id = String(it._id);
      const itemData = {
        _id: it._id,
        itemName: it.itemName,
        categoryGear: it.categoryGear,
        type: it.type,
        subtype: it.subtype,
        modifierHearts: it.modifierHearts,
      };
      const weaponType = getWeaponType(itemData);
      if (weaponType && !isShield(itemData)) {
        weapons.push({
          id,
          name: it.itemName || "Unknown",
          slot: "weapon",
          modifierHearts: it.modifierHearts || 0,
          categoryGear: it.categoryGear,
          type: it.type,
          subtype: it.subtype,
        });
      }
    }

    for (const it of allShields as Array<{
      _id: unknown;
      itemName?: string;
      categoryGear?: string;
      type?: string[];
      subtype?: string[];
      modifierHearts?: number;
    }>) {
      if (isShield({
        _id: it._id,
        itemName: it.itemName,
        categoryGear: it.categoryGear,
        type: it.type,
        subtype: it.subtype,
        modifierHearts: it.modifierHearts,
      })) {
        const id = String(it._id);
        shields.push({
          id,
          name: it.itemName || "Unknown",
          slot: "shield",
          modifierHearts: it.modifierHearts || 0,
          categoryGear: it.categoryGear,
          type: it.type,
          subtype: it.subtype,
        });
      }
    }

    for (const it of allArmor as Array<{
      _id: unknown;
      itemName?: string;
      categoryGear?: string;
      type?: string[];
      subtype?: string[];
      modifierHearts?: number;
    }>) {
      const slot = getArmorSlot({
        _id: it._id,
        itemName: it.itemName,
        categoryGear: it.categoryGear,
        type: it.type,
        subtype: it.subtype,
        modifierHearts: it.modifierHearts,
      });
      if (slot) {
        const id = String(it._id);
        const gearItem: GearItemOption = {
          id,
          name: it.itemName || "Unknown",
          slot,
          modifierHearts: it.modifierHearts || 0,
          categoryGear: it.categoryGear,
          type: it.type,
          subtype: it.subtype,
        };
        if (slot === "head") headArmor.push(gearItem);
        else if (slot === "chest") chestArmor.push(gearItem);
        else if (slot === "legs") legsArmor.push(gearItem);
      }
    }

    // Sort all gear by name
    weapons.sort((a, b) => a.name.localeCompare(b.name));
    shields.sort((a, b) => a.name.localeCompare(b.name));
    headArmor.sort((a, b) => a.name.localeCompare(b.name));
    chestArmor.sort((a, b) => a.name.localeCompare(b.name));
    legsArmor.sort((a, b) => a.name.localeCompare(b.name));

    const body: CreateMetadataResponse = {
      races,
      jobs: jobs.length ? jobs : [],
      jobsByVillage: jobsByVillage,
      villages: [...VILLAGES] as string[],
      starterGear,
      gearItems: {
        weapons,
        shields,
        headArmor,
        chestArmor,
        legsArmor,
      },
    };

    return NextResponse.json(body);
  } catch (e) {
    logger.error(
      "api/characters/create-metadata",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to fetch create metadata" },
      { status: 500 }
    );
  }
}
