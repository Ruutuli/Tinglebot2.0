// POST /api/inventories/seed — admin-only backfill for inventory logs (and optional inventory URL migration)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { getAppUrl } from "@/lib/config";
import { createSlug } from "@/lib/string-utils";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SeedScope = "user" | "all";

type SeedBody = {
  scope?: SeedScope;
  migrateInventoryUrls?: boolean;
  dryRun?: boolean;
  limitCharacters?: number;
};

type CharacterLean = {
  _id: mongoose.Types.ObjectId;
  userId?: string;
  name: string;
  job?: string | null;
  perk?: string | null;
  currentVillage?: string | null;
  homeVillage?: string | null;
  inventory?: string | null;
};

type InventoryDoc = {
  itemName?: unknown;
  quantity?: unknown;
};

function normalizeError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function shouldMigrateLegacyInventoryUrl(value: string): boolean {
  // Example legacy format: https://tinglebot.xyz/character-inventory.html?character=Ageha
  // Also allow http or missing domain (just in case older data stored relative).
  return /character-inventory\.html\?character=/i.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: SeedBody = {};
    try {
      body = (await req.json()) as SeedBody;
    } catch {
      body = {};
    }

    const scope: SeedScope = body.scope === "all" ? "all" : "user";
    const migrateInventoryUrls = body.migrateInventoryUrls === true;
    const dryRun = body.dryRun === true;
    const limitCharacters =
      typeof body.limitCharacters === "number" && Number.isFinite(body.limitCharacters) && body.limitCharacters > 0
        ? Math.floor(body.limitCharacters)
        : null;

    await connect();

    // Import models
    const CharacterModule = await import("@/models/CharacterModel.js");
    const ModCharacterModule = await import("@/models/ModCharacterModel.js");
    const InventoryLogModule = await import("@/models/InventoryLogModel.js");

    const Character = CharacterModule.default || CharacterModule;
    const ModCharacter = ModCharacterModule.default || ModCharacterModule;
    const InventoryLog = InventoryLogModule.default || InventoryLogModule;

    const characterQuery = scope === "all" ? {} : { userId: user.id };

    const [regularChars, modChars] = (await Promise.all([
      Character.find(characterQuery)
        .select("_id userId name job perk currentVillage homeVillage inventory")
        .lean(),
      ModCharacter.find(characterQuery)
        .select("_id userId name job perk currentVillage homeVillage inventory")
        .lean(),
    ])) as unknown as [CharacterLean[], CharacterLean[]];

    const allCharacters = [
      ...regularChars.map((c) => ({ ...c, __model: "Character" as const })),
      ...modChars.map((c) => ({ ...c, __model: "ModCharacter" as const })),
    ].sort((a, b) => a.name.localeCompare(b.name));

    const charactersToProcess = limitCharacters ? allCharacters.slice(0, limitCharacters) : allCharacters;

    const inventoriesDb = await getInventoriesDb();
    const appUrl = getAppUrl().replace(/\/$/, "");

    let charactersProcessed = 0;
    let charactersFailed = 0;
    let insertedLogs = 0;
    let skippedExistingLogs = 0;
    let migratedInventoryUrls = 0;

    for (const character of charactersToProcess) {
      try {
        const collectionName = character.name.toLowerCase();
        const collection = inventoriesDb.collection(collectionName);

        const inventoryDocs = (await collection
          .find({ quantity: { $gt: 0 } })
          .project({ itemName: 1, quantity: 1 })
          .toArray()) as InventoryDoc[];

        // Aggregate inventory into unique items by lowercased name
        const inventoryByLower = new Map<string, { itemName: string; quantity: number }>();
        for (const doc of inventoryDocs) {
          const itemName = String(doc.itemName ?? "").trim();
          if (!itemName) continue;
          const quantity = Number(doc.quantity) || 0;
          if (quantity <= 0) continue;

          const key = itemName.toLowerCase();
          const existing = inventoryByLower.get(key);
          if (existing) {
            existing.quantity += quantity;
          } else {
            inventoryByLower.set(key, { itemName, quantity });
          }
        }

        if (inventoryByLower.size === 0) {
          // Still count as processed to keep the report consistent
          charactersProcessed++;
          continue;
        }

        const inventoryItems = Array.from(inventoryByLower.values());
        const inventoryItemNames = inventoryItems.map((i) => i.itemName);

        // Check which items already have at least one log entry for this character.
        // (Best-effort: assumes itemName casing matches typical InventoryLog casing.)
        const existingLogs = (await InventoryLog.find({
          characterName: character.name,
          itemName: { $in: inventoryItemNames },
        })
          .select("itemName")
          .lean()) as Array<{ itemName?: string }>;

        const existingItemLower = new Set(
          existingLogs.map((l) => String(l.itemName ?? "").toLowerCase()).filter(Boolean)
        );

        const defaultLink = `${appUrl}/characters/inventories/${createSlug(character.name)}`;

        for (const item of inventoryItems) {
          const itemLower = item.itemName.toLowerCase();
          if (existingItemLower.has(itemLower)) {
            skippedExistingLogs++;
            continue;
          }

          if (dryRun) {
            insertedLogs++;
            continue;
          }

          await InventoryLog.create({
            characterName: character.name,
            characterId: character._id,
            itemName: item.itemName,
            itemId: null,
            quantity: item.quantity,
            category: "",
            type: "",
            subtype: "",
            obtain: "Seeded",
            job: character.job || "",
            perk: character.perk || "",
            location: character.currentVillage || character.homeVillage || "",
            link: defaultLink,
            dateTime: new Date(),
            confirmedSync: "",
          });

          insertedLogs++;
        }

        if (migrateInventoryUrls) {
          const currentInventoryUrl = String(character.inventory ?? "").trim();
          if (currentInventoryUrl && shouldMigrateLegacyInventoryUrl(currentInventoryUrl)) {
            const newInventoryUrl = `${appUrl}/characters/inventories/${createSlug(character.name)}`;
            if (!dryRun) {
              const updateTarget = character.__model === "ModCharacter" ? ModCharacter : Character;
              await updateTarget.updateOne(
                { _id: character._id },
                { $set: { inventory: newInventoryUrl } }
              );
            }
            migratedInventoryUrls++;
          }
        }

        charactersProcessed++;
      } catch (err) {
        charactersFailed++;
        const error = normalizeError(err);
        logger.warn("api/inventories/seed", `Failed for character "${character.name}": ${error.message}`);
      }
    }

    logger.info(
      "api/inventories/seed",
      `Done. scope=${scope}, dryRun=${String(dryRun)}, processed=${charactersProcessed}, failed=${charactersFailed}, insertedLogs=${insertedLogs}, skippedExistingLogs=${skippedExistingLogs}, migratedInventoryUrls=${migratedInventoryUrls}`
    );

    return NextResponse.json({
      ok: true,
      scope,
      dryRun,
      limitCharacters,
      results: {
        charactersProcessed,
        charactersFailed,
        insertedLogs,
        skippedExistingLogs,
        migratedInventoryUrls,
      },
    });
  } catch (err) {
    const error = normalizeError(err);
    logger.error("api/inventories/seed", error.message);
    return NextResponse.json(
      {
        error: "Failed to seed inventory logs",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

