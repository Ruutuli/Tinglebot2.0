// ============================================================================
// ------------------- GET /api/reference/jobs/[job] -------------------
// Returns job detail + gatherable items grouped by village and by region.
// ============================================================================

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getJobBySlug } from "@/data/jobsReference";
import mongoose, { type Model } from "mongoose";

export const dynamic = "force-dynamic";

/** Item model region field → display name (order matches tabs). */
const REGION_FIELDS: { field: string; label: string }[] = [
  { field: "centralHyrule", label: "Central Hyrule" },
  { field: "eldin", label: "Eldin" },
  { field: "faron", label: "Faron" },
  { field: "gerudo", label: "Gerudo" },
  { field: "hebra", label: "Hebra" },
  { field: "lanayru", label: "Lanayru" },
  { field: "pathOfScarletLeaves", label: "Path of Scarlet Leaves" },
  { field: "leafDewWay", label: "Leaf Dew Way" },
];

/** Job name (display) → Item model field name(s). Hunter has two. */
const JOB_TO_ITEM_FIELDS: Record<string, string[]> = {
  Adventurer: ["adventurer"],
  Artist: ["artist"],
  Beekeeper: ["beekeeper"],
  Blacksmith: ["blacksmith"],
  Cook: ["cook"],
  Craftsman: ["craftsman"],
  Farmer: ["farmer"],
  Fisherman: ["fisherman"],
  Forager: ["forager"],
  Graveskeeper: ["gravekeeper"],
  Guard: ["guard"],
  Herbalist: ["herbalist"],
  Hunter: ["hunter", "hunterLooting"],
  "Mask Maker": ["maskMaker"],
  Mercenary: ["mercenary"],
  Miner: ["miner"],
  Rancher: ["rancher"],
  Researcher: ["researcher"],
  Scout: ["scout"],
  Weaver: ["weaver"],
  Witch: ["witch"],
};

/** Looting jobs: Job name → Monster model boolean field(s). */
const JOB_TO_MONSTER_FIELDS: Record<string, string[]> = {
  Adventurer: ["adventurer"],
  Graveskeeper: ["graveskeeper"],
  Guard: ["guard"],
  Hunter: ["hunter"],
  Mercenary: ["mercenary"],
  Scout: ["scout"],
};

type GatherableItem = {
  _id: string;
  itemName: string;
  emoji?: string;
  image?: string;
  category?: string | string[];
  itemRarity?: number;
};

type MonsterSummary = {
  _id: string;
  name: string;
  image?: string;
};

