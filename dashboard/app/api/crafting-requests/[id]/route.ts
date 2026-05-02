import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";
import { parseStaminaToCraft } from "@/lib/crafting-request-helpers";
import {
  craftingRequestNotifyPayloadForDiscord,
  validateCraftingRequestBody,
} from "@/lib/crafting-request-mutation";
import { deleteCraftingRequestBoardMessage, syncCraftingRequestBoardMessage } from "@/lib/craftingRequestsNotify";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await getSession();
    const user = session.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const parsed = await validateCraftingRequestBody(user, body);
    if (!parsed.ok) return parsed.res;

    await connect();
    const CraftingRequest = (await import("@/models/CraftingRequestModel.js")).default;
    const reqDoc = await CraftingRequest.findById(id).exec();
    if (!reqDoc) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (reqDoc.requesterDiscordId !== user.id) {
      return NextResponse.json({ error: "Only the requester can edit this" }, { status: 403 });
    }
    if (reqDoc.status !== "open") {
      return NextResponse.json({ error: "Only open requests can be edited" }, { status: 400 });
    }

    const v = parsed.data;
    const jobsSnap = Array.isArray(v.item.craftingJobs) ? [...v.item.craftingJobs] : [];
    const staminaSnap = parseStaminaToCraft(v.item.staminaToCraft);

    reqDoc.requesterUsername = user.global_name || user.username || "";
    reqDoc.requesterCharacterName = v.requesterCharacterName;
    reqDoc.craftItemName = v.item.itemName;
    reqDoc.craftItemMongoId = v.item._id as mongoose.Types.ObjectId;
    reqDoc.craftingJobsSnapshot = jobsSnap;
    reqDoc.staminaToCraftSnapshot = staminaSnap;
    reqDoc.targetMode = v.targetMode;
    reqDoc.targetCharacterId = v.targetCharacterId;
    reqDoc.targetCharacterName = v.targetCharacterName;
    reqDoc.targetCharacterHomeVillage = v.targetCharacterHomeVillage;
    reqDoc.providingAllMaterials = v.providingAllMaterials;
    reqDoc.materialsDescription = v.materialsDescription;
    reqDoc.paymentOffer = v.paymentOffer;
    reqDoc.elixirDescription = v.elixirDescription;

    await reqDoc.save();

    const requestId = String(reqDoc._id);
    const discordMessageId = reqDoc.discordMessageId ? String(reqDoc.discordMessageId) : "";

    if (discordMessageId) {
      try {
        await syncCraftingRequestBoardMessage(
          discordMessageId,
          await craftingRequestNotifyPayloadForDiscord(requestId, user, v)
        );
      } catch (e) {
        console.error("[api/crafting-requests PATCH] Discord sync failed:", e);
      }
    }

    const saved = await CraftingRequest.findById(requestId).lean();
    return NextResponse.json(saved);
  } catch (err) {
    console.error("[api/crafting-requests PATCH]", err);
    return NextResponse.json({ error: "Failed to update crafting request" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await getSession();
    const user = session.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
    }

    await connect();
    const CraftingRequest = (await import("@/models/CraftingRequestModel.js")).default;

    const reqDoc = await CraftingRequest.findById(id).exec();
    if (!reqDoc) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (reqDoc.requesterDiscordId !== user.id) {
      return NextResponse.json({ error: "Only the requester can delete this" }, { status: 403 });
    }
    if (reqDoc.status !== "open") {
      return NextResponse.json({ error: "Only open requests can be deleted" }, { status: 400 });
    }

    const discordMessageId = reqDoc.discordMessageId ? String(reqDoc.discordMessageId) : "";

    await CraftingRequest.findByIdAndDelete(id).exec();

    if (discordMessageId) {
      try {
        await deleteCraftingRequestBoardMessage(discordMessageId);
      } catch (e) {
        console.error("[api/crafting-requests DELETE] Discord delete failed:", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/crafting-requests DELETE]", err);
    return NextResponse.json({ error: "Failed to delete crafting request" }, { status: 500 });
  }
}
