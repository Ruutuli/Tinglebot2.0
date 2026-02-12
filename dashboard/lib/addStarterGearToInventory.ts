// ============================================================================
// Add equipped weapon/armor/gear to a character's inventory when they are accepted.
// Called from ocApplicationService when status → "accepted".
// ============================================================================

import mongoose from "mongoose";
import { getInventoriesDb } from "@/lib/db";
import { logger } from "@/utils/logger";

type CharacterWithGear = {
  _id: unknown;
  name: string;
  gearWeapon?: { name: string } | null;
  gearShield?: { name: string } | null;
  gearArmor?: {
    head?: { name: string } | null;
    chest?: { name: string } | null;
    legs?: { name: string } | null;
  } | null;
  [key: string]: unknown;
};

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Add the character's equipped weapon, shield, and armor to their inventory
 * (one of each). Idempotent: if they already have the item, quantity is incremented.
 */
export async function addEquippedGearToInventory(character: CharacterWithGear): Promise<void> {
  const names: string[] = [];
  if (character.gearWeapon?.name?.trim()) names.push(character.gearWeapon.name.trim());
  if (character.gearShield?.name?.trim()) names.push(character.gearShield.name.trim());
  const armor = character.gearArmor;
  if (armor?.head?.name?.trim()) names.push(armor.head.name.trim());
  if (armor?.chest?.name?.trim()) names.push(armor.chest.name.trim());
  if (armor?.legs?.name?.trim()) names.push(armor.legs.name.trim());

  if (names.length === 0) return;

  const db = await getInventoriesDb();
  const collectionName = character.name.toLowerCase();
  const collection = db.collection(collectionName);
  const charId =
    typeof character._id === "string"
      ? new mongoose.Types.ObjectId(character._id)
      : (character._id as mongoose.Types.ObjectId);

  for (const itemName of names) {
    try {
      const escaped = escapeRegExp(itemName);
      const existing = await collection.findOne({
        characterId: charId,
        itemName: { $regex: new RegExp(`^${escaped}$`, "i") },
      });

      if (existing) {
        await collection.updateOne(
          { _id: existing._id },
          { $inc: { quantity: 1 } }
        );
        logger.info(
          "addStarterGearToInventory",
          `Added 1 "${itemName}" to ${character.name} inventory (incremented)`
        );
      } else {
        await collection.insertOne({
          characterId: charId,
          itemName,
          quantity: 1,
          date: new Date(),
          obtain: "Starter gear (character approved)",
        });
        logger.info(
          "addStarterGearToInventory",
          `Added 1 "${itemName}" to ${character.name} inventory (new entry)`
        );
      }
    } catch (err) {
      logger.error(
        "addStarterGearToInventory",
        `Failed to add "${itemName}" for ${character.name}: ${err instanceof Error ? err.message : String(err)}`
      );
      // Continue with other items
    }
  }
}
