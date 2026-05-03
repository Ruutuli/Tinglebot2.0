import { discordApiDelete, discordApiRequest } from "@/lib/discord";
import { getPublicAppUrl } from "@/lib/config";
import { formatOpenCommissionSeekingLine } from "@/lib/crafting-request-helpers";
import { elixirTierLabel, isMixerOutputElixirName } from "@/lib/elixir-catalog";

const COMMUNITY_BOARD_CHANNEL_ID =
  process.env.COMMUNITY_BOARD_CHANNEL_ID || "651614266046152705";

const EMBED_COLOR = 0x5d8aa8;

const GCS_PUBLIC_BASE = "https://storage.googleapis.com/tinglebot";

/** Standard embed border (match bot `border.png` — not village / ROTW bottom borders). */
const CRAFT_BOARD_BORDER_URL = `${GCS_PUBLIC_BASE}/Graphics/border.png`;

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

/** Resolve `JOB_*` snowflake (same keys as `bot/utils/memberJobRolesSync.js`). */
function jobRoleIdFromEnv(jobName: string): string | null {
  const key = jobNameToRoleEnvKey(jobName.trim());
  const raw = process.env[key];
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id || !DISCORD_SNOWFLAKE.test(id)) return null;
  return id;
}

function roleMentionFromJobName(jobName: string): string | null {
  const id = jobRoleIdFromEnv(jobName);
  return id ? `<@&${id}>` : null;
}

