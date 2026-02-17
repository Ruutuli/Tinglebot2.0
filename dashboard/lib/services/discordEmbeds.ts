// ============================================================================
// ------------------- Discord Embed Builders -------------------
// Centralized embed builders for character review process
// ============================================================================

import { getAppUrl } from "@/lib/config";

type CharacterData = {
  _id: unknown;
  userId: string;
  name: string;
  pronouns?: string;
  age?: number | null;
  height?: number | null;
  race?: string;
  homeVillage?: string;
  job?: string;
  applicationVersion?: number;
  publicSlug?: string | null;
  appLink?: string;
  icon?: string;
  appArt?: string;
  maxHearts?: number;
  currentHearts?: number;
  maxStamina?: number;
  currentStamina?: number;
  attack?: number;
  defense?: number;
  gearWeapon?: { name: string };
  gearShield?: { name: string };
  gearArmor?: {
    head?: { name: string };
    chest?: { name: string };
    legs?: { name: string };
  };
};

type VoteCounts = {
  approveCount: number;
  needsChangesCount: number;
};

type FeedbackEntry = {
  modId: string;
  modUsername: string;
  text: string;
  createdAt: Date;
};

const APP_URL = getAppUrl();

/**
 * Format height from cm to cm and feet/inches
 */
function formatHeight(height: number | null | undefined): string {
  if (!height) return "Not specified";
  const cm = height;
  const feet = Math.floor(cm / 30.48);
  const inches = Math.round((cm % 30.48) / 2.54);
  return `${cm} cm (${feet}' ${inches}")`;
}

/**
 * Get village emoji
 */
function getVillageEmoji(village: string | undefined): string {
  if (!village) return "";
  const villageLower = village.toLowerCase();
  if (villageLower.includes("inariko")) return "🌊";
  if (villageLower.includes("rudania")) return "🔥";
  if (villageLower.includes("vhintl")) return "🌿";
  return "";
}

/**
 * Build application review embed for admin channel
 */
