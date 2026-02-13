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
}): void {
  const { partyId, userLabel, kind } = options;
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
