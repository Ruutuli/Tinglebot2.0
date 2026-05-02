import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";
import {
  hasStaminaForCraft,
  jobCanCraftItem,
  loadCharacterUnionById,
  parseStaminaToCraft,
  userOwnsCharacterName,
} from "@/lib/crafting-request-helpers";
import { notifyCraftingRequestCreated } from "@/lib/craftingRequestsNotify";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

async function getItemByName(itemName: string) {
  const Item = (await import("@/models/ItemModel.js")).default;
  return Item.findOne({
    itemName: itemName.trim(),
    crafting: true,
  })
    .select("itemName craftingJobs staminaToCraft crafting")
    .lean()
    .exec();
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    const user = session.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const mine = url.searchParams.get("mine") === "1" || url.searchParams.get("mine") === "true";
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    );
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const skip = (page - 1) * limit;

    await connect();
    const CraftingRequest = (await import("@/models/CraftingRequestModel.js")).default;

    const filter: Record<string, unknown> = {};
    if (mine) {
      filter.$or = [
        { requesterDiscordId: user.id },
        { acceptedByUserId: user.id },
      ];
    } else {
      filter.status = "open";
    }

    const [rows, total] = await Promise.all([
      CraftingRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CraftingRequest.countDocuments(filter),
    ]);

    return NextResponse.json({
      requests: rows,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error("[api/crafting-requests GET]", err);
    return NextResponse.json({ error: "Failed to list crafting requests" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const user = session.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const requesterCharacterName = String(body.requesterCharacterName ?? "").trim();
    const craftItemName = String(body.craftItemName ?? "").trim();
    const targetMode = body.targetMode === "specific" ? "specific" : "open";
    const targetCharacterIdRaw = body.targetCharacterId != null ? String(body.targetCharacterId) : "";
    const providingAllMaterials = Boolean(body.providingAllMaterials);
    const materialsDescription = String(body.materialsDescription ?? "").trim();
    const paymentOffer = String(body.paymentOffer ?? "").trim();
    const elixirDescription = String(body.elixirDescription ?? "").trim();
    const boostNotes = String(body.boostNotes ?? "").trim();

    if (!requesterCharacterName) {
      return NextResponse.json({ error: "Requester OC name is required" }, { status: 400 });
    }
    if (!craftItemName) {
      return NextResponse.json({ error: "Craft item name is required" }, { status: 400 });
    }

    const ownsOc = await userOwnsCharacterName(user.id, requesterCharacterName);
    if (!ownsOc) {
      return NextResponse.json(
        { error: "Requester OC must be one of your characters" },
        { status: 400 }
      );
    }

    await connect();
    const item = await getItemByName(craftItemName);
    if (!item) {
      return NextResponse.json(
        { error: "Item not found or is not craftable" },
        { status: 400 }
      );
    }

    const staminaSnap = parseStaminaToCraft(item.staminaToCraft);
    const jobsSnap = Array.isArray(item.craftingJobs) ? [...item.craftingJobs] : [];

    let targetCharacterId: mongoose.Types.ObjectId | null = null;
    let targetCharacterName = "";
    let targetOwnerDiscordId: string | undefined;

    if (targetMode === "specific") {
      if (!targetCharacterIdRaw || !mongoose.Types.ObjectId.isValid(targetCharacterIdRaw)) {
        return NextResponse.json(
          { error: "Target character is required for a specific request" },
          { status: 400 }
        );
      }
      const target = await loadCharacterUnionById(targetCharacterIdRaw);
      if (!target) {
        return NextResponse.json({ error: "Target character not found" }, { status: 400 });
      }
      if (!jobCanCraftItem(item, target.job)) {
        return NextResponse.json(
          { error: "Target character's job cannot craft this item" },
          { status: 400 }
        );
      }
      if (!hasStaminaForCraft(staminaSnap, target.currentStamina, target.isModCharacter)) {
        return NextResponse.json(
          { error: "Target character does not have enough stamina for this recipe (base cost)" },
          { status: 400 }
        );
      }
      targetCharacterId = target._id;
      targetCharacterName = target.name;
      targetOwnerDiscordId = target.userId;
    }

    const CraftingRequest = (await import("@/models/CraftingRequestModel.js")).default;

    const doc = await CraftingRequest.create({
      requesterDiscordId: user.id,
      requesterUsername: user.global_name || user.username || "",
      requesterCharacterName,
      craftItemName: item.itemName,
      craftItemMongoId: item._id,
      craftingJobsSnapshot: jobsSnap,
      staminaToCraftSnapshot: staminaSnap,
      targetMode,
      targetCharacterId,
      targetCharacterName,
      providingAllMaterials,
      materialsDescription,
      paymentOffer,
      elixirDescription,
      boostNotes,
      status: "open",
    });

    const requestId = String(doc._id);

    try {
      const discordMessageId = await notifyCraftingRequestCreated({
        requestId,
        requesterDiscordId: user.id,
        requesterUsername: user.global_name || user.username || undefined,
        requesterCharacterName,
        craftItemName: item.itemName,
        craftingJobsSnapshot: jobsSnap,
        staminaToCraftSnapshot: staminaSnap,
        targetMode,
        targetCharacterName: targetCharacterName || undefined,
        targetOwnerDiscordId,
        providingAllMaterials,
        materialsDescription,
        paymentOffer,
        elixirDescription,
        boostNotes,
      });
      if (discordMessageId) {
        await CraftingRequest.findByIdAndUpdate(requestId, { discordMessageId });
      }
    } catch (discErr) {
      console.error("[api/crafting-requests POST] Discord notify failed:", discErr);
    }

    const saved = await CraftingRequest.findById(requestId).lean();
    return NextResponse.json(saved);
  } catch (err) {
    console.error("[api/crafting-requests POST]", err);
    return NextResponse.json({ error: "Failed to create crafting request" }, { status: 500 });
  }
}
