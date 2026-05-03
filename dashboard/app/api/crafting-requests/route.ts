import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";
import { ensureCraftingRequestCommissionId, parseStaminaToCraft } from "@/lib/crafting-request-helpers";
import {
  craftingRequestNotifyPayloadForDiscord,
  validateCraftingRequestBody,
} from "@/lib/crafting-request-mutation";
import { loadCharacterUnionForOwnerByName } from "@/lib/crafting-request-helpers";
import { notifyCraftingRequestCreated } from "@/lib/craftingRequestsNotify";
import { generateUniqueId } from "@/lib/uniqueId";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

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

    const mongoIds = [
      ...new Set(
        rows
          .map((r) => r.craftItemMongoId)
          .filter((id): id is mongoose.Types.ObjectId => id != null)
      ),
    ];
    const imageByItemId = new Map<string, string>();
    if (mongoIds.length > 0) {
      const Item = (await import("@/models/ItemModel.js")).default;
      const items = await Item.find({ _id: { $in: mongoIds } })
        .select("_id image")
        .lean()
        .exec();
      for (const it of items) {
        const img = typeof it.image === "string" ? it.image : "";
        if (img && img !== "No Image") {
          imageByItemId.set(String(it._id), img);
        }
      }
    }

    const requests = await Promise.all(
      rows.map(async (r) => {
        let commissionID =
          typeof r.commissionID === "string" && r.commissionID.trim()
            ? r.commissionID.trim()
            : "";
        if (!commissionID) {
          commissionID = await ensureCraftingRequestCommissionId(CraftingRequest, {
            _id: r._id,
            commissionID: r.commissionID ?? null,
          });
        }
        const id = r.craftItemMongoId != null ? String(r.craftItemMongoId) : "";
        const craftItemImage = id ? imageByItemId.get(id) : undefined;
        let requesterCurrentVillage: string | null = null;
        try {
          const reqChar = await loadCharacterUnionForOwnerByName(
            String(r.requesterDiscordId ?? ""),
            String(r.requesterCharacterName ?? "")
          );
          requesterCurrentVillage = reqChar?.currentVillage?.trim() || null;
        } catch {
          requesterCurrentVillage = null;
        }
        return { ...r, commissionID, craftItemImage, requesterCurrentVillage };
      })
    );

    return NextResponse.json({
      requests,
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
    const parsed = await validateCraftingRequestBody(user, body);
    if (!parsed.ok) return parsed.res;

    const v = parsed.data;
    const staminaSnap = parseStaminaToCraft(v.item.staminaToCraft);
    const jobsSnap = Array.isArray(v.item.craftingJobs) ? [...v.item.craftingJobs] : [];

    await connect();
    const CraftingRequest = (await import("@/models/CraftingRequestModel.js")).default;

    let commissionID: string | undefined;
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = generateUniqueId("K");
      const clash = await CraftingRequest.findOne({ commissionID: candidate }).lean();
      if (!clash) {
        commissionID = candidate;
        break;
      }
    }
    if (!commissionID) {
      return NextResponse.json({ error: "Could not assign a commission id — try again" }, { status: 500 });
    }

    const doc = await CraftingRequest.create({
      commissionID,
      requesterDiscordId: user.id,
      requesterUsername: user.global_name || user.username || "",
      requesterCharacterName: v.requesterCharacterName,
      craftItemName: v.item.itemName,
      craftItemMongoId: v.item._id,
      craftingJobsSnapshot: jobsSnap,
      staminaToCraftSnapshot: staminaSnap,
      targetMode: v.targetMode,
      targetCharacterId: v.targetCharacterId,
      targetCharacterName: v.targetCharacterName,
      targetCharacterHomeVillage: v.targetCharacterHomeVillage,
      providingAllMaterials: v.providingAllMaterials,
      materialsDescription: v.materialsDescription,
      paymentOffer: v.paymentOffer,
      elixirTier: v.elixirTier,
      elixirMaterialSelections: v.elixirMaterialSelections.map((s) => ({
        inventoryDocumentId: s.inventoryDocumentId,
        maxQuantity: s.maxQuantity,
      })),
      status: "open",
    });

    const requestId = String(doc._id);

    try {
      const discordMessageId = await notifyCraftingRequestCreated(
        await craftingRequestNotifyPayloadForDiscord(requestId, user, v, commissionID)
      );
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
