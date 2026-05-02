import { discordApiDelete, discordApiRequest } from "@/lib/discord";
import { getPublicAppUrl } from "@/lib/config";
import { formatOpenCommissionSeekingLine } from "@/lib/crafting-request-helpers";
import { elixirTierLabel, isMixerOutputElixirName } from "@/lib/elixir-catalog";

const COMMUNITY_BOARD_CHANNEL_ID =
  process.env.COMMUNITY_BOARD_CHANNEL_ID || "651614266046152705";

const EMBED_COLOR = 0x5d8aa8;

const GCS_PUBLIC_BASE = "https://storage.googleapis.com/tinglebot";

/** Decorative board banners (same family as quests / village posts). */
const CRAFT_BOARD_IMAGES = [
  `${GCS_PUBLIC_BASE}/Graphics/ROTW_border_red_bottom.png`,
  `${GCS_PUBLIC_BASE}/Graphics/ROTW_border_blue_bottom.png`,
  `${GCS_PUBLIC_BASE}/Graphics/ROTW_border_green_bottom.png`,
  `${GCS_PUBLIC_BASE}/Graphics/border.png`,
];

function hashPick<T>(seed: string, choices: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return choices[h % choices.length];
}

/**
 * Discord must fetch embed URLs from the public internet — use full GCS URLs, not /api/images.
 */
function discordEmbedImageUrl(raw?: string | null): string | undefined {
  if (!raw || raw === "No Image") return undefined;
  if (raw.startsWith(`${GCS_PUBLIC_BASE}/`)) return raw;
  if (raw.startsWith("https://") || raw.startsWith("http://")) return raw;
  const path = raw.replace(/^\/+/, "");
  return `${GCS_PUBLIC_BASE}/${path}`;
}

/** Same as `bot/scripts/createJobRoles.js` → `JOB_ARTIST`, `JOB_FORTUNE_TELLER`, … */
function jobNameToRoleEnvKey(jobName: string): string {
  const suffix = jobName
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
  return `JOB_${suffix}`;
}

const DISCORD_SNOWFLAKE = /^\d{17,20}$/;

function roleMentionFromJobName(jobName: string): string | null {
  const key = jobNameToRoleEnvKey(jobName.trim());
  const raw = process.env[key];
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id || !DISCORD_SNOWFLAKE.test(id)) return null;
  return `<@&${id}>`;
}

export type CraftingRequestNotifyPayload = {
  requestId: string;
  requesterDiscordId: string;
  requesterUsername?: string;
  requesterCharacterName: string;
  craftItemName: string;
  /** Raw Item.image from DB */
  craftItemImage?: string;
  craftingJobsSnapshot: string[];
  staminaToCraftSnapshot: number;
  targetMode: "open" | "specific";
  targetCharacterName?: string;
  targetCharacterHomeVillage?: string;
  targetOwnerDiscordId?: string;
  providingAllMaterials: boolean;
  materialsDescription: string;
  paymentOffer: string;
  /** 1–3 when commission is for a mixer elixir */
  elixirTier?: number | null;
  /** Character `icon` field (commissioner OC) — resolved to a public URL in the embed */
  requesterCharacterIcon?: string;
  /** Character `icon` field (named artisan), when `targetMode === "specific"` */
  targetCharacterIcon?: string;
};

/**
 * Message content pings: always the requester; named commission also pings the requested crafter;
 * open commission pings Discord job roles (`JOB_*` from createJobRoles.js) for each recipe job.
 */
export function buildCraftingBoardPingContent(payload: CraftingRequestNotifyPayload): string {
  const parts: string[] = [`<@${payload.requesterDiscordId}>`];

  const pushJobRoles = () => {
    const seenRole = new Set<string>();
    for (const job of payload.craftingJobsSnapshot ?? []) {
      const mention = roleMentionFromJobName(job);
      if (mention && !seenRole.has(mention)) {
        seenRole.add(mention);
        parts.push(mention);
      }
    }
  };

  if (payload.targetMode === "specific" && payload.targetOwnerDiscordId?.trim()) {
    const tid = payload.targetOwnerDiscordId.trim();
    if (tid !== payload.requesterDiscordId) {
      parts.push(`<@${tid}>`);
    }
  } else {
    pushJobRoles();
  }

  return parts.join(" ");
}

