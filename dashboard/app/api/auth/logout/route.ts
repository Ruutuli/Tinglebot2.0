/**
 * GET /api/auth/logout — destroy session and redirect home.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  session.destroy();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:6001";
  return NextResponse.redirect(appUrl);
}