export function buildApplicationEmbed(
  character: CharacterData,
  voteCounts: VoteCounts
): {
  title: string;
  description?: string;
  thumbnail?: { url: string };
  image?: { url: string };
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
} {
  const version = character.applicationVersion ?? 1;
  const characterId = String(character._id);
  
  // Build OC page URL
  const ocPageUrl = character.publicSlug
    ? `${APP_URL}/characters/${character.publicSlug}`
    : `${APP_URL}/characters/${characterId}`;
  
  // Review link (approva.ls)
  const approvalUrl = process.env.APPROVA_LS_URL || "https://approva.ls";

  // Format village with emoji
  const villageEmoji = getVillageEmoji(character.homeVillage);
  const villageDisplay = character.homeVillage 
    ? `${villageEmoji} ${character.homeVillage}`
    : "Not specified";

  // Format gear
  const weaponName = character.gearWeapon?.name || "None";
  const shieldName = character.gearShield?.name || "None";
  const chestName = character.gearArmor?.chest?.name || "None";
  const legsName = character.gearArmor?.legs?.name || "None";

  // Format stats
  const hearts = `${character.currentHearts ?? character.maxHearts ?? 0}/${character.maxHearts ?? 0}`;
  const stamina = `${character.currentStamina ?? character.maxStamina ?? 0}/${character.maxStamina ?? 0}`;
  const attack = character.attack ?? 0;
  const defense = character.defense ?? 0;

  // Build embed with thumbnail (icon) and image (appArt)
  const embed: {
    title: string;
    description?: string;
    thumbnail?: { url: string };
    image?: { url: string };
    fields: Array<{
      name: string;
      value: string;
      inline?: boolean;
    }>;
  } = {
    title: `✨ New Character Created: ${character.name}`,
    description: "A new character has been submitted and is awaiting moderation review.",
    fields: [
      {
        name: "👤 Character Information",
        value: [
          `**Name:** ${character.name}`,
          character.pronouns ? `**Pronouns:** ${character.pronouns}` : "",
          character.age !== null && character.age !== undefined ? `**Age:** ${character.age}` : "",
          character.height !== null && character.height !== undefined ? `**Height:** ${formatHeight(character.height)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        inline: false,
      },
      {
        name: "🏘️ Location & Job",
        value: [
          character.race ? `**Race:** ${character.race}` : "",
          `**Home Village:** ${villageDisplay}`,
          character.job ? `**Job:** ${character.job}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        inline: false,
      },
      {
        name: "❤️ Stats",
        value: [
          `**Hearts:** ${hearts}`,
          `**Stamina:** ${stamina}`,
          `**Attack:** ${attack}`,
          `**Defense:** ${defense}`,
        ]
          .filter(Boolean)
          .join("\n"),
        inline: false,
      },
      {
        name: "⚔️ Starting Gear",
        value: [
          `🗡️ **Weapon:** ${weaponName}`,
          `🛡️ **Shield:** ${shieldName}`,
          `👕 **Chest:** ${chestName}`,
          `👖 **Legs:** ${legsName}`,
        ]
          .filter(Boolean)
          .join("\n"),
        inline: false,
      },
      {
        name: "🔗 Links",
        value: [
          `📋 [View Application](${ocPageUrl})`,
          `⚖️ [Review on approva.ls](${approvalUrl})`,
        ]
          .filter(Boolean)
          .join("\n"),
        inline: false,
      },
    ],
  };

  // Add thumbnail (icon) if available
  if (character.icon) {
    embed.thumbnail = { url: character.icon };
  }

  // Add image (appArt) if available
  if (character.appArt) {
    embed.image = { url: character.appArt };
  }

  return embed;
}

/**
 * Build needs changes DM embed
 */
export function buildNeedsChangesDMEmbed(
  character: CharacterData,
  feedback: FeedbackEntry[]
): {
  title: string;
  description: string;
  color: number;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
} {
  const characterId = String(character._id);
  const ocPageUrl = character.publicSlug
    ? `${APP_URL}/characters/${character.publicSlug}`
    : `${APP_URL}/characters/${characterId}`;

  // Combine all feedback (without mod usernames)
  const feedbackText = feedback
    .map((f) => f.text)
    .join("\n\n");

  return {
    title: "⚠️ Character Needs Changes",
    description: `Your character **${character.name}** needs some changes before it can be approved.\n\n**📝 MODERATOR FEEDBACK:**\n\n${feedbackText}`,
    color: 0xffa500, // Orange
    fields: [
      {
        name: "✏️ Next Steps",
        value: `Please review the feedback above and make the necessary changes to your character.\n\nOnce you've made the changes, you can resubmit your character for review.\n\n[Edit Character](${ocPageUrl})`,
        inline: false,
      },
    ],
    footer: {
      text: "💬 If you need to discuss any of the changes, please reach out to the roots.admin discord account!",
    },
  };
}

/**
 * Build approved DM embed
 */
export function buildApprovedDMEmbed(character: CharacterData): {
  title: string;
  description: string;
  color: number;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
} {
  const characterId = String(character._id);
  const ocPageUrl = character.publicSlug
    ? `${APP_URL}/characters/${character.publicSlug}`
    : `${APP_URL}/characters/${characterId}`;

  return {
    title: "Character Approved!",
    description: `Your character **${character.name}** has been approved and is now active!`,
    color: 0x4caf50, // Green
    fields: [
      {
        name: "Congratulations!",
        value: "Your character is now part of the Tinglebot world!",
        inline: false,
      },
      {
        name: "Next Steps",
        value: APPROVED_NEXT_STEPS,
        inline: false,
      },
      {
        name: "View Your Character",
        value: `[Open OC Page](${ocPageUrl})`,
        inline: false,
      },
    ],
  };
}

/**
 * Build approval channel embed (public announcement)
 */
export function buildApprovalChannelEmbed(character: CharacterData): {
  title: string;
  description: string;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
} {
  return {
    title: `✅ Character Accepted: ${character.name}`,
    description: `Your character **${character.name}** has been accepted and is now active!`,
    fields: [
      {
        name: "👤 Character Details",
        value: [
          `**Name:** ${character.name}`,
          character.race ? `**Race:** ${character.race}` : "",
          character.homeVillage ? `**Village:** ${character.homeVillage}` : "",
          character.job ? `**Job:** ${character.job}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        inline: false,
      },
      {
        name: "📝 Next Steps",
        value: APPROVED_NEXT_STEPS,
        inline: false,
      },
    ],
  };
}

/** Next steps text shown everywhere a member is told their character is approved */
export const APPROVED_NEXT_STEPS =
  "You may post your character in **#roster** according to the format below!\n\n" +
  "`Name | Race | Village | Virtue | Job`\n" +
  "<link to app>\n\n" +
  "A mod will then assign you the **Resident** role. Now, go to the **#roles** channel to pick the roles for your pronoun(s), and arrange your server nickname as follows:\n" +
  "▹ Your Name | OC Name(s)";

/**
 * Build decision channel notification embed
 */
export function buildDecisionChannelEmbed(
  decision: "needs_changes" | "approved"
): {
  title: string;
  description: string;
  color: number;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
} {
  const dashboardUrl = `${APP_URL}/profile?tab=notifications`;
  const emoji = decision === "approved" ? "✅" : "⚠️";
  const decisionText = decision === "approved" ? "approved" : "needs changes";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "📋 View Details",
      value: `[Check Dashboard Notifications](${dashboardUrl})\n\nYour character has been **${decisionText}**. Check your DMs or dashboard notifications for more information.`,
      inline: false,
    },
  ];

  if (decision === "approved") {
    fields.push({
      name: "📝 Next Steps",
      value: APPROVED_NEXT_STEPS,
      inline: false,
    });
  }

  return {
    title: `${emoji} OC Decision Update`,
    description: `There has been a decision made on your OC. Go to notifications on dashboard or see DMs for more info.`,
    color: decision === "approved" ? 0x4caf50 : 0xffa500, // Green for approved, Orange for needs changes
    fields,
  };
}
