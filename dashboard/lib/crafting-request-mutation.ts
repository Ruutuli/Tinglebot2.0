import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import {
  hasStaminaForCraft,
  jobCanCraftItem,
  loadCharacterIconForOwner,
  loadCharacterUnionById,
  loadCharacterUnionForOwnerByName,
  parseStaminaToCraft,
  workshopCommissionVillagesCompatible,
  type ItemCraftFields,
  userOwnsCharacterName,
} from "@/lib/crafting-request-helpers";
import type { CraftingRequestNotifyPayload } from "@/lib/craftingRequestsNotify";
import { isMixerOutputElixirName } from "@/lib/elixir-catalog";
import {
  validateElixirMaterialSelectionsForCommission,
  type ElixirMaterialSelection,
} from "@/lib/elixir-commission-materials";
import {
  evaluateRecipeMaterialsOnInventory,
  formatMissingMaterialsMessage,
} from "@/lib/craft-recipe-material-check";

export type CraftItemLean = ItemCraftFields & {
  itemName: string;
  image?: string;
  crafting?: boolean;
  _id: mongoose.Types.ObjectId;
  craftingMaterial?: Array<{ itemName: string; quantity: number }>;
};

export async function getCraftItemByName(itemName: string): Promise<CraftItemLean | null> {
  const Item = (await import("@/models/ItemModel.js")).default;
  const doc = await Item.findOne({
    itemName: itemName.trim(),
    crafting: true,
  })
    .select("itemName image craftingJobs staminaToCraft crafting craftingMaterial")
    .lean()
    .exec();
  if (doc == null) return null;
  return doc as unknown as CraftItemLean;
}

type SessionUser = { id: string; global_name?: string | null; username?: string | null };

export type ValidatedCraftingRequestBody = {
  requesterCharacterName: string;
  item: CraftItemLean;
  targetMode: "open" | "specific";
  targetCharacterId: mongoose.Types.ObjectId | null;
  targetCharacterName: string;
  targetCharacterHomeVillage: string;
  targetOwnerDiscordId: string | undefined;
  providingAllMaterials: boolean;
  materialsDescription: string;
  paymentOffer: string;
  /** 1–3 when item is a mixer elixir; null otherwise */
  elixirTier: number | null;
  /** Mixer elixir only — commissioner inventory stack picks */
  elixirMaterialSelections: ElixirMaterialSelection[];
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

  const requester = await loadCharacterUnionForOwnerByName(user.id, requesterCharacterName);
  if (!requester) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Requester character could not be loaded" }, { status: 400 }),
    };
  }

  const recipeMatEval = await evaluateRecipeMaterialsOnInventory(
    user.id,
    requesterCharacterName,
    item.craftingMaterial
  );
  if (!recipeMatEval.ok) {
    return {
      ok: false,
      res: NextResponse.json({ error: recipeMatEval.error }, { status: 400 }),
    };
  }
  if (recipeMatEval.hasRecipe && !recipeMatEval.allMaterialsMet) {
    const detail = formatMissingMaterialsMessage(recipeMatEval.lines);
    return {
      ok: false,
      res: NextResponse.json(
        {
          error: `Your character must have every recipe material on hand before you can post this commission. Missing: ${detail}`,
        },
        { status: 400 }
      ),
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
    if (
      !jobCanCraftItem(item, target.job, {
        jobVoucher: target.jobVoucher,
        jobVoucherJob: target.jobVoucherJob,
      })
    ) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: "Target character's job cannot craft this item" },
          { status: 400 }
        ),
      };
    }
    if (!hasStaminaForCraft(staminaSnap, target.maxStamina, target.isModCharacter)) {
      return {
        ok: false,
        res: NextResponse.json(
          {
            error:
              "Target character's max stamina is below this recipe's base cost (named crafter must be able to afford it at full stamina)",
          },
          { status: 400 }
        ),
      };
    }
    const villageCheck = workshopCommissionVillagesCompatible(
      { name: requester.name, currentVillage: requester.currentVillage },
      { name: target.name, currentVillage: target.currentVillage }
    );
    if (!villageCheck.ok) {
      return { ok: false, res: NextResponse.json({ error: villageCheck.error }, { status: 400 }) };
    }
    targetCharacterId = target._id;
    targetCharacterName = target.name;
    targetCharacterHomeVillage = target.homeVillage.trim();
    targetOwnerDiscordId = target.userId;
  }

  let elixirTier: number | null = null;
  let elixirMaterialSelections: ElixirMaterialSelection[] = [];

  if (isMixerOutputElixirName(item.itemName)) {
    const t = Number(body.elixirTier);
    if (t === 2 || t === 3) elixirTier = t;
    else elixirTier = 1;

    const rawMats = Array.isArray(item.craftingMaterial) ? item.craftingMaterial : [];
    const elixirVal = await validateElixirMaterialSelectionsForCommission(
      user.id,
      requesterCharacterName,
      rawMats as Array<{ itemName: string; quantity: number }>,
      body.elixirMaterialSelections,
      item.itemName
    );
    if (!elixirVal.ok) {
      return { ok: false, res: NextResponse.json({ error: elixirVal.error }, { status: 400 }) };
    }
    elixirMaterialSelections = elixirVal.selections;
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
      elixirTier,
      elixirMaterialSelections,
    },
  };
}

export function craftingRequestNotifyPayload(
  requestId: string,
  user: SessionUser,
  v: ValidatedCraftingRequestBody,
  commissionID?: string | null
): CraftingRequestNotifyPayload {
  const jobsSnap = Array.isArray(v.item.craftingJobs) ? [...v.item.craftingJobs] : [];
  const staminaSnap = parseStaminaToCraft(v.item.staminaToCraft);
  const rawMats = Array.isArray(v.item.craftingMaterial) ? v.item.craftingMaterial : [];
  const recipeMaterials = rawMats
    .map((m) => ({
      itemName: String(m.itemName ?? "").trim(),
      quantity: Number(m.quantity),
    }))
    .filter((m) => m.itemName && Number.isFinite(m.quantity) && m.quantity > 0);
  const cid = commissionID?.trim() || undefined;
  return {
    requestId,
    commissionID: cid,
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
    recipeMaterials,
    materialsDescription: v.materialsDescription,
    paymentOffer: v.paymentOffer,
    elixirTier: v.elixirTier,
  };
}

/** Loads OC portrait URLs for Discord embed author/footer (public URLs only). */
export async function craftingRequestNotifyPayloadForDiscord(
  requestId: string,
  user: SessionUser,
  v: ValidatedCraftingRequestBody,
  commissionID?: string | null
): Promise<CraftingRequestNotifyPayload> {
  const base = craftingRequestNotifyPayload(requestId, user, v, commissionID);
  const [requesterCharacterIcon, targetUnion] = await Promise.all([
    loadCharacterIconForOwner(user.id, v.requesterCharacterName),
    v.targetCharacterId
      ? loadCharacterUnionById(v.targetCharacterId.toString())
      : Promise.resolve(null),
  ]);
  return {
    ...base,
    requesterCharacterIcon,
    targetCharacterIcon: targetUnion?.icon,
  };
}