const EMBED_TITLE_NEW = "📋 New workshop commission";
const EMBED_TITLE_UPDATED = "✏️ Workshop commission updated";

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** Body for create / edit Discord board posts (stable banner per request id). */
export function buildCraftingRequestBoardMessage(
  payload: CraftingRequestNotifyPayload,
  embedTitle: string = EMBED_TITLE_NEW
): {
  content: string;
  embeds: Record<string, unknown>[];
} {
  const publicBase = getPublicAppUrl().replace(/\/$/, "");
  const boardUrl = `${publicBase}/crafting-requests`;

  const jobsLine =
    payload.craftingJobsSnapshot.length > 0
      ? payload.craftingJobsSnapshot.join(" · ")
      : "—";

  const materialsLine = payload.providingAllMaterials
    ? "✅ Commissioner brings **everything** listed for this recipe."
    : "⚠️ Not all materials in hand yet — see notes below.";

  const materialsNotes = payload.materialsDescription.trim()
    ? clip(payload.materialsDescription.trim(), 500)
    : "";

  const offerLine = payload.paymentOffer.trim()
    ? clip(payload.paymentOffer.trim(), 300)
    : "";

  const elixirTierLine =
    isMixerOutputElixirName(payload.craftItemName) &&
    payload.elixirTier != null &&
    payload.elixirTier >= 1 &&
    payload.elixirTier <= 3
      ? `🧪 **Elixir tier** · **${elixirTierLabel(payload.elixirTier)}** _(mixer — flexible ingredients)_`
      : "";

  const arrangedBy = `📇 **Arranged by** · <@${payload.requesterDiscordId}>${
    payload.requesterUsername ? ` _(${payload.requesterUsername})_` : ""
  }`;

  const descParts: string[] = [];

  descParts.push(`🧾 **Recipe**`);
  descParts.push(`↳ *${payload.craftItemName}*`);
  descParts.push("");
  descParts.push(`👤 **For OC** · **${payload.requesterCharacterName}**`);
  descParts.push(arrangedBy);
  descParts.push("");
  descParts.push("— — — — — —");
  descParts.push("");

  if (payload.targetMode === "specific" && payload.targetCharacterName) {
    descParts.push(`🎯 **Named artisan**`);
    const loc = payload.targetCharacterHomeVillage?.trim()
      ? ` · _${payload.targetCharacterHomeVillage.trim()}_`
      : "";
    descParts.push(`↳ **${payload.targetCharacterName.trim()}**${loc}`);
    if (payload.targetOwnerDiscordId?.trim()) {
      descParts.push(`↳ <@${payload.targetOwnerDiscordId.trim()}>`);
    }
  } else {
    descParts.push(`🌐 **Open commission**`);
    descParts.push(
      `↳ _${formatOpenCommissionSeekingLine(
        payload.craftingJobsSnapshot,
        payload.staminaToCraftSnapshot
      )}_`
    );
  }

  descParts.push("");
  descParts.push(`⚒️ **Trade** · ${jobsLine}`);
  descParts.push(
    `⚡ **Effort** · **${payload.staminaToCraftSnapshot}** stamina _· recipe base_`
  );
  descParts.push("");
  descParts.push("— — — — — —");
  descParts.push("");
  descParts.push(`📦 **Materials**`);
  descParts.push(materialsLine);
  if (materialsNotes) {
    descParts.push(`↳ ${materialsNotes}`);
  }
  if (offerLine) {
    descParts.push("");
    descParts.push(`🎁 **Offer**`);
    descParts.push(`↳ ${offerLine}`);
  }
  if (elixirTierLine) {
    descParts.push("");
    descParts.push(elixirTierLine);
  }

  descParts.push("");
  descParts.push(`🔗 **[Open the workshop board →](${boardUrl})**`);

  let description = descParts.join("\n");
  if (description.length > 4096) {
    description = `${description.slice(0, 4092)}…`;
  }

  const embedTitleFinal = embedTitle.slice(0, 256);

  const bannerUrl = hashPick(payload.requestId, CRAFT_BOARD_IMAGES);
  const thumbUrl = discordEmbedImageUrl(payload.craftItemImage);
  const authorIcon = discordEmbedImageUrl(payload.requesterCharacterIcon);
  const artisanIcon = discordEmbedImageUrl(payload.targetCharacterIcon);

  const authorName = payload.requesterCharacterName.trim().slice(0, 256);
  const author: Record<string, unknown> = { name: authorName || "Commissioner" };
  if (authorIcon) author.icon_url = authorIcon;

  const jobsShort =
    payload.craftingJobsSnapshot.length > 0 ? payload.craftingJobsSnapshot.join(", ") : "crafters";

  let footerText: string;
  let footerIcon: string | undefined;
  if (payload.targetMode === "specific" && payload.targetCharacterName?.trim()) {
    const nv = [
      payload.targetCharacterName.trim(),
      payload.targetCharacterHomeVillage?.trim() || "",
    ].filter(Boolean);
    footerText = `Named artisan · ${nv.join(" · ")}`.slice(0, 2048);
    footerIcon = artisanIcon;
  } else {
    const who = payload.requesterCharacterName.trim();
    footerText = (
      who
        ? `Open commission · ${who} · seeking ${jobsShort}`
        : `Open commission · seeking ${jobsShort}`
    ).slice(0, 2048);
    footerIcon = authorIcon;
  }

  const footer: Record<string, unknown> = {
    text: `🪵 ${footerText}`.slice(0, 2048),
  };
  if (footerIcon) footer.icon_url = footerIcon;

  const embed: Record<string, unknown> = {
    title: embedTitleFinal,
    description,
    color: EMBED_COLOR,
    timestamp: new Date().toISOString(),
    image: { url: bannerUrl },
    author,
    footer,
  };

  if (thumbUrl) {
    embed.thumbnail = { url: thumbUrl };
  }

  return {
    content: buildCraftingBoardPingContent(payload),
    embeds: [embed],
  };
}

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

  const body = buildCraftingRequestBoardMessage(payload);
  const result = await discordApiRequest<{ id: string }>(
    `channels/${COMMUNITY_BOARD_CHANNEL_ID}/messages`,
    "POST",
    body
  );

  return result?.id ?? null;
}

