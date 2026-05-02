import { discordApiRequest } from "@/lib/discord";
import { getAppUrl } from "@/lib/config";

const COMMUNITY_BOARD_CHANNEL_ID =
  process.env.COMMUNITY_BOARD_CHANNEL_ID || "651614266046152705";

const EMBED_COLOR = 0x5d8aa8;

export type CraftingRequestNotifyPayload = {
  requestId: string;
  requesterDiscordId: string;
  requesterUsername?: string;
  requesterCharacterName: string;
  craftItemName: string;
  craftingJobsSnapshot: string[];
  staminaToCraftSnapshot: number;
  targetMode: "open" | "specific";
  targetCharacterName?: string;
  targetCharacterHomeVillage?: string;
  targetOwnerDiscordId?: string;
  providingAllMaterials: boolean;
  materialsDescription: string;
  paymentOffer: string;
  elixirDescription: string;
  boostNotes: string;
};

/**
 * Post a new crafting request to the community board channel.
 * Returns the created message id, or null on failure.
 */
export async function notifyCraftingRequestCreated(
  payload: CraftingRequestNotifyPayload
): Promise<string | null> {
  if (!COMMUNITY_BOARD_CHANNEL_ID) {
    console.warn("[craftingRequestsNotify] COMMUNITY_BOARD_CHANNEL_ID not set");
    return null;
  }

  const baseUrl = getAppUrl().replace(/\/$/, "");
  const boardUrl = `${baseUrl}/crafting-requests`;

  const targetLine =
    payload.targetMode === "specific" && payload.targetCharacterName
      ? `**Crafter requested:** ${payload.targetCharacterName}${
          payload.targetCharacterHomeVillage
            ? ` · ${payload.targetCharacterHomeVillage}`
            : ""
        }${
          payload.targetOwnerDiscordId
            ? ` (<@${payload.targetOwnerDiscordId}>)`
            : ""
        }`
      : "**Crafter:** Open — any qualified character may accept";

  const materialsLine = payload.providingAllMaterials
    ? "**Materials:** Requester provides all listed materials"
    : "**Materials:** Not all materials provided — see notes";

  const description = [
    `**Item:** ${payload.craftItemName}`,
    `**Requester OC:** ${payload.requesterCharacterName}`,
    `**Posted by:** <@${payload.requesterDiscordId}>${
      payload.requesterUsername ? ` (${payload.requesterUsername})` : ""
    }`,
    targetLine,
    `**Jobs (snapshot):** ${
      payload.craftingJobsSnapshot.length
        ? payload.craftingJobsSnapshot.join(", ")
        : "—"
    }`,
    `**Base stamina (snapshot):** ${payload.staminaToCraftSnapshot}`,
    materialsLine,
    payload.materialsDescription.trim()
      ? `**Material notes:** ${payload.materialsDescription.trim().slice(0, 500)}${
          payload.materialsDescription.length > 500 ? "…" : ""
        }`
      : null,
    payload.paymentOffer.trim()
      ? `**Payment:** ${payload.paymentOffer.trim().slice(0, 300)}`
      : null,
    payload.elixirDescription.trim()
      ? `**Elixir:** ${payload.elixirDescription.trim().slice(0, 300)}`
      : null,
    payload.boostNotes.trim()
      ? `**Boost / notes:** ${payload.boostNotes.trim().slice(0, 300)}`
      : null,
    "",
    `[View & accept on dashboard](${boardUrl})`,
  ]
    .filter(Boolean)
    .join("\n");

  const embed = {
    title: "New crafting request",
    description,
    color: EMBED_COLOR,
    timestamp: new Date().toISOString(),
  };

  const result = await discordApiRequest<{ id: string }>(
    `channels/${COMMUNITY_BOARD_CHANNEL_ID}/messages`,
    "POST",
    {
      content: `<@${payload.requesterDiscordId}>`,
      embeds: [embed],
    }
  );

  return result?.id ?? null;
}

export async function notifyCraftingRequestAccepted(options: {
  requesterDiscordId: string;
  acceptorDiscordId: string;
  acceptorCharacterName: string;
  craftItemName: string;
}): Promise<void> {
  if (!COMMUNITY_BOARD_CHANNEL_ID) return;

  const content = [
    `**Crafting request accepted**`,
    `**Item:** ${options.craftItemName}`,
    `**Crafter:** ${options.acceptorCharacterName} (<@${options.acceptorDiscordId}>)`,
    `**Original request:** <@${options.requesterDiscordId}>`,
  ].join("\n");

  await discordApiRequest(`channels/${COMMUNITY_BOARD_CHANNEL_ID}/messages`, "POST", {
    content,
  });
}
