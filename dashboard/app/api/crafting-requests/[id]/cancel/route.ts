import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
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
      return NextResponse.json({ error: "Only the requester can cancel" }, { status: 403 });
    }
    if (reqDoc.status !== "open") {
      return NextResponse.json({ error: "Only open requests can be cancelled" }, { status: 400 });
    }

    reqDoc.status = "cancelled";
    await reqDoc.save();

    return NextResponse.json(reqDoc.toObject());
  } catch (err) {
    console.error("[api/crafting-requests cancel]", err);
    return NextResponse.json({ error: "Failed to cancel request" }, { status: 500 });
  }
}
