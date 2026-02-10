/**
 * Discord OAuth: redirect to Discord authorization.
 * Uses state (CSRF) and optional redirect-after-login.
 * Callback handles code exchange and session.
 *
 * 400 from Discord? Redirect URI mismatch. Add this EXACT URL to your app's
 * Redirects (no trailing slash, same protocol/port):
 *   → NEXT_PUBLIC_APP_URL + /api/auth/discord/callback
 *   → e.g. http://localhost:6001/api/auth/discord/callback
 * Discord Developer Portal → Your App → OAuth2 → Redirects → Add.
 * Also use Chrome/Firefox/Edge; Discord's in-app browser often fails.
 */

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDiscordRedirectUri } from "@/lib/config";

const DISCORD_AUTH_URL = "https://discord.com/oauth2/authorize";
const SCOPES = ["identify"];
const STATE_COOKIE = "discord_oauth_state";
const REDIRECT_COOKIE = "discord_oauth_redirect";
const COOKIE_MAX_AGE = 5 * 60; // 5 min

function isValidRedirectPath(path: string): boolean {
  return path.startsWith("/") && !path.includes("//") && !path.toLowerCase().startsWith("http");
}

export async function GET(request: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = getDiscordRedirectUri(request);

  if (!clientId) {
    return NextResponse.json(
      { error: "Discord OAuth not configured" },
      { status: 500 }
    );
  }

  const state = randomBytes(32).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    prompt: "consent",
  });

  const redirectTarget = request.nextUrl.searchParams.get("redirect");
  const redirectPath =
    redirectTarget && typeof redirectTarget === "string" && isValidRedirectPath(redirectTarget)
      ? redirectTarget
      : null;

  const url = `${DISCORD_AUTH_URL}?${params.toString()}`;
  const res = NextResponse.redirect(url);

  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  if (redirectPath) {
    res.cookies.set(REDIRECT_COOKIE, redirectPath, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
  }

  return res;
}
