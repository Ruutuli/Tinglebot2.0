/**
 * GET /api/auth/logout — destroy session and redirect home.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppUrl } from "@/lib/config";

export async function GET() {
  const session = await getSession();
  session.destroy();

  const appUrl = getAppUrl();
  return NextResponse.redirect(appUrl);
}