type ItemDoc = GatherableItem & Record<string, unknown>;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  try {
    const { job: slug } = await params;
    const jobRef = getJobBySlug(slug);
    if (!jobRef) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const fieldNames = JOB_TO_ITEM_FIELDS[jobRef.name];
    const monsterFieldNames = JOB_TO_MONSTER_FIELDS[jobRef.name];
    const emptyVillage: Record<string, GatherableItem[]> = {};
    for (const v of jobRef.villages) {
      emptyVillage[v] = [];
    }
    const emptyRegion: Record<string, GatherableItem[]> = {};
    for (const { label } of REGION_FIELDS) {
      emptyRegion[label] = [];
    }
    const emptyMonsterRegion: Record<string, MonsterSummary[]> = {};
    for (const { label } of REGION_FIELDS) {
      emptyMonsterRegion[label] = [];
    }

    const hasGathering = jobRef.perk.includes("GATHERING") && fieldNames && fieldNames.length > 0;
    const hasCrafting = jobRef.perk.includes("CRAFTING") && fieldNames && fieldNames.length > 0;
    const hasMonsters = monsterFieldNames && monsterFieldNames.length > 0;
    if (!hasGathering && !hasCrafting && !hasMonsters) {
      return NextResponse.json({
        job: jobRef,
        gatherableByVillage: emptyVillage,
        gatherableByRegion: emptyRegion,
        craftableItems: [],
        monstersByRegion: emptyMonsterRegion,
      });
    }

    await connect();

    let gatherableByVillage: Record<string, GatherableItem[]> = { ...emptyVillage };
    let gatherableByRegion: Record<string, GatherableItem[]> = { ...emptyRegion };
    let craftableItems: GatherableItem[] = [];

    if (hasGathering && fieldNames) {
      let Item: Model<unknown>;
      if (mongoose.models.Item) {
        Item = mongoose.models.Item;
      } else {
        const { default: ItemModel } = await import("@/models/ItemModel.js");
        Item = ItemModel as unknown as Model<unknown>;
      }

      const orConditions: Record<string, unknown>[] = [];
      for (const field of fieldNames) {
        orConditions.push({ [field]: true });
        orConditions.push({ gatheringJobs: field });
        orConditions.push({ lootingJobs: field });
      }

      const projection: Record<string, 1> = {
        itemName: 1,
        emoji: 1,
        image: 1,
        category: 1,
        itemRarity: 1,
      };
      for (const { field } of REGION_FIELDS) {
        projection[field] = 1;
      }

      const items = (await Item.find({ $or: orConditions }, projection)
        .sort({ itemName: 1 })
        .lean()) as unknown[];

      const gatherableList: ItemDoc[] = items.map((doc: unknown) => {
        const d = doc as Record<string, unknown>;
        const imageRaw = d.image != null ? String(d.image) : undefined;
        const image = imageRaw && imageRaw !== "No Image" ? imageRaw : undefined;
        return {
          _id: String(d._id),
          itemName: String(d.itemName ?? ""),
          emoji: d.emoji != null ? String(d.emoji) : undefined,
          image,
          category: d.category as string | string[] | undefined,
          itemRarity: d.itemRarity as number | undefined,
          ...Object.fromEntries(
            REGION_FIELDS.map(({ field }) => [field, d[field]])
          ),
        } as ItemDoc;
      });

      const pickItemFields = (item: ItemDoc): GatherableItem => ({
        _id: item._id,
        itemName: item.itemName,
        emoji: item.emoji,
        image: item.image,
        category: item.category,
        itemRarity: item.itemRarity,
      });

      gatherableByVillage = {};
      for (const v of jobRef.villages) {
        gatherableByVillage[v] = gatherableList.map(pickItemFields);
      }
      gatherableByRegion = {};
      for (const { field, label } of REGION_FIELDS) {
        gatherableByRegion[label] = gatherableList
          .filter((item) => item[field] === true)
          .map(pickItemFields);
      }
    }

    if (hasCrafting && fieldNames) {
      let Item: Model<unknown>;
      if (mongoose.models.Item) {
        Item = mongoose.models.Item;
      } else {
        const { default: ItemModel } = await import("@/models/ItemModel.js");
        Item = ItemModel as unknown as Model<unknown>;
      }

      const craftOrConditions: Record<string, unknown>[] = [
        ...fieldNames.map((field) => ({ [field]: true })),
        { craftingJobs: jobRef.name },
      ];
      const craftProjection: Record<string, 1> = {
        itemName: 1,
        emoji: 1,
        image: 1,
        category: 1,
        itemRarity: 1,
      };

      const craftDocs = (await Item.find({ $or: craftOrConditions }, craftProjection)
        .sort({ itemName: 1 })
        .lean()) as unknown[];

      craftableItems = craftDocs.map((doc: unknown) => {
        const d = doc as Record<string, unknown>;
        const imageRaw = d.image != null ? String(d.image) : undefined;
        const image = imageRaw && imageRaw !== "No Image" ? imageRaw : undefined;
        return {
          _id: String(d._id),
          itemName: String(d.itemName ?? ""),
          emoji: d.emoji != null ? String(d.emoji) : undefined,
          image,
          category: d.category as string | string[] | undefined,
          itemRarity: d.itemRarity as number | undefined,
        };
      });
    }

    let monstersByRegion: Record<string, MonsterSummary[]> = { ...emptyMonsterRegion };
    if (hasMonsters && monsterFieldNames) {
      const MonsterModule = await import("@/models/MonsterModel.js");
      const Monster = (mongoose.models.Monster ?? MonsterModule.default) as Model<unknown>;
      const monsterMapping = MonsterModule.monsterMapping as Record<string, { image?: string }> | undefined;

      const monsterOrConditions: Record<string, unknown>[] = monsterFieldNames.map(
        (field) => ({ [field]: true })
      );
      const monsterProjection: Record<string, 1> = { name: 1, nameMapping: 1, image: 1 };
      for (const { field } of REGION_FIELDS) {
        monsterProjection[field] = 1;
      }

      const monsters = (await Monster.find(
        { $or: monsterOrConditions },
        monsterProjection
      )
        .sort({ name: 1 })
        .lean()) as unknown[];

      type MonsterDoc = MonsterSummary & Record<string, unknown>;
      const monsterList: MonsterDoc[] = monsters.map((doc: unknown) => {
        const d = doc as Record<string, unknown>;
        const imageRaw = d.image != null ? String(d.image) : undefined;
        const dbImage = imageRaw && imageRaw !== "No Image" ? imageRaw : undefined;
        const mappingKey = (d.nameMapping != null ? String(d.nameMapping) : "").replace(/\s+/g, "");
        const mappedImage = mappingKey ? monsterMapping?.[mappingKey]?.image : undefined;
        const image = dbImage ?? mappedImage ?? undefined;
        return {
          _id: String(d._id),
          name: String(d.name ?? ""),
          image,
          ...Object.fromEntries(
            REGION_FIELDS.map(({ field }) => [field, d[field]])
          ),
        } as MonsterDoc;
      });

      monstersByRegion = {};
      for (const { field, label } of REGION_FIELDS) {
        monstersByRegion[label] = monsterList
          .filter((m) => m[field] === true)
          .map((m) => ({ _id: m._id, name: m.name, image: m.image }));
      }
    }

    return NextResponse.json({
      job: jobRef,
      gatherableByVillage,
      gatherableByRegion,
      craftableItems,
      monstersByRegion,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load job" },
      { status: 500 }
    );
  }
}