/** Role IDs for Discord `allowed_mentions.roles` (open commissions). */
function jobRoleIdsFromSnapshot(jobs: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const job of jobs ?? []) {
    const id = jobRoleIdFromEnv(job);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Recipe job roles + optional Artist role (`JOB_ARTIST`) for open-call commissions. */
function openCommissionPingRoleIds(jobs: string[] | undefined): string[] {
  const out = jobRoleIdsFromSnapshot(jobs);
  const seen = new Set(out);
  const artistId = jobRoleIdFromEnv("Artist");
  if (artistId && !seen.has(artistId)) {
    seen.add(artistId);
    out.push(artistId);
  }
  return out;
}

/**
 * Ping recipe job roles (+ Artist) when the commission is not locked to one named crafter.
 * Open board posts, or "specific" rows missing a resolved target owner, behave like an open call.
 */
function isOpenCallForJobPings(payload: CraftingRequestNotifyPayload): boolean {
  const mode = String(payload.targetMode ?? "").toLowerCase();
  if (mode === "open") return true;
  if (mode === "specific") {
    return !payload.targetOwnerDiscordId?.trim();
  }
  return true;
}

/**
 * Discord strips pings unless `allowed_mentions` permits them.
 * Use explicit `users` / `roles` snowflake arrays (same IDs as in message `content`).
 */
function allowedMentionsForBoardMessage(payload: CraftingRequestNotifyPayload): Record<string, unknown> {
  const userIds: string[] = [];
  const pushUser = (id: string | undefined) => {
    const t = id?.trim();
    if (t && DISCORD_SNOWFLAKE.test(t)) userIds.push(t);
  };
  pushUser(payload.requesterDiscordId);
  if (
    String(payload.targetMode ?? "").toLowerCase() === "specific" &&
    payload.targetOwnerDiscordId?.trim()
  ) {
    const tid = payload.targetOwnerDiscordId.trim();
    if (tid !== payload.requesterDiscordId) pushUser(tid);
  }
  const roleIds = isOpenCallForJobPings(payload)
    ? openCommissionPingRoleIds(payload.craftingJobsSnapshot)
    : [];

  const out: Record<string, unknown> = {};
  if (userIds.length > 0) out.users = userIds;
  if (roleIds.length > 0) out.roles = roleIds;
  return out;
}

export type CraftingRequestNotifyPayload = {
  requestId: string;
  /** Public workshop code (e.g. K384521); falls back to requestId in copy when absent */
  commissionID?: string;
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
  /** Lines from the catalog recipe (`Item.craftingMaterial`) for the board embed. */
  recipeMaterials: Array<{ itemName: string; quantity: number }>;
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
 * open calls (no locked artisan) also ping `JOB_*` roles for each recipe job (+ Artist when configured).
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

  const namedSpecific =
    String(payload.targetMode ?? "").toLowerCase() === "specific" && payload.targetOwnerDiscordId?.trim();

  if (namedSpecific) {
    const tid = payload.targetOwnerDiscordId!.trim();
    if (tid !== payload.requesterDiscordId) {
      parts.push(`<@${tid}>`);
    }
  } else if (isOpenCallForJobPings(payload)) {
    pushJobRoles();
    const artistMention = roleMentionFromJobName("Artist");
    if (artistMention && !parts.includes(artistMention)) {
      parts.push(artistMention);
    }
  }

  return parts.join(" ");
}

/**
 * Clickable slash mention when `DISCORD_COMMAND_ID_CRAFTING` is set (guild command id for `/crafting` from Discord).
 * Register the same env on the dashboard as the bot so pings/embeds stay valid after redeploys.
 */
function craftingAcceptSlashMention(): string {
  const raw = process.env.DISCORD_COMMAND_ID_CRAFTING?.trim();
  if (raw && DISCORD_SNOWFLAKE.test(raw)) {
    return `</crafting accept:${raw}>`;
  }
  return "/crafting accept";
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
  allowed_mentions: Record<string, unknown>;
} {
  const publicBase = getPublicAppUrl().replace(/\/$/, "");
  const boardUrl = `${publicBase}/crafting-requests`;

  const mongoRequestId = (payload.requestId ?? "").trim();
  const commissionCode = (payload.commissionID ?? "").trim();
  const publicIdForEmbed = (commissionCode || mongoRequestId).trim();
  const idPlaceholder = publicIdForEmbed || "<request id>";

  const jobsLine =
    payload.craftingJobsSnapshot.length > 0
      ? payload.craftingJobsSnapshot.join(" · ")
      : "—";

  const materialsLine = payload.providingAllMaterials
    ? "✅ Commissioner brings **everything** listed for this recipe."
    : "⚠️ Not all materials in hand yet — see notes below.";

  const recipeMaterialLines = (payload.recipeMaterials ?? [])
    .filter((m) => m.itemName?.trim() && Number(m.quantity) > 0)
    .map((m) => {
      const q = Number(m.quantity);
      const qtyStr = !Number.isFinite(q) ? "?" : Number.isInteger(q) ? String(q) : String(q);
      return `↳ **${qtyStr}×** ${m.itemName.trim()}`;
    });

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

  descParts.push(`🔖 **Commission ID** · \`${idPlaceholder}\``);
  descParts.push("");
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
  if (recipeMaterialLines.length > 0) {
    const maxLines = 25;
    for (let i = 0; i < Math.min(recipeMaterialLines.length, maxLines); i++) {
      descParts.push(recipeMaterialLines[i]!);
    }
    if (recipeMaterialLines.length > maxLines) {
      descParts.push(
        `↳ _…and ${recipeMaterialLines.length - maxLines} more (open the board for the full list)._`
      );
    }
  }
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

  /** Deep-link opens this row on the workshop page (`?request=`). */
  const commissionBoardUrl = publicIdForEmbed
    ? `${boardUrl}?request=${encodeURIComponent(publicIdForEmbed)}`
    : boardUrl;

  const slashMention = craftingAcceptSlashMention();

  descParts.push("");
  descParts.push("🧭 **How to accept**");
  descParts.push(`↳ **Web:** [Open on the website](${commissionBoardUrl})`);
  descParts.push(
    `↳ **Discord:** ${slashMention} — set **request_id** to \`${idPlaceholder}\` and **charactername** to your crafter OC.`
  );
  descParts.push(`↳ [All open commissions](${boardUrl})`);

  let description = descParts.join("\n");
  if (description.length > 4096) {
    description = `${description.slice(0, 4092)}…`;
  }

  const embedTitleFinal = embedTitle.slice(0, 256);

  const bannerUrl = CRAFT_BOARD_BORDER_URL;
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
    text: `🪵 ${footerText} · ${idPlaceholder}`.slice(0, 2048),
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
    allowed_mentions: allowedMentionsForBoardMessage(payload),
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
  if (
    isOpenCallForJobPings(payload) &&
    (payload.craftingJobsSnapshot?.length ?? 0) > 0 &&
    jobRoleIdsFromSnapshot(payload.craftingJobsSnapshot).length === 0
  ) {
    console.warn(
      "[craftingRequestsNotify] Open commission has recipe jobs but no JOB_* role IDs resolved — add e.g. JOB_ARTIST=<role snowflake> to the dashboard env (same as the bot)."
    );
  }
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
  const { content, embeds: built, allowed_mentions } = buildCraftingRequestBoardMessage(
    payload,
    EMBED_TITLE_UPDATED
  );
  const embeds = built;
  const result = await discordApiRequest(
    `channels/${COMMUNITY_BOARD_CHANNEL_ID}/messages/${discordMessageId.trim()}`,
    "PATCH",
    { content, embeds, allowed_mentions }
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
  /** Public code (K + 6 digits) when the row has one */
  commissionID?: string;
  requesterDiscordId: string;
  acceptorDiscordId: string;
  acceptorCharacterName: string;
  craftItemName: string;
  requesterCharacterName?: string;
  paymentOffer?: string;
  craftItemImage?: string;
  /** Aggregated recipe materials removed from the commissioner OC */
  materialsUsed?: Array<{ itemName: string; quantity: number }>;
  crafterStaminaBefore?: number | null;
  crafterStaminaAfter?: number | null;
  crafterStaminaUsed?: number | null;
  teacherCharacterName?: string;
  teacherStaminaBefore?: number | null;
  teacherStaminaAfter?: number | null;
  teacherStaminaUsed?: number | null;
  /** Character `icon` (commissioner OC) — public URL for embed author */
  requesterCharacterIcon?: string;
  /** Character `icon` (crafter / acceptor OC) — public URL for embed footer */
  acceptorCharacterIcon?: string;
};

/** Rich “accepted” post for the community board channel (pings + embed). */
export function buildCraftingRequestAcceptedMessage(
  opts: CraftingRequestAcceptedNotifyOptions
): { content: string; embeds: Record<string, unknown>[] } {
  const rid = opts.requesterDiscordId.trim();
  const aid = opts.acceptorDiscordId.trim();
  const content = `<@${rid}> <@${aid}>`;

  const forOc = (opts.requesterCharacterName ?? "").trim() || "Commissioner";

  const mongoRef = (opts.requestId ?? "").trim();
  const pubCode = (opts.commissionID ?? "").trim();
  const acceptIdDisplay = (pubCode || mongoRef).trim() || "—";

  const lines: string[] = [
    `🔖 **Commission ID** · \`${acceptIdDisplay}\``,
    "",
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
    `📦 **Items used**`,
  ];

  const mats = opts.materialsUsed ?? [];
  const maxMatLines = 18;
  if (mats.length > 0) {
    for (const m of mats.slice(0, maxMatLines)) {
      const q = Math.max(0, Math.round(Number(m.quantity) || 0));
      const label = String(m.itemName ?? "").trim() || "—";
      lines.push(`↳ **${q}×** ${label}`);
    }
    if (mats.length > maxMatLines) {
      lines.push(`↳ _…and ${mats.length - maxMatLines} more._`);
    }
  } else {
    lines.push(`↳ _No line-item breakdown returned — materials were still consumed from the commissioner._`);
  }

  lines.push("");
  lines.push(`⚡ **Stamina**`);
  const craftOc = opts.acceptorCharacterName.trim() || "Crafter";
  if (
    opts.crafterStaminaBefore != null &&
    opts.crafterStaminaAfter != null &&
    Number.isFinite(opts.crafterStaminaBefore) &&
    Number.isFinite(opts.crafterStaminaAfter)
  ) {
    const used =
      opts.crafterStaminaUsed != null && Number.isFinite(opts.crafterStaminaUsed)
        ? Math.max(0, Math.round(Number(opts.crafterStaminaUsed)))
        : Math.max(
            0,
            Math.round(Number(opts.crafterStaminaBefore) - Number(opts.crafterStaminaAfter))
          );
    lines.push(
      `↳ **${craftOc}**'s stamina · ${Math.round(Number(opts.crafterStaminaBefore))} → ${Math.round(Number(opts.crafterStaminaAfter))} _(used ${used} stamina)_`
    );
  } else {
    lines.push(`↳ **${craftOc}** — stamina was deducted when the craft completed.`);
  }

  if (
    opts.teacherCharacterName?.trim() &&
    opts.teacherStaminaBefore != null &&
    opts.teacherStaminaAfter != null &&
    Number.isFinite(opts.teacherStaminaBefore) &&
    Number.isFinite(opts.teacherStaminaAfter)
  ) {
    const tu =
      opts.teacherStaminaUsed != null && Number.isFinite(opts.teacherStaminaUsed)
        ? Math.max(0, Math.round(Number(opts.teacherStaminaUsed)))
        : Math.max(
            0,
            Math.round(Number(opts.teacherStaminaBefore) - Number(opts.teacherStaminaAfter))
          );
    const tn = opts.teacherCharacterName.trim();
    lines.push(
      `↳ **${tn}** (Teacher) stamina · ${Math.round(Number(opts.teacherStaminaBefore))} → ${Math.round(Number(opts.teacherStaminaAfter))} _(used ${tu} stamina)_`
    );
  }

  lines.push("");
  lines.push(`💰 **Payment**`);
  lines.push(
    `↳ Send any agreed **payment** with the **gift** command (through the bot)—match what was listed on the workshop post and in the notes.`
  );

  if (opts.paymentOffer?.trim()) {
    lines.push("");
    lines.push(`💰 **Offer on the post**`);
    lines.push(`↳ ${clip(opts.paymentOffer.trim(), 280)}`);
  }

  let description = lines.join("\n");
  if (description.length > 4096) {
    description = `${description.slice(0, 4092)}…`;
  }

  const bannerUrl = CRAFT_BOARD_BORDER_URL;
  const thumbUrl = discordEmbedImageUrl(opts.craftItemImage);
  const requesterIconUrl = discordEmbedImageUrl(opts.requesterCharacterIcon);
  const acceptorIconUrl = discordEmbedImageUrl(opts.acceptorCharacterIcon);

  const authorName = forOc.slice(0, 256) || "Commissioner";
  const author: Record<string, unknown> = { name: authorName };
  if (requesterIconUrl) author.icon_url = requesterIconUrl;

  const crafterLabel = opts.acceptorCharacterName.trim() || "Crafter";
  const footer: Record<string, unknown> = {
    text: `🪵 ${crafterLabel} · crafter · ${acceptIdDisplay}`.slice(0, 2048),
  };
  if (acceptorIconUrl) footer.icon_url = acceptorIconUrl;

  const embed: Record<string, unknown> = {
    title: "✅ Workshop commission accepted",
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

  return { content, embeds: [embed] };
}

export async function notifyCraftingRequestAccepted(
  options: CraftingRequestAcceptedNotifyOptions
): Promise<void> {
  if (!COMMUNITY_BOARD_CHANNEL_ID) return;

  const body = buildCraftingRequestAcceptedMessage(options);
  await discordApiRequest(`channels/${COMMUNITY_BOARD_CHANNEL_ID}/messages`, "POST", body);
}
