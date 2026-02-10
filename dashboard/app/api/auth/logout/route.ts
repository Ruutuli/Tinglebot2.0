/**
 * GET /api/auth/logout — destroy session and redirect home.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppUrlFromRequest } from "@/lib/config";

export async function GET(request: NextRequest) {
  const session = await getSession();
  session.destroy();

  const appUrl = getAppUrlFromRequest(request);
  return NextResponse.redirect(appUrl);
}