/** Update an existing board message after the requester edits the commission. */
export async function syncCraftingRequestBoardMessage(
  discordMessageId: string,
  payload: CraftingRequestNotifyPayload
): Promise<boolean> {
  if (!COMMUNITY_BOARD_CHANNEL_ID || !discordMessageId?.trim()) {
    return false;
  }
  const { content, embeds: built } = buildCraftingRequestBoardMessage(payload, EMBED_TITLE_UPDATED);
  const embeds = built;
  const result = await discordApiRequest(
    `channels/${COMMUNITY_BOARD_CHANNEL_ID}/messages/${discordMessageId.trim()}`,
    "PATCH",
    { content, embeds }
  );
  return result !== null;
}

/** Remove the board message when the requester deletes the commission. */
export async function deleteCraftingRequestBoardMessage(discordMessageId: string): Promise<boolean> {
  if (!COMMUNITY_BOARD_CHANNEL_ID || !discordMessageId?.trim()) {
    return false;
  }
  return discordApiDelete(
    `channels/${COMMUNITY_BOARD_CHANNEL_ID}/messages/${discordMessageId.trim()}`
  );
}

export type CraftingRequestAcceptedNotifyOptions = {
  requestId: string;
  requesterDiscordId: string;
  acceptorDiscordId: string;
  acceptorCharacterName: string;
  craftItemName: string;
  requesterCharacterName?: string;
  paymentOffer?: string;
  craftItemImage?: string;
};

/** Rich “accepted” post for the community board channel (pings + embed). */
export function buildCraftingRequestAcceptedMessage(
  opts: CraftingRequestAcceptedNotifyOptions
): { content: string; embeds: Record<string, unknown>[] } {
  const rid = opts.requesterDiscordId.trim();
  const aid = opts.acceptorDiscordId.trim();
  const content = `<@${rid}> <@${aid}>`;

  const forOc = (opts.requesterCharacterName ?? "").trim() || "Commissioner";

  const lines: string[] = [
    `🧾 **Recipe**`,
    `↳ *${opts.craftItemName}*`,
    "",
    `⚒️ **Crafter OC** · **${opts.acceptorCharacterName}**`,
    `↳ <@${aid}>`,
    "",
    `👤 **For OC** · **${forOc}**`,
    `↳ <@${rid}>`,
    "",
    "— — — — — —",
    "",
    `🤝 **Trade & payment**`,
    `Please **trade** or **gift** (through the bot) any **materials**, **crafted items**, and **payment** you agreed on—match what was listed on the workshop post and in the notes.`,
  ];

  if (opts.paymentOffer?.trim()) {
    lines.push("");
    lines.push(`💰 **Offer on the post**`);
    lines.push(`↳ ${clip(opts.paymentOffer.trim(), 280)}`);
  }

  lines.push("");
  lines.push("_Happy crafting!_");

  let description = lines.join("\n");
  if (description.length > 4096) {
    description = `${description.slice(0, 4092)}…`;
  }

  const bannerUrl = hashPick(opts.requestId || "accept", CRAFT_BOARD_IMAGES);
  const thumbUrl = discordEmbedImageUrl(opts.craftItemImage);

  const embed: Record<string, unknown> = {
    title: "✅ Workshop commission accepted",
    description,
    color: EMBED_COLOR,
    timestamp: new Date().toISOString(),
    image: { url: bannerUrl },
    footer: { text: "🪵 Tinglebot · Workshop board" },
  };
  if (thumbUrl) {
    embed.thumbnail = { url: thumbUrl };
  }

  return { content, embeds: [embed] };
}

export async function notifyCraftingRequestAccepted(
  options: CraftingRequestAcceptedNotifyOptions
): Promise<void> {
  if (!COMMUNITY_BOARD_CHANNEL_ID) return;

  const body = buildCraftingRequestAcceptedMessage(options);
  await discordApiRequest(`channels/${COMMUNITY_BOARD_CHANNEL_ID}/messages`, "POST", body);
}
