/**
 * Notify a Discord channel when a new relic archive request is submitted.
 * Uses RELIC_ARCHIVE_REQUESTS_CHANNEL_ID or falls back to ADMIN_REVIEW_CHANNEL_ID.
 * Fire-and-forget; does not block or throw.
 */

import { discordApiRequest } from "@/lib/discord";
import { getAppUrl } from "@/lib/config";

const RELIC_ARCHIVE_CHANNEL_ID =
  process.env.RELIC_ARCHIVE_REQUESTS_CHANNEL_ID ||
  process.env.ADMIN_REVIEW_CHANNEL_ID ||
  "1381479893090566144";

/** Channel to post when a relic archive request is approved (character submitted to Library Archives). */
const RELIC_ARCHIVE_APPROVED_CHANNEL_ID = "629028490179510308";

/** Relic embed styling (match bot relic embeds). */
const RELIC_EMBED_COLOR = 0xe67e22;
const RELIC_EMBED_THUMBNAIL_URL =
  "https://static.wikia.nocookie.net/zelda_gamepedia_en/images/7/7c/HW_Sealed_Weapon_Icon.png/revision/latest?cb=20150918051232";
const RELIC_EMBED_IMAGE_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const RELIC_EMBED_FOOTER = "Relics · https://rootsofthewild.com/mechanics/relics";

const MOD_ROLE_ID = process.env.MOD_ROLE_ID || "";

/** Posts the mod-queue embed; returns message/channel IDs so the bot can send follow-up reminders. */
export async function notifyRelicArchiveRequest(options: {
  title: string;
  relicId: string;
  discoveredBy: string;
  appraisedBy: string;
  region?: string;
  square?: string;
  quadrant?: string;
  infoSnippet?: string;
  libraryPositionX?: number;
  libraryPositionY?: number;
  libraryDisplaySize?: number;
  imageUrl?: string;
}): Promise<{ messageId: string; channelId: string } | null> {
  if (!RELIC_ARCHIVE_CHANNEL_ID) {
    console.warn(
      "[relicArchiveNotify] No channel configured (RELIC_ARCHIVE_REQUESTS_CHANNEL_ID or ADMIN_REVIEW_CHANNEL_ID)"
    );
    return null;
  }

  const { title, relicId, discoveredBy, appraisedBy, region, square, quadrant, infoSnippet, libraryPositionX, libraryPositionY, libraryDisplaySize, imageUrl } = options;
  const location = [region, square, quadrant].filter(Boolean).join(" • ") || "—";
  const baseUrl = getAppUrl().replace(/\/$/, "");
  const reviewUrl = `${baseUrl}/admin/relic-archives`;

  const mapPosition =
    libraryPositionX != null && libraryPositionY != null
      ? `**Map position:** X ${Math.round(libraryPositionX)}%, Y ${Math.round(libraryPositionY)}%${libraryDisplaySize != null ? ` • Display size: ${libraryDisplaySize}` : ""}`
      : null;

  const description = [
    `**Relic:** ${title}`,
    `**Relic ID:** ${relicId}`,
    `**Discovered by:** ${discoveredBy}`,
    `**Appraised by:** ${appraisedBy}`,
    `**Region / Square / Quadrant:** ${location}`,
    ...(mapPosition ? [mapPosition] : []),
    ...(infoSnippet ? [`**Info:** ${infoSnippet.slice(0, 200)}${infoSnippet.length > 200 ? "…" : ""}`] : []),
    "",
    `A moderator will review and approve to add it to the Library Archives.`,
    `**[Review in dashboard](${reviewUrl})**`,
  ].join("\n");

  const embed: {
    title: string;
    description: string;
    color: number;
    thumbnail: { url: string };
    image?: { url: string };
    footer: { text: string };
    timestamp: string;
  } = {
    title: "📜 New relic archive request",
    description,
    color: RELIC_EMBED_COLOR,
    thumbnail: { url: RELIC_EMBED_THUMBNAIL_URL },
    footer: { text: RELIC_EMBED_FOOTER },
    timestamp: new Date().toISOString(),
  };

  if (imageUrl && imageUrl.trim()) {
    embed.image = { url: imageUrl.trim() };
  } else {
    embed.image = { url: RELIC_EMBED_IMAGE_URL };
  }

  const content = MOD_ROLE_ID ? `<@&${MOD_ROLE_ID}>` : undefined;

  const data = await discordApiRequest<{ id: string; channel_id?: string }>(
    `channels/${RELIC_ARCHIVE_CHANNEL_ID}/messages`,
    "POST",
    { content, embeds: [embed] }
  );
  if (!data?.id) {
    console.warn("[relicArchiveNotify] Discord post returned no message id");
    return null;
  }
  return {
    messageId: data.id,
    channelId: data.channel_id || RELIC_ARCHIVE_CHANNEL_ID,
  };
}

/**
 * Notify the Library Archives channel when a relic archive request is approved.
 * Posts a fancy embed with character name, relic title, and the relic image.
 * Fire-and-forget; does not block or throw.
 */
export function notifyRelicArchiveApproved(options: {
  title: string;
  relicId: string;
  discoveredBy: string;
  appraisedBy: string;
  region?: string;
  square?: string;
  quadrant?: string;
  imageUrl?: string;
}): void {
  const {
    title,
    relicId,
    discoveredBy,
    appraisedBy,
    region,
    square,
    quadrant,
    imageUrl,
  } = options;

  const baseUrl = getAppUrl().replace(/\/$/, "");
  const archivesUrl = `${baseUrl}/library/archives`;
  const location = [region, square, quadrant].filter(Boolean).join(" · ") || "—";

  const description = [
    `**${discoveredBy}** has submitted a relic to the **Library Archives**!`,
    "",
    `▸ **Relic:** ${title}`,
    `▸ **Appraised by:** ${appraisedBy}`,
    `▸ **Location:** ${location}`,
    "",
    `[View in Library Archives →](${archivesUrl})`,
  ].join("\n");

  const embed: {
    title: string;
    description: string;
    color: number;
    author?: { name: string; icon_url?: string };
    image?: { url: string };
    thumbnail?: { url: string };
    footer: { text: string };
    timestamp: string;
  } = {
    title: "📚 Relic added to the Library Archives",
    description,
    color: 0xc9a227, // warm gold
    author: { name: "Library Archives" },
    footer: { text: "Library Archives · rootsofthewild.com" },
    timestamp: new Date().toISOString(),
  };

  if (imageUrl && imageUrl.trim()) {
    embed.image = { url: imageUrl.trim() };
  } else {
    embed.thumbnail = { url: RELIC_EMBED_THUMBNAIL_URL };
  }

  discordApiRequest(
    `channels/${RELIC_ARCHIVE_APPROVED_CHANNEL_ID}/messages`,
    "POST",
    { embeds: [embed] }
  ).catch((err) => {
    console.warn("[relicArchiveNotify] Discord approved post failed:", err);
  });
}
