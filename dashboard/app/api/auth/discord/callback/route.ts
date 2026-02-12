// ============================================================================
// ------------------- Discord OAuth Callback Route -------------------
// ============================================================================
// Discord OAuth callback: exchange code for token, fetch user, set session.
// Verifies state (CSRF); redirects to stored path when present.

import { NextRequest, NextResponse } from "next/server";
import { getSession, type SessionUser } from "@/lib/session";
import { getAppUrlFromRequest, getDiscordRedirectUri } from "@/lib/config";
import { connect } from "@/lib/db";

const TOKEN_URL = "https://discord.com/api/oauth2/token";
const USER_URL = "https://discord.com/api/users/@me";
const STATE_COOKIE = "discord_oauth_state";
const REDIRECT_COOKIE = "discord_oauth_redirect";

function redirectWithAuthError(appUrl: string, authError: string, details?: string): NextResponse {
  const url = new URL("/", appUrl);
  url.searchParams.set("auth_error", authError);
  if (details) url.searchParams.set("details", details);
  return NextResponse.redirect(url.toString());
}

function clearOAuthCookies(res: NextResponse): void {
  res.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" });
  res.cookies.set(REDIRECT_COOKIE, "", { maxAge: 0, path: "/" });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const stateFromQuery = searchParams.get("state");

  const appUrl = getAppUrlFromRequest(request);
  const stateFromCookie = request.cookies.get(STATE_COOKIE)?.value;
  const redirectPath = request.cookies.get(REDIRECT_COOKIE)?.value;

  if (error) {
    const res = redirectWithAuthError(appUrl, error);
    clearOAuthCookies(res);
    return res;
  }

  if (!stateFromQuery || !stateFromCookie || stateFromQuery !== stateFromCookie) {
    const res = redirectWithAuthError(appUrl, "invalid_state");
    clearOAuthCookies(res);
    return res;
  }

  if (!code) {
    const res = redirectWithAuthError(appUrl, "missing_code");
    clearOAuthCookies(res);
    return res;
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = getDiscordRedirectUri(request);

  if (!clientId || !clientSecret) {
    const res = redirectWithAuthError(appUrl, "config");
    clearOAuthCookies(res);
    return res;
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    const res = redirectWithAuthError(appUrl, "token", err.slice(0, 100));
    clearOAuthCookies(res);
    return res;
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    const res = redirectWithAuthError(appUrl, "no_token");
    clearOAuthCookies(res);
    return res;
  }

  const userRes = await fetch(USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    const res = redirectWithAuthError(appUrl, "user");
    clearOAuthCookies(res);
    return res;
  }

  const raw = (await userRes.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };

  const user: SessionUser = {
    id: raw.id,
    username: raw.username,
    global_name: raw.global_name ?? null,
    avatar: raw.avatar ?? null,
  };

  const session = await getSession();
  session.user = user;
  await session.save();

  const displayName = (raw.global_name && raw.global_name.trim()) || raw.username || "";
  if (displayName) {
    try {
      await connect();
      const User = (await import("@/models/UserModel.js")).default;
      await User.updateOne(
        { discordId: raw.id },
        { $set: { username: displayName } },
        { upsert: true }
      );
    } catch (e) {
      console.warn("[Dashboard login] Failed to update User username:", e);
    }
  }

  console.log("[Dashboard login]", {
    discordId: user.id,
    username: user.username,
    globalName: user.global_name ?? undefined,
  });

  const isValidPath =
    redirectPath &&
    typeof redirectPath === "string" &&
    redirectPath.startsWith("/") &&
    !redirectPath.includes("//");
  const destination = isValidPath ? `${appUrl.replace(/\/$/, "")}${redirectPath}` : appUrl;

  const res = NextResponse.redirect(destination);
  clearOAuthCookies(res);
  return res;
}
