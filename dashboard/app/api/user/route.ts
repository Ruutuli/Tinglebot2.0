import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const user = session.user ?? null;
  const isAuthenticated = !!user;
  const isAdmin = user ? await isAdminUser(user.id) : false;
  const isMod = user ? await isModeratorUser(user.id) : false;

  return NextResponse.json({
    user: user
      ? {
          id: user.id,
          username: user.username,
          global_name: user.global_name,
          avatar: user.avatar,
          discordId: user.id,
        }
      : null,
    isAuthenticated,
    isAdmin,
    isMod,
  });
}
