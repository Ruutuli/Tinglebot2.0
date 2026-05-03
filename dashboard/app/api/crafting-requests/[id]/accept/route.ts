import { NextResponse } from "next/server";
import { createRequire } from "module";
import path from "path";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";
import {
  loadCharacterUnionByIdForOwner,
  loadCharacterUnionForOwnerByName,
  workshopCommissionVillagesCompatible,
} from "@/lib/crafting-request-helpers";
import { getCraftItemByName } from "@/lib/crafting-request-mutation";
import { notifyCraftingRequestAccepted } from "@/lib/craftingRequestsNotify";
import { getBotInternalApiConfig } from "@/lib/config";

const requireFromDashboardRoot = createRequire(path.join(process.cwd(), "package.json"));

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Non-JSON bodies from a mis-set BOT_INTERNAL_API_URL (dashboard vs bot). */
function botInternalResponseLooksLikeWrongHost(body: string, httpStatus: number): boolean {
  const s = body.slice(0, 1200).toLowerCase();
  if (!s.includes("<!doctype html") && !s.includes("<html")) return false;
  if (s.includes("/_next/") || s.includes("__next") || s.includes("next/font")) return true;
  if (httpStatus === 404 && s.includes("<html")) return true;
  return false;
}

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

    const requesterCharacter = await loadCharacterUnionForOwnerByName(
      reqDoc.requesterDiscordId,
      reqDoc.requesterCharacterName
    );
    if (!requesterCharacter) {
      return NextResponse.json(
        { error: "Could not load the commissioner's character for village validation." },
        { status: 400 }
      );
    }
    const villageAccept = workshopCommissionVillagesCompatible(
      { name: requesterCharacter.name, currentVillage: requesterCharacter.currentVillage },
      { name: acceptor.name, currentVillage: acceptor.currentVillage }
    );
    if (!villageAccept.ok) {
      return NextResponse.json({ error: villageAccept.error }, { status: 400 });
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
      const latestRaw = await CraftingRequest.findById(id).lean();
      const latest = Array.isArray(latestRaw) ? latestRaw[0] : latestRaw;
      if (!latest || typeof latest !== "object") {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }
      const requesterId = String(
        (latest as { requesterDiscordId?: string }).requesterDiscordId ?? ""
      );
      if (requesterId === user.id) {
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

    type CraftResultPayload = {
      ok: boolean;
      code?: string;
      error?: string;
      missingMaterials?: string[];
      craftedQuantity?: number;
      crafterStaminaPaid?: number;
      teacherStaminaPaid?: number;
    };

    let craftResult: CraftResultPayload | undefined;

    try {
      const elixirSels = Array.isArray(reserved.elixirMaterialSelections)
        ? reserved.elixirMaterialSelections.map(
            (s: { inventoryDocumentId?: unknown; maxQuantity?: unknown }) => ({
              inventoryDocumentId: s.inventoryDocumentId,
              maxQuantity: s.maxQuantity,
            })
          )
        : [];

      const craftPayload = {
        crafterUserId: user.id,
        crafterCharacterId: acceptorCharacterId,
        commissionerDiscordId: reserved.requesterDiscordId,
        commissionerCharacterName: reserved.requesterCharacterName,
        craftItemName: reserved.craftItemName,
        elixirTier: reserved.elixirTier ?? null,
        elixirMaterialSelections: elixirSels,
      };

      const inlineMod = requireFromDashboardRoot("./lib/workshopCommissionCraftInline.js") as {
        shouldPreferInlineWorkshopCraft: () => boolean;
        resolveBotWorkshopCraftPath: () => string | null;
        executeWorkshopCommissionCraftFromRepo: (
          absPath: string,
          payload: typeof craftPayload
        ) => Promise<CraftResultPayload>;
      };

      if (inlineMod.shouldPreferInlineWorkshopCraft()) {
        const craftPath = inlineMod.resolveBotWorkshopCraftPath();
        if (craftPath) {
          try {
            craftResult = await inlineMod.executeWorkshopCommissionCraftFromRepo(
              craftPath,
              craftPayload
            );
          } catch (inlineErr) {
            await revertToOpen();
            const msg = inlineErr instanceof Error ? inlineErr.message : String(inlineErr);
            console.error("[crafting-requests accept] inline craft threw:", msg);
            return NextResponse.json(
              {
                error: `In-process craft failed (local dev). ${msg} Commission was re-opened.`,
                code: "INLINE_CRAFT_FAILED",
                ...(process.env.NODE_ENV === "development" ? { debug: msg } : {}),
              },
              { status: 500 }
            );
          }
        }
      }

      if (craftResult === undefined) {
        const { baseUrl: botBase, secret, isConfigured } = getBotInternalApiConfig();
        if (!isConfigured || !botBase || !secret) {
          await revertToOpen();
          return NextResponse.json(
            {
              error:
                "Commission crafting runs on the Discord bot service. Set BOT_INTERNAL_API_URL and BOT_INTERNAL_API_SECRET to your bot’s base URL and shared secret (same as admin submission approvals)." +
                (process.env.NODE_ENV === "development"
                  ? " For http://localhost:6001 you can also keep this repo’s `bot/` folder next to `dashboard/` so accept can run the craft in-process without those variables (or set CRAFTING_ACCEPT_INLINE=false to force HTTP)."
                  : ""),
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
          body: JSON.stringify(craftPayload),
          signal: AbortSignal.timeout(180_000),
        });

        const rawBody = await craftRes.text();
        let parsed: unknown;
        try {
          parsed = rawBody.trim() ? JSON.parse(rawBody) : null;
        } catch {
          await revertToOpen();
          console.error(
            "[crafting-requests accept] Bot returned non-JSON body",
            craftRes.status,
            rawBody?.slice(0, 600)
          );
          const wrongHost = botInternalResponseLooksLikeWrongHost(rawBody, craftRes.status);
          return NextResponse.json(
            {
              error: wrongHost
                ? "BOT_INTERNAL_API_URL is pointing at your website (Next.js HTML), not the Discord bot process. Set it to the bot deployment base URL — the same host where GET /health returns JSON from `node bot/index.js` (e.g. your Railway **bot** service), not the dashboard domain. Commission was re-opened."
                : "The crafting bot returned a non-JSON response (wrong BOT_INTERNAL_API_URL, proxy HTML, or bot offline). Commission was re-opened.",
              status: craftRes.status,
              code: wrongHost ? "BOT_INTERNAL_URL_WRONG_HOST" : "BOT_INTERNAL_NON_JSON",
            },
            { status: 502 }
          );
        }

        craftResult = parsed as CraftResultPayload;
        if (
          !craftResult ||
          typeof craftResult !== "object" ||
          typeof craftResult.ok !== "boolean"
        ) {
          await revertToOpen();
          console.error("[crafting-requests accept] Bot JSON missing ok:", craftRes.status, parsed);
          return NextResponse.json(
            {
              error: "Bot craft service returned an unexpected payload; commission was re-opened.",
              status: craftRes.status,
            },
            { status: 502 }
          );
        }

        if (!craftRes.ok && craftResult.ok) {
          await revertToOpen();
          return NextResponse.json(
            {
              error:
                "Bot returned an HTTP error even though the payload said success — check bot logs. Commission was re-opened.",
              status: craftRes.status,
            },
            { status: 502 }
          );
        }
      }

      if (
        craftResult === undefined ||
        typeof craftResult !== "object" ||
        typeof craftResult.ok !== "boolean"
      ) {
        await revertToOpen();
        return NextResponse.json(
          {
            error: "Craft returned an unexpected payload; commission was re-opened.",
            code: "CRAFT_UNEXPECTED_PAYLOAD",
          },
          { status: 502 }
        );
      }
    } catch (craftErr) {
      await revertToOpen();
      const msg = craftErr instanceof Error ? craftErr.message : String(craftErr);
      const name = craftErr instanceof Error ? craftErr.name : "";
      console.error("[crafting-requests accept] craft threw:", name, msg);
      const isAbort =
        name === "AbortError" ||
        msg.includes("aborted") ||
        msg.includes("The operation was aborted");
      return NextResponse.json(
        {
          error: isAbort
            ? "Crafting timed out after 3 minutes — the bot may be busy or unreachable. Commission was re-opened."
            : "Could not reach the crafting bot (network/DNS/SSL). Commission was re-opened.",
          hint: "Verify BOT_INTERNAL_API_URL is the bot service URL where GET /health works, and BOT_INTERNAL_API_SECRET matches the bot.",
          ...(process.env.NODE_ENV === "development" ? { debug: msg } : {}),
        },
        { status: isAbort ? 504 : 503 }
      );
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
