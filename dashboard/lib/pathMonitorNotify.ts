/**
 * Notify the path-monitor Discord channel when a new path is drawn or a path image is uploaded.
 * Uses DISCORD_TOKEN (same as other dashboard→Discord posts) to send to channel 1391812848099004578.
 * Fire-and-forget; does not block or throw.
 */

import { discordApiRequest } from "@/lib/discord";

const PATH_MONITOR_CHANNEL_ID = "1391812848099004578";

export function notifyPathDrawn(options: {
  partyId: string;
  userLabel: string;
  kind: "image" | "drawn";
  /** Square ID (e.g. H7) — when provided with imageUrl, notification is sent as an embed with square/quadrant and image. */
  squareId?: string;
  /** Quadrant ID (e.g. Q3) — optional; when provided, included in embed. */
  quadrantId?: string | null;
  /** URL of the uploaded path image — when provided, embed shows the image. */
  imageUrl?: string;
}): void {
  const { partyId, userLabel, kind, squareId, quadrantId, imageUrl } = options;
  const hasEmbed = kind === "image" && (squareId ?? imageUrl);

  if (hasEmbed && squareId && imageUrl) {
    const locationText = quadrantId ? `${squareId} ${quadrantId}` : squareId;
    const embed = {
      title: "🗺️ New path image uploaded",
      description: [
        `**Expedition:** ${partyId}`,
        `**Location:** ${locationText}`,
        `**Uploaded by:** ${userLabel}`,
      ].join("\n"),
      color: 0x2d5016, // dark green
      image: { url: imageUrl },
    };
    discordApiRequest(
      `channels/${PATH_MONITOR_CHANNEL_ID}/messages`,
      "POST",
      { embeds: [embed] }
    ).catch((err) => {
      console.warn("[pathMonitorNotify] Discord embed post failed:", err);
    });
    return;
  }

  const action =
    kind === "image"
      ? "A new path **image** has been uploaded"
      : "A new path has been **drawn**";
  const content = `${action} for expedition **${partyId}** by user **${userLabel}**.`;
  discordApiRequest(
    `channels/${PATH_MONITOR_CHANNEL_ID}/messages`,
    "POST",
    { content }
  ).catch((err) => {
    console.warn("[pathMonitorNotify] Discord post failed:", err);
  });
}
