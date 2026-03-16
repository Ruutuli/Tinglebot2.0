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

/** Relic embed styling (match bot relic embeds). */
const RELIC_EMBED_COLOR = 0xe67e22;
const RELIC_EMBED_THUMBNAIL_URL =
  "https://static.wikia.nocookie.net/zelda_gamepedia_en/images/7/7c/HW_Sealed_Weapon_Icon.png/revision/latest?cb=20150918051232";
const RELIC_EMBED_IMAGE_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const RELIC_EMBED_FOOTER = "Relics · https://rootsofthewild.com/mechanics/relics";

export function notifyRelicArchiveRequest(options: {
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
}): void {
  if (!RELIC_ARCHIVE_CHANNEL_ID) {
    console.warn(
      "[relicArchiveNotify] No channel configured (RELIC_ARCHIVE_REQUESTS_CHANNEL_ID or ADMIN_REVIEW_CHANNEL_ID)"
    );
    return;
  }

  const { title, relicId, discoveredBy, appraisedBy, region, square, quadrant, infoSnippet, libraryPositionX, libraryPositionY, libraryDisplaySize } = options;
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

  const embed = {
    title: "📜 New relic archive request",
    description,
    color: RELIC_EMBED_COLOR,
    thumbnail: { url: RELIC_EMBED_THUMBNAIL_URL },
    image: { url: RELIC_EMBED_IMAGE_URL },
    footer: { text: RELIC_EMBED_FOOTER },
    timestamp: new Date().toISOString(),
  };

  discordApiRequest(`channels/${RELIC_ARCHIVE_CHANNEL_ID}/messages`, "POST", { embeds: [embed] }).catch(
    (err) => {
      console.warn("[relicArchiveNotify] Discord post failed:", err);
    }
  );
}
