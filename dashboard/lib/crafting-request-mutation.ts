import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import {
  hasStaminaForCraft,
  jobCanCraftItem,
  loadCharacterUnionById,
  parseStaminaToCraft,
  userOwnsCharacterName,
} from "@/lib/crafting-request-helpers";
import type { CraftingRequestNotifyPayload } from "@/lib/craftingRequestsNotify";

export async function getCraftItemByName(itemName: string) {
  const Item = (await import("@/models/ItemModel.js")).default;
  return Item.findOne({
    itemName: itemName.trim(),
    crafting: true,
  })
    .select("itemName image craftingJobs staminaToCraft crafting")
    .lean()
    .exec();
}

type SessionUser = { id: string; global_name?: string | null; username?: string | null };

export type ValidatedCraftingRequestBody = {
  requesterCharacterName: string;
  item: NonNullable<Awaited<ReturnType<typeof getCraftItemByName>>>;
  targetMode: "open" | "specific";
  targetCharacterId: mongoose.Types.ObjectId | null;
  targetCharacterName: string;
  targetCharacterHomeVillage: string;
  targetOwnerDiscordId: string | undefined;
  providingAllMaterials: boolean;
  materialsDescription: string;
  paymentOffer: string;
  elixirDescription: string;
};

export async function validateCraftingRequestBody(
  user: SessionUser,
  body: Record<string, unknown>
): Promise<{ ok: false; res: NextResponse } | { ok: true; data: ValidatedCraftingRequestBody }> {
  const requesterCharacterName = String(body.requesterCharacterName ?? "").trim();
  const craftItemName = String(body.craftItemName ?? "").trim();
  const targetMode = body.targetMode === "specific" ? "specific" : "open";
  const targetCharacterIdRaw = body.targetCharacterId != null ? String(body.targetCharacterId) : "";
  const providingAllMaterials = Boolean(body.providingAllMaterials);
  const materialsDescription = String(body.materialsDescription ?? "").trim();
  const paymentOffer = String(body.paymentOffer ?? "").trim();
  const elixirDescription = String(body.elixirDescription ?? "").trim();

  if (!requesterCharacterName) {
    return { ok: false, res: NextResponse.json({ error: "Requester OC name is required" }, { status: 400 }) };
  }
  if (!craftItemName) {
    return { ok: false, res: NextResponse.json({ error: "Craft item name is required" }, { status: 400 }) };
  }

  const ownsOc = await userOwnsCharacterName(user.id, requesterCharacterName);
  if (!ownsOc) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Requester OC must be one of your characters" }, { status: 400 }),
    };
  }

  await connect();
  const item = await getCraftItemByName(craftItemName);
  if (!item) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Item not found or is not craftable" }, { status: 400 }),
    };
  }

  const staminaSnap = parseStaminaToCraft(item.staminaToCraft);

  let targetCharacterId: mongoose.Types.ObjectId | null = null;
  let targetCharacterName = "";
  let targetCharacterHomeVillage = "";
  let targetOwnerDiscordId: string | undefined;

  if (targetMode === "specific") {
    if (!targetCharacterIdRaw || !mongoose.Types.ObjectId.isValid(targetCharacterIdRaw)) {
      return {
        ok: false,
        res: NextResponse.json({ error: "Target character is required for a specific request" }, { status: 400 }),
      };
    }
    const target = await loadCharacterUnionById(targetCharacterIdRaw);
    if (!target) {
      return { ok: false, res: NextResponse.json({ error: "Target character not found" }, { status: 400 }) };
    }
    if (!jobCanCraftItem(item, target.job)) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: "Target character's job cannot craft this item" },
          { status: 400 }
        ),
      };
    }
    if (!hasStaminaForCraft(staminaSnap, target.currentStamina, target.isModCharacter)) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: "Target character does not have enough stamina for this recipe (base cost)" },
          { status: 400 }
        ),
      };
    }
    targetCharacterId = target._id;
    targetCharacterName = target.name;
    targetCharacterHomeVillage = target.homeVillage.trim();
    targetOwnerDiscordId = target.userId;
  }

  return {
    ok: true,
    data: {
      requesterCharacterName,
      item,
      targetMode,
      targetCharacterId,
      targetCharacterName,
      targetCharacterHomeVillage,
      targetOwnerDiscordId,
      providingAllMaterials,
      materialsDescription,
      paymentOffer,
      elixirDescription,
    },
  };
}

export function craftingRequestNotifyPayload(
  requestId: string,
  user: SessionUser,
  v: ValidatedCraftingRequestBody
): CraftingRequestNotifyPayload {
  const jobsSnap = Array.isArray(v.item.craftingJobs) ? [...v.item.craftingJobs] : [];
  const staminaSnap = parseStaminaToCraft(v.item.staminaToCraft);
  return {
    requestId,
    requesterDiscordId: user.id,
    requesterUsername: user.global_name || user.username || undefined,
    requesterCharacterName: v.requesterCharacterName,
    craftItemName: v.item.itemName,
    craftItemImage: typeof v.item.image === "string" ? v.item.image : undefined,
    craftingJobsSnapshot: jobsSnap,
    staminaToCraftSnapshot: staminaSnap,
    targetMode: v.targetMode,
    targetCharacterName: v.targetCharacterName || undefined,
    targetCharacterHomeVillage: v.targetCharacterHomeVillage || undefined,
    targetOwnerDiscordId: v.targetOwnerDiscordId,
    providingAllMaterials: v.providingAllMaterials,
    materialsDescription: v.materialsDescription,
    paymentOffer: v.paymentOffer,
    elixirDescription: v.elixirDescription,
  };
}
