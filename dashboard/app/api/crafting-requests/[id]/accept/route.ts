import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";
import { loadCharacterUnionByIdForOwner } from "@/lib/crafting-request-helpers";
import { getCraftItemByName } from "@/lib/crafting-request-mutation";
import { notifyCraftingRequestAccepted } from "@/lib/craftingRequestsNotify";
import { getBotInternalApiConfig } from "@/lib/config";

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

    const acceptor = await loadCharacterUnionByIdForOwner(acceptorCharacterId, user.id);
    if (!acceptor) {
      return NextResponse.json(
        { error: "Character not found or not on your roster" },
        { status: 403 }
      );
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

    const item = await getCraftItemByName(reqDoc.craftItemName);
    if (!item) {
      return NextResponse.json({ error: "Craft item no longer exists or is not craftable" }, { status: 400 });
    }

    const acceptedAt = new Date();
    const reserved = await CraftingRequest.findOneAndUpdate(
      {
        _id: id,
        status: "open",
        requesterDiscordId: { $ne: user.id },
      },
      {
        $set: {
          status: "accepted",
          acceptedAt,
          acceptedByUserId: user.id,
          acceptedByCharacterId: new mongoose.Types.ObjectId(acceptorCharacterId),
          acceptedByCharacterName: acceptor.name,
        },
      },
      { new: true }
    ).exec();

    if (!reserved) {
      const latest = await CraftingRequest.findById(id).lean();
      if (!latest) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }
      if (latest.requesterDiscordId === user.id) {
        return NextResponse.json({ error: "You cannot accept your own request" }, { status: 400 });
      }
      return NextResponse.json({ error: "This request is no longer open" }, { status: 400 });
    }

    const revertToOpen = async () => {
      await CraftingRequest.findByIdAndUpdate(id, {
        $set: {
          status: "open",
          acceptedAt: null,
          acceptedByUserId: null,
          acceptedByCharacterId: null,
          acceptedByCharacterName: "",
        },
      }).exec();
    };

    let craftResult: {
      ok: boolean;
      code?: string;
      error?: string;
      missingMaterials?: string[];
      craftedQuantity?: number;
      crafterStaminaPaid?: number;
      teacherStaminaPaid?: number;
    };
    try {
      const elixirSels = Array.isArray(reserved.elixirMaterialSelections)
        ? reserved.elixirMaterialSelections.map(
            (s: { inventoryDocumentId?: unknown; maxQuantity?: unknown }) => ({
              inventoryDocumentId: s.inventoryDocumentId,
              maxQuantity: s.maxQuantity,
            })
          )
        : [];

      const { baseUrl: botBase, secret, isConfigured } = getBotInternalApiConfig();
      if (!isConfigured || !botBase || !secret) {
        await revertToOpen();
        return NextResponse.json(
          {
            error:
              "Commission crafting runs on the Discord bot service. Set BOT_INTERNAL_API_URL and BOT_INTERNAL_API_SECRET to your bot’s base URL and shared secret (same as admin submission approvals).",
            code: "BOT_INTERNAL_API_NOT_CONFIGURED",
          },
          { status: 503 }
        );
      }

      const craftRes = await fetch(`${botBase}/internal/workshop-commission-craft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bot-internal-secret": secret,
        },
        body: JSON.stringify({
          crafterUserId: user.id,
          crafterCharacterId: acceptorCharacterId,
          commissionerDiscordId: reserved.requesterDiscordId,
          commissionerCharacterName: reserved.requesterCharacterName,
          craftItemName: reserved.craftItemName,
          elixirTier: reserved.elixirTier ?? null,
          elixirMaterialSelections: elixirSels,
        }),
      });

      craftResult = (await craftRes.json()) as typeof craftResult;
      if (!craftRes.ok && typeof craftResult?.ok !== "boolean") {
        await revertToOpen();
        return NextResponse.json(
          { error: "Bot craft service returned an error; commission was re-opened.", status: craftRes.status },
          { status: 502 }
        );
      }
    } catch (craftErr) {
      await revertToOpen();
      console.error("[crafting-requests accept] craft threw:", craftErr);
      return NextResponse.json({ error: "Craft failed after locking request; commission was re-opened." }, { status: 500 });
    }

    if (!craftResult.ok) {
      await revertToOpen();
      const status =
        craftResult.code === "CRAFTER" ? 403 : craftResult.code === "EXECUTION" ? 500 : 400;
      return NextResponse.json(
        {
          error: craftResult.error,
          code: craftResult.code,
          ...(Array.isArray(craftResult.missingMaterials)
            ? { missingMaterials: craftResult.missingMaterials }
            : {}),
        },
        { status }
      );
    }

    try {
      await notifyCraftingRequestAccepted({
        requestId: String(reserved._id),
        requesterDiscordId: reserved.requesterDiscordId,
        acceptorDiscordId: user.id,
        acceptorCharacterName: acceptor.name,
        craftItemName: reserved.craftItemName,
        requesterCharacterName: reserved.requesterCharacterName,
        paymentOffer: reserved.paymentOffer,
        craftItemImage: typeof item.image === "string" ? item.image : undefined,
      });
    } catch (e) {
      console.warn("[crafting-requests accept] Discord follow-up failed:", e);
    }

    return NextResponse.json({
      ...reserved.toObject(),
      craft: {
        craftedQuantity: craftResult.craftedQuantity,
        crafterStaminaPaid: craftResult.crafterStaminaPaid,
        teacherStaminaPaid: craftResult.teacherStaminaPaid,
      },
    });
  } catch (err) {
    console.error("[api/crafting-requests accept]", err);
    return NextResponse.json({ error: "Failed to accept request" }, { status: 500 });
  }
}
