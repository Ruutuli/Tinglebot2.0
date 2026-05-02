import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";
import {
  hasStaminaForCraft,
  jobCanCraftItem,
  loadCharacterUnionById,
  parseStaminaToCraft,
} from "@/lib/crafting-request-helpers";
import { notifyCraftingRequestAccepted } from "@/lib/craftingRequestsNotify";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
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

    const body = (await request.json()) as { acceptorCharacterId?: string };
    const acceptorCharacterId = String(body.acceptorCharacterId ?? "").trim();
    if (!acceptorCharacterId || !mongoose.Types.ObjectId.isValid(acceptorCharacterId)) {
      return NextResponse.json({ error: "acceptorCharacterId is required" }, { status: 400 });
    }

    await connect();
    const CraftingRequest = (await import("@/models/CraftingRequestModel.js")).default;
    const Item = (await import("@/models/ItemModel.js")).default;

    const reqDoc = await CraftingRequest.findById(id).exec();
    if (!reqDoc) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (reqDoc.status !== "open") {
      return NextResponse.json({ error: "This request is no longer open" }, { status: 400 });
    }
    if (reqDoc.requesterDiscordId === user.id) {
      return NextResponse.json({ error: "You cannot accept your own request" }, { status: 400 });
    }

    const acceptor = await loadCharacterUnionById(acceptorCharacterId);
    if (!acceptor) {
      return NextResponse.json({ error: "Character not found" }, { status: 400 });
    }
    if (acceptor.userId !== user.id) {
      return NextResponse.json({ error: "That character is not yours" }, { status: 403 });
    }

    if (reqDoc.targetMode === "specific") {
      const tid = reqDoc.targetCharacterId ? String(reqDoc.targetCharacterId) : "";
      if (!tid || tid !== acceptorCharacterId) {
        return NextResponse.json(
          { error: "This request is for a specific crafter only" },
          { status: 400 }
        );
      }
    }

    const item = await Item.findOne({ itemName: reqDoc.craftItemName, crafting: true })
      .select("craftingJobs staminaToCraft")
      .lean()
      .exec();

    if (!item) {
      return NextResponse.json({ error: "Craft item no longer exists or is not craftable" }, { status: 400 });
    }

    const staminaCost =
      reqDoc.staminaToCraftSnapshot > 0
        ? reqDoc.staminaToCraftSnapshot
        : parseStaminaToCraft(item.staminaToCraft);

    if (!jobCanCraftItem(item, acceptor.job)) {
      return NextResponse.json(
        { error: "Your character's job cannot craft this item" },
        { status: 400 }
      );
    }
    if (!hasStaminaForCraft(staminaCost, acceptor.currentStamina, acceptor.isModCharacter)) {
      return NextResponse.json(
        {
          error: `Not enough stamina (base cost ${staminaCost}; in-game cost may differ with boosts)`,
        },
        { status: 400 }
      );
    }

    reqDoc.status = "accepted";
    reqDoc.acceptedAt = new Date();
    reqDoc.acceptedByUserId = user.id;
    reqDoc.acceptedByCharacterId = acceptor._id;
    reqDoc.acceptedByCharacterName = acceptor.name;
    await reqDoc.save();

    try {
      await notifyCraftingRequestAccepted({
        requesterDiscordId: reqDoc.requesterDiscordId,
        acceptorDiscordId: user.id,
        acceptorCharacterName: acceptor.name,
        craftItemName: reqDoc.craftItemName,
      });
    } catch (e) {
      console.warn("[crafting-requests accept] Discord follow-up failed:", e);
    }

    return NextResponse.json(reqDoc.toObject());
  } catch (err) {
    console.error("[api/crafting-requests accept]", err);
    return NextResponse.json({ error: "Failed to accept request" }, { status: 500 });
  }
}
