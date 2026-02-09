const { SlashCommandBuilder, PermissionFlagsBits } = require("@discordjs/builders");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const logger = require('@/utils/logger');
const Quest = require('@/models/QuestModel');
const Character = require('@/models/CharacterModel');
const User = require('@/models/UserModel');
const { 
    BORDER_IMAGE, 
    QUEST_CHANNEL_ID, 
    QUEST_COLORS, 
    QUEST_TYPES, 
    RP_SIGNUP_WINDOW_DAYS,
    createBaseEmbed, 
    addQuestInfoFields,
    validateRPQuestVillage,
    validateQuestParticipation,
    validateQuestTypeRules,
    extractVillageFromLocation,
    formatQuestRules,
    formatLocationText,
    formatSignupDeadline
} = require("../../modules/questRewardModule");

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

// Embed update queue to prevent race conditions
const embedUpdateQueue = new Map(); // questID -> { isUpdating: boolean, pendingUpdates: Array }
const updateTimeouts = new Map(); // questID -> timeout

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================
module.exports = {
 data: new SlashCommandBuilder()
  .setName("quest")
  .setDescription("Quest participation system - join, submit, and manage your quest participation!")
  .addSubcommand(subcommand =>
   subcommand
    .setName("join")
    .setDescription("Join a quest with your character")
    .addStringOption(option =>
     option
      .setName("questid")
      .setDescription("The ID of the quest you want to join")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption(option =>
     option
      .setName("charactername")
      .setDescription("The name of your character")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand(subcommand =>
   subcommand
    .setName("leave")
    .setDescription("Leave a quest you are currently participating in")
    .addStringOption(option =>
     option
      .setName("questid")
      .setDescription("The ID of the quest you want to leave")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand(subcommand =>
   subcommand
    .setName("list")
    .setDescription("List all active quests from the quest board")
  )
  .addSubcommand(subcommand =>
   subcommand
    .setName("status")
    .setDescription("Check your current quest participation status")
  )
.addSubcommand(subcommand =>
 subcommand
  .setName("transfer")
  .setDescription("Transfer your legacy quest totals into the system")
  .addIntegerOption(option =>
   option
    .setName("total")
    .setDescription("Total number of legacy quests you completed")
    .setRequired(true)
    .setMinValue(0)
  )
  .addIntegerOption(option =>
   option
    .setName("pending")
    .setDescription("How many of those legacy quests are still unredeemed")
    .setRequired(true)
    .setMinValue(0)
  )
)
  .addSubcommand(subcommand =>
   subcommand
    .setName("turnin")
    .setDescription("Exchange 10 completed quests for a special reward")
    .addStringOption(option =>
     option
      .setName("reward")
      .setDescription("Choose the reward you want to receive")
      .setRequired(true)
      .addChoices(
       { name: "Character Slot", value: "character_slot" },
       { name: "Spirit Orb", value: "spirit_orb" }
      )
    )
    .addStringOption(option =>
     option
      .setName("character")
      .setDescription("Character receiving the Spirit Orb (required for Spirit Orb rewards)")
      .setAutocomplete(true)
    )
  )
  .addSubcommand(subcommand =>
   subcommand
    .setName("stats")
    .setDescription("View your quest completion stats")
  )
  .addSubcommand(subcommand =>
   subcommand
    .setName("postcount")
    .setDescription("Display post counts for all participants in an RP quest")
    .addStringOption(option =>
     option
      .setName("questid")
      .setDescription("ID of the RP quest to check post counts for")
      .setRequired(true)
      .setAutocomplete(true)
    )
  ),

 // ============================================================================
 // ------------------- Main Command Handler -------------------
 // ============================================================================
 async execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  try {
   const handlers = {
    join: () => this.handleJoinQuest(interaction),
    leave: () => this.handleLeaveQuest(interaction),
    list: () => this.handleListQuests(interaction),
    status: () => this.handleQuestStatus(interaction),
   turnin: () => this.handleQuestTurnIn(interaction),
   transfer: () => this.handleLegacyQuestTransfer(interaction),
   stats: () => this.handleQuestStats(interaction),
    postcount: () => this.handlePostCount(interaction)
   };

   const handler = handlers[subcommand];
   if (handler) {
    await handler();
   } else {
    await interaction.reply({
     content: "[quest.js]❌ Unknown subcommand.",
     flags: MessageFlags.Ephemeral,
    });
   }
  } catch (error) {
   await handleInteractionError(error, interaction, {
    source: 'quest.js',
    subcommand: interaction.options?.getSubcommand()
   });
  }
 },

 // ============================================================================
 // ------------------- Quest Join Handler -------------------
 // ============================================================================
 async handleJoinQuest(interaction) {
  const { characterName, questID, userID, userName } = this.extractJoinData(interaction);

  // Validate all requirements
  const validationResult = await this.performJoinValidations(interaction, questID, characterName, userID);
  if (!validationResult.success) return;

  const { quest, character } = validationResult;

  // Process quest join
  await this.processQuestJoin(interaction, quest, userID, characterName);

  // Handle RP quest specific requirements
  if (quest.questType.toLowerCase() === 'rp') {
   await this.handleRPQuestJoin(quest, character);
  }

  await quest.save();

  // Update quest embed and send response
  await this.updateQuestEmbed(interaction.guild, quest, interaction.client, 'questJoin');
  await this.addUserToRPThread(interaction, quest, userID, userName);

  const voucherUsed = await this.handleQuestVoucherUsage(interaction, quest, userID);
  const successEmbed = this.createSuccessEmbed(quest, characterName, userName, character, voucherUsed);
  return interaction.reply({ embeds: [successEmbed] });
 },

 // ============================================================================
 // ------------------- Quest Leave Handler -------------------
 // ============================================================================
 async handleLeaveQuest(interaction) {
  const questID = interaction.options.getString("questid");
  const userID = interaction.user.id;

  // Validate quest and participation
  const validationResult = await this.validateLeaveRequest(interaction, questID, userID);
  if (!validationResult.success) return;

  const { quest, characterName } = validationResult;

  // Process quest leave
  await this.processQuestLeave(interaction, quest, userID);

  // Update quest embed
  await this.updateQuestEmbed(interaction.guild, quest, interaction.client, 'questLeave');

  // Send response
  const leaveMessage = this.createLeaveMessage(quest, characterName);
  return interaction.reply({
   content: leaveMessage,
   flags: MessageFlags.Ephemeral,
  });
 },

 // ============================================================================
 // ------------------- Quest List Handler -------------------
 // ============================================================================
 async handleListQuests(interaction) {
  const quests = await Quest.find({ status: "active" }).sort({ date: 1 });

  if (quests.length === 0) {
   return interaction.reply({
    content: "No active quests available.\n\n**About Quests**: Quests are posted on the quest board and are smaller, optional, fun timed tasks that happen every other month! They can be Art, Writing, Interactive, or RP based.",
    flags: MessageFlags.Ephemeral,
   });
  }

  const embed = this.createQuestListEmbed(interaction, quests);
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
 },

 // ============================================================================
 // ------------------- Quest Status Handler -------------------
 // ============================================================================
 async handleQuestStatus(interaction) {
  const userID = interaction.user.id;

  try {
   const userQuests = await this.getUserActiveQuests(userID);
   
   if (userQuests.length === 0) {
    return interaction.reply({
     content: "You are not currently participating in any active quests.\n\nUse `/quest list` to see available quests!",
     flags: MessageFlags.Ephemeral,
    });
   }

   const embed = this.createQuestStatusEmbed(interaction, userQuests, userID);
   return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  } catch (error) {
   logger.error('QUEST', `handleQuestStatus failed; userId=${interaction.user?.id}; ${error.message}`, error);
   return interaction.reply({
    content: "An error occurred while checking your quest status.",
    flags: MessageFlags.Ephemeral,
   });
  }
 },

 // ============================================================================
// ------------------- Quest Stats Handler -------------------
// ============================================================================
 async handleQuestStats(interaction) {
  const targetUser = interaction.user;

  try {
   const userDocument = await User.findOne({ discordId: targetUser.id });

   if (!userDocument) {
    return interaction.reply({
     content: `No quest data found for <@${targetUser.id}>.`,
     flags: MessageFlags.Ephemeral
    });
   }

  const stats = typeof userDocument.getQuestStats === "function"
   ? userDocument.getQuestStats()
   : userDocument.quests || {};

  const totalCompleted = stats.totalCompleted || 0;
  const legacyInfo = stats.legacy || {
   totalTransferred: 0,
   pendingTurnIns: 0,
   transferredAt: null,
   transferUsed: false
  };
  const allTimeTotal = typeof stats.allTimeTotal === "number"
   ? stats.allTimeTotal
   : totalCompleted + (legacyInfo.totalTransferred || 0);
  
  // Use turnInSummary if available (from getQuestStats), otherwise calculate from stats
  const turnInSummary = stats.turnInSummary || (typeof userDocument.getQuestTurnInSummary === "function"
   ? userDocument.getQuestTurnInSummary()
   : {
    totalPending: (typeof stats.pendingTurnIns === "number" ? stats.pendingTurnIns : 0) + (legacyInfo.pendingTurnIns || 0),
    redeemableSets: Math.floor(((typeof stats.pendingTurnIns === "number" ? stats.pendingTurnIns : 0) + (legacyInfo.pendingTurnIns || 0)) / 10),
    remainder: ((typeof stats.pendingTurnIns === "number" ? stats.pendingTurnIns : 0) + (legacyInfo.pendingTurnIns || 0)) % 10
   });
  
  const pendingTurnIns = turnInSummary.totalPending || 0;
  const redeemableSets = turnInSummary.redeemableSets || 0;

  if (allTimeTotal === 0) {
    if (targetUser.id === interaction.user.id) {
     return interaction.reply({
      content: "You have not completed any quests yet.",
      flags: MessageFlags.Ephemeral
     });
    }

    return interaction.reply({
     content: `<@${targetUser.id}> has not completed any quests yet.`,
     flags: MessageFlags.Ephemeral
    });
   }

   const lastCompletionAt = stats.lastCompletionAt
    ? this.formatQuestStatsDate(stats.lastCompletionAt)
    : "Unknown";

   const typeTotals = stats.typeTotals || {};
   const uniqueTypes = this.countCompletedQuestTypes(typeTotals);
   const favoriteType = this.getFavoriteQuestType(typeTotals);
   const typeBreakdown = this.formatQuestTypeTotals(typeTotals);
   const recentCompletions = this.buildRecentQuestCompletions(stats.recentCompletions || []);

   const title = targetUser.id === interaction.user.id
    ? "Your Quest Stats"
    : `${targetUser.username}'s Quest Stats`;

const completionSummary = legacyInfo.totalTransferred > 0
 ? `✨ **All-Time Quests:** ${this.formatQuestCount(allTimeTotal)} ┇ 📘 Tracked: ${this.formatQuestCount(totalCompleted)} ┇ 🕰️ Legacy: ${this.formatQuestCount(legacyInfo.totalTransferred)}`
 : `✨ You have completed **${this.formatQuestCount(totalCompleted)}** quest${totalCompleted === 1 ? "" : "s"}.`;

   const statsEmbed = createBaseEmbed(
    title,
   `${completionSummary}\nKeep completing quests to unlock more rewards and milestones!`,
    QUEST_COLORS.SUCCESS
   );

   const avatarUrl = targetUser.displayAvatarURL({ extension: "png", size: 256 });
   if (avatarUrl) {
    statsEmbed.setThumbnail(avatarUrl);
   }

  // Get breakdown of pending turn-ins
  const legacyPending = turnInSummary.legacyPending || legacyInfo.pendingTurnIns || 0;
  const currentPending = turnInSummary.currentPending || (stats.pendingTurnIns && typeof stats.pendingTurnIns === "number" ? stats.pendingTurnIns : 0);
  const totalPendingDisplay = pendingTurnIns; // This is already the total from turnInSummary

  const legacyStatus = legacyInfo.transferUsed
   ? [
     `✅ **Transferred:** ${legacyInfo.transferredAt ? this.formatQuestStatsDate(legacyInfo.transferredAt) : '*date unknown*'}`,
     legacyPending > 0 ? `• 🎁 **Legacy Pending Turn-Ins:** ${this.formatQuestCount(legacyPending)}` : null,
     currentPending > 0 ? `• 🎯 **New Quest Pending Turn-Ins:** ${this.formatQuestCount(currentPending)}` : null,
     totalPendingDisplay > 0 ? `• 📊 **Total Pending Turn-Ins:** ${this.formatQuestCount(totalPendingDisplay)}` : null
   ].filter(Boolean).join("\n")
   : "⚠️ **Not transferred** — use `/quest transfer` to import your legacy quests.";

const snapshotLines = [
 `• 🎯 **Tracked Quests:** ${this.formatQuestCount(totalCompleted)}`,
 `• 🗒️ **Legacy Quests:** ${this.formatQuestCount(legacyInfo.totalTransferred || 0)}`,
 `• 🧮 **All-Time Total:** ${this.formatQuestCount(allTimeTotal)}`,
`• 🎁 **Pending Turn-Ins:** ${this.formatQuestCount(pendingTurnIns)} • Sets Ready: **${redeemableSets}**`,
   `• 🧭 **Unique Quest Types:** ${uniqueTypes}`,
   `• 🏆 **Favorite Quest Type:** ${favoriteType}`,
   `• 📅 **Last Completion:** ${lastCompletionAt}`
  ];

   const fields = [
    {
      name: "📊 Quest Snapshot",
      value: snapshotLines.join("\n"),
      inline: false
    },
    {
      name: "🕰️ Legacy Transfer",
      value: legacyStatus,
      inline: false
    },
    {
      name: "📚 Quest Type Breakdown",
      value: typeBreakdown,
      inline: true
    },
    {
      name: "📝 Recent Quest Completions",
      value: recentCompletions,
      inline: false
    }
   ];

   const questList = stats.questList || [];
   if (Array.isArray(questList) && questList.length > 0) {
     const maxShow = 15;
     const DISCORD_FIELD_MAX = 1024;
     const lines = questList.slice(-maxShow).reverse().map((entry) => {
       const name = entry.name || "Unknown";
       const year = entry.year || "";
       const category = entry.category && String(entry.category).trim() ? entry.category : "";
       return category ? `${name} (${year}) — ${category}` : `${name} (${year})`;
     });
     let value = lines.join("\n");
     const remaining = questList.length - maxShow;
     if (remaining > 0) {
       const suffix = `\n… and ${remaining} more`;
       if (value.length + suffix.length <= DISCORD_FIELD_MAX) {
         value += suffix;
       } else {
         value = value.slice(0, DISCORD_FIELD_MAX - suffix.length) + suffix;
       }
     }
     if (value.length > DISCORD_FIELD_MAX) {
       value = value.slice(0, DISCORD_FIELD_MAX - 3) + "...";
     }
     fields.push({ name: "📋 Quest List", value, inline: false });
   }

   statsEmbed.addFields(fields);

   return interaction.reply({
    embeds: [statsEmbed],
    flags: MessageFlags.Ephemeral
   });

  } catch (error) {
   logger.error('QUEST', `handleQuestStats failed; userId=${interaction.user?.id}; ${error.message}`, error);
   return interaction.reply({
    content: "An error occurred while retrieving quest stats.",
    flags: MessageFlags.Ephemeral
   });
  }
 },

// ============================================================================
// ------------------- Quest Turn-In Handler -------------------
// ============================================================================
async handleQuestTurnIn(interaction) {
 try {
  const rewardType = interaction.options.getString("reward");
  const characterName = interaction.options.getString("character");
  const requiredTurnIns = 10;

  if (!["character_slot", "spirit_orb"].includes(rewardType)) {
   return interaction.reply({
    content: "❌ Invalid reward selection. Please choose a valid reward option.",
    flags: MessageFlags.Ephemeral
   });
  }

  const user = await User.getOrCreateUser(interaction.user.id);
  const currentSummary = user.getQuestTurnInSummary();
  const totalPending = currentSummary.totalPending || 0;
  const redeemableSets = currentSummary.redeemableSets || 0;

  if (totalPending < requiredTurnIns || redeemableSets < 1) {
   const shortage = requiredTurnIns - (totalPending % requiredTurnIns || requiredTurnIns);
   const message =
    totalPending < requiredTurnIns
     ? `You need at least ${requiredTurnIns} pending quest turn-ins to redeem a reward. You currently have ${this.formatQuestCount(totalPending)}.`
     : `You need a full set of ${requiredTurnIns} turn-ins (10, 20, 30, etc.) to redeem a reward.`;

   return interaction.reply({
    content: `❌ ${message}\n• Pending turn-ins: ${this.formatQuestCount(totalPending)}\n• Sets ready: ${this.formatQuestCount(redeemableSets)}\n• Turn-ins needed for next reward: ${this.formatQuestCount(shortage)}`,
    flags: MessageFlags.Ephemeral
   });
  }

  let character = null;
  if (rewardType === "spirit_orb") {
   if (!characterName) {
    return interaction.reply({
     content: "❌ Please specify which character should receive the Spirit Orb.",
     flags: MessageFlags.Ephemeral
    });
   }

   character = await this.validateCharacter(interaction, characterName, interaction.user.id);
   if (!character) {
    return;
   }
  }

  const consumeResult = await user.consumeQuestTurnIns(requiredTurnIns);
  if (!consumeResult.success) {
   return interaction.reply({
    content: `❌ ${consumeResult.error || "Unable to redeem quest turn-ins right now. Please try again later."}`,
    flags: MessageFlags.Ephemeral
   });
  }

  const updatedSummary = consumeResult.turnInSummary || user.getQuestTurnInSummary();
  const rewardFields = [];
  let rewardValue = "";
  let description = "";

  if (rewardType === "character_slot") {
   try {
    const previousSlots = typeof user.characterSlot === "number" ? user.characterSlot : 2;
    user.characterSlot = previousSlots + 1;
    await user.save();

    rewardFields.push({
     name: "🎫 Character Slots",
     value: `> ${previousSlots} → ${user.characterSlot}`,
     inline: true
    });

    rewardValue = "+1 Character Slot";
    description = "You exchanged 10 completed quests for a new character slot.";
   } catch (slotError) {
    logger.error('QUEST', `handleQuestTurnIn: character_slot failed; userId=${interaction.user.id}, rewardType=character_slot, requiredTurnIns=${requiredTurnIns}`, slotError);
    return interaction.reply({
     content: "The turn-in was consumed but the character slot could not be granted. Please contact an admin.",
     flags: MessageFlags.Ephemeral
    });
   }
  } else {
   // getCharacterInventoryCollection required here to avoid loading db when reward is character_slot
   try {
    const { getCharacterInventoryCollection } = require('@/database/db');
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const existingOrb = await inventoryCollection.findOne({
     characterId: character._id,
     itemName: { $regex: /^spirit orb$/i }
    });

    const previousOrbs = existingOrb?.quantity || 0;
    const newOrbTotal = previousOrbs + 1;

    if (existingOrb) {
     await inventoryCollection.updateOne(
      { _id: existingOrb._id },
      { $set: { quantity: newOrbTotal } }
     );
    } else {
     await inventoryCollection.insertOne({
      characterId: character._id,
      itemName: "Spirit Orb",
      quantity: 1,
      category: "Material",
      type: "Special",
      subtype: "",
      addedAt: new Date()
     });
    }

    await Character.findByIdAndUpdate(character._id, { spiritOrbs: newOrbTotal });

    rewardFields.push({
     name: "<:spiritorb:1171310851748270121> Spirit Orbs",
     value: `> ${previousOrbs} → ${newOrbTotal}`,
     inline: true
    });

    rewardValue = "+1 <:spiritorb:1171310851748270121> Spirit Orb";
    description = `You exchanged 10 completed quests for a Spirit Orb for **${character.name}**.`;
   } catch (orbError) {
    logger.error('QUEST', `handleQuestTurnIn: spirit_orb failed; userId=${interaction.user.id}, character=${character?.name}, rewardType=spirit_orb`, orbError);
    // consumeQuestTurnIns already succeeded; user has lost 10 turn-ins. TODO: consider compensate or manual fix path.
    return interaction.reply({
     content: "The turn-in was consumed but the Spirit Orb could not be granted. Please contact an admin.",
     flags: MessageFlags.Ephemeral
    });
   }
  }

  const summaryEmbed = createBaseEmbed(
   "Quest Turn-In Redeemed",
   description,
   QUEST_COLORS.SUCCESS
  );

  summaryEmbed.addFields(
   {
    name: "🎁 Reward",
    value: rewardValue,
    inline: false
   },
   ...rewardFields,
   {
    name: "📊 Updated Turn-In Progress",
    value: [
     `• Pending Turn-Ins: ${this.formatQuestCount(updatedSummary.totalPending || 0)}`,
     `• Sets Ready: ${this.formatQuestCount(updatedSummary.redeemableSets || 0)}`,
     `• Toward Next: ${this.formatQuestCount(updatedSummary.remainder || 0)}/10`
    ].join("\n"),
    inline: false
   }
  );

  return interaction.reply({
   embeds: [summaryEmbed],
   flags: MessageFlags.Ephemeral
  });
 } catch (error) {
  logger.error('QUEST', `handleQuestTurnIn failed; userId=${interaction.user?.id}, rewardType=${interaction.options?.getString?.('reward')}; ${error.message}`, error);

  if (!interaction.replied && !interaction.deferred) {
   return interaction.reply({
    content: "An error occurred while processing your quest turn-in.",
    flags: MessageFlags.Ephemeral
   });
  }

  return interaction.followUp({
   content: "An error occurred while processing your quest turn-in.",
   flags: MessageFlags.Ephemeral
  });
 }
},

// ============================================================================
// ------------------- Legacy Quest Transfer Handler -------------------
// ============================================================================
async handleLegacyQuestTransfer(interaction) {
  try {
   const totalLegacy = interaction.options.getInteger("total");
   const pendingLegacy = interaction.options.getInteger("pending");

   if (totalLegacy <= 0 && pendingLegacy <= 0) {
    return interaction.reply({
     content: "You need at least one legacy quest or pending turn-in to transfer.",
     flags: MessageFlags.Ephemeral
    });
   }

   if (pendingLegacy > totalLegacy) {
    return interaction.reply({
     content: "Pending turn-ins cannot be greater than your total legacy quests. Please double-check your numbers.",
     flags: MessageFlags.Ephemeral
    });
   }

   const user = await User.getOrCreateUser(interaction.user.id);

   if (!user.canUseLegacyQuestTransfer()) {
    return interaction.reply({
     content: "You have already transferred your legacy quest totals.",
     flags: MessageFlags.Ephemeral
    });
   }

   const transferResult = await user.applyLegacyQuestTransfer({
    totalCompleted: totalLegacy,
    pendingTurnIns: pendingLegacy
   });

   if (!transferResult.success) {
    return interaction.reply({
     content: `❌ ${transferResult.error || 'Unable to apply legacy transfer.'}`,
     flags: MessageFlags.Ephemeral
    });
   }

   // Refresh user to get updated quest tracking with ensureQuestTracking fix
   await user.save(); // Save after transfer to persist changes
   const updatedUser = await User.findOne({ discordId: interaction.user.id });
   
   // Get the correct turn-in summary after ensuring pendingTurnIns is fixed
   const turnInSummary = updatedUser ? updatedUser.getQuestTurnInSummary() : (transferResult.turnInSummary || {
    totalPending: transferResult.pendingTurnIns || 0,
    currentPending: updatedUser?.quests?.pendingTurnIns ?? 0,
    legacyPending: transferResult.legacy?.pendingTurnIns ?? 0,
    redeemableSets: Math.floor((transferResult.pendingTurnIns || 0) / 10),
    remainder: (transferResult.pendingTurnIns || 0) % 10
   });

   const summaryEmbed = createBaseEmbed(
    "Legacy Quest Transfer Completed",
    "Your legacy quest progress has been added to your profile and will count toward future rewards.",
    QUEST_COLORS.SUCCESS
   );

 // Calculate total pending (legacy + non-legacy) for display
   const totalPendingTurnIns = turnInSummary.totalPending || 0;
   const legacyPendingDisplay = transferResult.legacy.pendingTurnIns || 0;
   const currentPendingDisplay = turnInSummary.currentPending || (updatedUser?.quests?.pendingTurnIns || 0);
   
   summaryEmbed.addFields(
    {
     name: "📦 Legacy Import",
     value: [
     `• 📚 **Transferred:** ${this.formatQuestCount(transferResult.legacy.totalTransferred)} quests`,
     `• 🎁 **Legacy Pending Turn-Ins:** ${this.formatQuestCount(legacyPendingDisplay)}`,
     `• 🎯 **New Quest Pending Turn-Ins:** ${this.formatQuestCount(currentPendingDisplay)}`,
     `• 📊 **Total Pending Turn-Ins:** ${this.formatQuestCount(totalPendingTurnIns)}`
     ].join("\n"),
     inline: false
    },
    {
     name: "📈 Updated Totals",
     value: [
     `• 🧮 **All-Time Total:** ${this.formatQuestCount(transferResult.allTimeTotal)} quests`,
     `• 🎯 **Tracked Quests:** ${this.formatQuestCount(updatedUser?.quests?.totalCompleted || user.quests?.totalCompleted || 0)}`
     ].join("\n"),
     inline: false
    },
    {
     name: "🎉 Turn-In Progress",
     value: [
     `• ✅ **Sets Ready:** ${this.formatQuestCount(turnInSummary.redeemableSets || 0)} (${this.formatQuestCount((turnInSummary.redeemableSets || 0) * 10)} quests)`,
     `• ➕ **Toward Next:** ${this.formatQuestCount(turnInSummary.remainder || 0)}/10`
     ].join("\n"),
     inline: false
    }
   );

   summaryEmbed.setFooter({ text: "This transfer can only be performed once." });

   return interaction.reply({
    embeds: [summaryEmbed],
    flags: MessageFlags.Ephemeral
   });
  } catch (error) {
   logger.error('QUEST', `handleLegacyQuestTransfer failed; userId=${interaction.user?.id}; ${error.message}`, error);
   return interaction.reply({
    content: "An error occurred while transferring legacy quests.",
    flags: MessageFlags.Ephemeral
   });
  }
 },

// ============================================================================
 // ------------------- Quest Embed Update Handler -------------------
 // ============================================================================
 async updateQuestEmbed(guild, quest, client = null, updateSource = 'questJoin') {
  try {
   if (!quest || !quest.messageID) {
    logger.warn('QUEST', 'updateQuestEmbed: no quest or messageID provided, skipping');
    return { success: false, reason: 'No quest or messageID' };
   }

   const questID = quest.questID || quest.questId;
   if (!questID) {
    logger.warn('QUEST', 'updateQuestEmbed: no questID found, skipping');
    return { success: false, reason: 'No questID' };
   }

  // Check if we're already updating this quest
  if (this.isQuestBeingUpdated(questID)) {
   logger.info('QUEST', `Quest ${questID} is already being updated, queuing request from ${updateSource}`);
   this.queueEmbedUpdate(questID, quest, client, updateSource);
   return { success: true, reason: 'Queued for update' };
  }

  // Mark as updating
  this.markQuestAsUpdating(questID);

  // Perform the actual update
  const result = await this.performEmbedUpdate(quest, client, updateSource);

  // Clear update status
  this.clearQuestUpdateStatus(questID);

  // Process any queued updates
  await this.processQueuedUpdates(questID, client);

   return result;

  } catch (error) {
   logger.error('QUEST', `Error updating quest embed: ${error.message}`, error);

   // Clear update status on error
   if (quest && quest.questID) {
    this.clearQuestUpdateStatus(quest.questID);
   }

   return { success: false, error: error.message };
  }
 },

 // ============================================================================
 // ------------------- Embed Queue Management -------------------
 // ============================================================================
 isQuestBeingUpdated(questID) {
  const queueEntry = embedUpdateQueue.get(questID);
  return queueEntry && queueEntry.isUpdating;
 },

 markQuestAsUpdating(questID) {
  if (!embedUpdateQueue.has(questID)) {
   embedUpdateQueue.set(questID, { isUpdating: false, pendingUpdates: [] });
  }
  embedUpdateQueue.get(questID).isUpdating = true;
 },

 clearQuestUpdateStatus(questID) {
  const queueEntry = embedUpdateQueue.get(questID);
  if (queueEntry) {
   queueEntry.isUpdating = false;
   // Clear timeout if it exists
   if (updateTimeouts.has(questID)) {
    clearTimeout(updateTimeouts.get(questID));
    updateTimeouts.delete(questID);
   }
  }
 },

 queueEmbedUpdate(questID, quest, client, updateSource) {
  if (!embedUpdateQueue.has(questID)) {
   embedUpdateQueue.set(questID, { isUpdating: false, pendingUpdates: [] });
  }
  
  const queueEntry = embedUpdateQueue.get(questID);
  queueEntry.pendingUpdates.push({ quest, client, updateSource, timestamp: Date.now() });
  
  // Set a timeout to process queued updates if they're not processed quickly
  if (!updateTimeouts.has(questID)) {
   const timeout = setTimeout(() => {
    this.processQueuedUpdates(questID, client);
   }, 2000); // 2 second timeout
   updateTimeouts.set(questID, timeout);
  }
 },

 async processQueuedUpdates(questID, client) {
  const queueEntry = embedUpdateQueue.get(questID);
  if (!queueEntry || queueEntry.pendingUpdates.length === 0) {
   return;
  }

  // Get the most recent update (latest quest data)
  const updates = queueEntry.pendingUpdates.sort((a, b) => b.timestamp - a.timestamp);
  const latestUpdate = updates[0];
  
  // Clear the queue
  queueEntry.pendingUpdates = [];
  
  if (latestUpdate) {
   logger.info('QUEST', `Processing queued update for quest ${questID} from ${latestUpdate.updateSource}`);
   await this.updateQuestEmbed(null, latestUpdate.quest, latestUpdate.client, latestUpdate.updateSource);
  }
 },

 // ============================================================================
// ------------------- Quest Stats Helpers -------------------
// ============================================================================
 formatQuestStatsDate(dateInput) {
  const date = new Date(dateInput);

  if (Number.isNaN(date.getTime())) {
   return "Unknown";
  }

  const unix = Math.floor(date.getTime() / 1000);
  return `<t:${unix}:D>`;
 },

formatQuestCount(count = 0) {
 if (!Number.isFinite(count)) {
  return `${count}`;
 }
 return count.toLocaleString("en-US");
},

 formatQuestTypeTotals(typeTotals) {
  const breakdown = [
   { key: "art", label: "Art" },
   { key: "writing", label: "Writing" },
   { key: "interactive", label: "Interactive" },
   { key: "rp", label: "RP" },
   { key: "artWriting", label: "Art / Writing" },
   { key: "other", label: "Other" }
  ];

  const totalsWithValues = breakdown
   .map(entry => ({
    ...entry,
    total: typeof typeTotals[entry.key] === "number" ? typeTotals[entry.key] : 0
   }))
   .filter(entry => entry.total > 0)
   .sort((a, b) => b.total - a.total);

  if (totalsWithValues.length === 0) {
   return "*No completed quest types yet*";
  }

  return totalsWithValues
   .map((entry, index) => {
    const prefix = index === 0 ? ">" : "-";
    return `${prefix} **${entry.label}**: ${entry.total}`;
   })
   .join("\n");
 },

 buildRecentQuestCompletions(recentCompletions) {
  if (!Array.isArray(recentCompletions) || recentCompletions.length === 0) {
   return "*No recent quests on record*";
  }

  const entries = recentCompletions
   .slice(0, 5)
   .map(completion => {
    const title = completion.questTitle || completion.questId || "Unknown Quest";
    const type = completion.questType || "Unknown";
    const completedDate = completion.rewardedAt || completion.completedAt;
    const formattedDate = this.formatQuestStatsDate(completedDate);
    return `- ${title} — ${type} — ${formattedDate}`;
   });

  return entries.join("\n");
 },

 countCompletedQuestTypes(typeTotals = {}) {
  return Object.values(typeTotals).filter(total => typeof total === "number" && total > 0).length;
 },

 getFavoriteQuestType(typeTotals = {}) {
  const breakdown = [
   { key: "art", label: "Art" },
   { key: "writing", label: "Writing" },
   { key: "interactive", label: "Interactive" },
   { key: "rp", label: "RP" },
   { key: "artWriting", label: "Art / Writing" },
   { key: "other", label: "Other" }
  ];

  let favorite = { label: "N/A", total: 0 };

  for (const entry of breakdown) {
   const total = typeof typeTotals[entry.key] === "number" ? typeTotals[entry.key] : 0;
   if (total > favorite.total) {
    favorite = { label: entry.label, total };
   }
  }

  return favorite.total > 0 ? `${favorite.label} (${favorite.total})` : "N/A";
 },

// ============================================================================
 // ------------------- Core Update Logic -------------------
 // ============================================================================
 async performEmbedUpdate(quest, client, updateSource) {
  try {
   logger.info('QUEST', `Updating embed for quest ${quest.questID || quest.questId} from ${updateSource}`);

   // Validate client is available
   if (!client) {
    logger.warn('QUEST', 'performEmbedUpdate: no client provided, skipping');
    return { success: false, reason: 'No client provided' };
   }

   // Get the quest channel and message
   const questChannelId = quest.targetChannel || QUEST_CHANNEL_ID;
   const questChannel = client.channels.cache.get(questChannelId);

   if (!questChannel) {
    logger.warn('QUEST', `performEmbedUpdate: quest channel not found (${questChannelId})`);
    return { success: false, reason: 'Channel not found' };
   }

   const questMessage = await questChannel.messages.fetch(quest.messageID);
   if (!questMessage) {
    logger.warn('QUEST', `performEmbedUpdate: quest message not found (${quest.messageID})`);
    return { success: false, reason: 'Message not found' };
   }

   // Get current embed
   const currentEmbed = questMessage.embeds[0];
   if (!currentEmbed) {
    logger.warn('QUEST', 'performEmbedUpdate: no embed found in quest message');
    return { success: false, reason: 'No embed found' };
   }

   // Create updated embed based on quest type
   const updatedEmbed = await this.createUpdatedEmbed(quest, client, currentEmbed, updateSource);

   // Update the message
   await questMessage.edit({ embeds: [updatedEmbed] });

   logger.success('QUEST', `Successfully updated quest embed for ${quest.questID || quest.questId}`);
   return { success: true, reason: 'Updated successfully' };

  } catch (error) {
   logger.error('QUEST', `Error performing embed update: ${error.message}`, error);
   return { success: false, error: error.message };
  }
 },

 // ============================================================================
 // ------------------- Embed Creation -------------------
 // ============================================================================
 async createUpdatedEmbed(quest, client, currentEmbed, updateSource) {
  try {
   // Start with current embed to preserve existing data
   const embed = EmbedBuilder.from(currentEmbed);

   // Update participant information
   await this.updateParticipantFields(quest, client, embed);

   // Update quest status information
   this.updateStatusFields(quest, embed, updateSource);

   // Update quest-specific information
   await this.updateQuestSpecificFields(quest, client, embed, updateSource);

   // Add update source info to footer
   this.updateFooter(embed, updateSource);

   return embed;

  } catch (error) {
   logger.error('QUEST', `Error creating updated embed: ${error.message}`, error);
   return currentEmbed; // Return original embed on error
  }
 },

 // ============================================================================
 // ------------------- Helper: Get Participants Array -------------------
 // ============================================================================
 getParticipantsArray(quest) {
  if (!quest.participants) return [];
  // Handle both Map (from Mongoose) and plain object (from MongoDB) cases
  if (quest.participants instanceof Map) {
   return Array.from(quest.participants.values());
  } else if (typeof quest.participants === 'object' && quest.participants !== null) {
   return Object.values(quest.participants);
  }
  return [];
 },

 async updateParticipantFields(quest, client, embed) {
  try {
   const participants = this.getParticipantsArray(quest);
   
   // Create participant list
   const participantList = await Promise.all(
    participants.map(async (participant) => {
     try {
      if (client) {
       const user = await client.users.fetch(participant.userId);
       return `• ${participant.characterName} (${user.username})`;
      } else {
       return `• ${participant.characterName} (${participant.userId})`;
      }
     } catch (error) {
      return `• ${participant.characterName} (${participant.userId})`;
     }
    })
   );

   const participantListText = participantList.length > 0 ? participantList.join("\n") : "None";

   // Update participant count
   const participantCount = quest.participantCap
    ? `${participants.length}/${quest.participantCap}${
       participants.length >= quest.participantCap ? " - FULL" : ""
      }`
    : participants.length.toString();

   // Find and update participants field
   const existingParticipantsFieldIndex = embed.data.fields.findIndex(field => 
    field.name.includes("Participants") || field.name.includes("👥")
   );

   const participantsField = {
    name: `👥 __Participants__ (${participantCount})`,
    value: participantListText.length > 1024
     ? participantListText.substring(0, 1021) + "..."
     : participantListText,
    inline: false
   };

   if (existingParticipantsFieldIndex >= 0) {
    embed.data.fields[existingParticipantsFieldIndex] = participantsField;
   } else {
    embed.addFields(participantsField);
   }

  } catch (error) {
   logger.error('QUEST', `Error updating participant fields: ${error.message}`, error);
  }
 },

 updateStatusFields(quest, embed, updateSource) {
  try {
   // Update quest status
   const statusFieldIndex = embed.data.fields.findIndex(field => 
    field.name.includes("Status") || field.name.includes("__Status__")
   );

   if (statusFieldIndex >= 0) {
    const statusText = quest.status === 'active' ? '🟢 Active' :
                     quest.status === 'completed' ? '✅ Complete' :
                     quest.status === 'draft' ? '📝 Draft' :
                     quest.status === 'unposted' ? '📤 Unposted' :
                     quest.status === 'cancelled' ? '❌ Cancelled' :
                     quest.status === 'expired' ? '⏰ Expired' : quest.status;

    embed.data.fields[statusFieldIndex] = {
     name: "__Status__",
     value: statusText,
     inline: true
    };
   }

   // Update quest type specific fields
   if (quest.questType === 'RP') {
    this.updateRPQuestFields(quest, embed);
   } else if (quest.questType === 'Interactive') {
    this.updateInteractiveQuestFields(quest, embed);
   }

  } catch (error) {
   logger.error('QUEST', `Error updating status fields: ${error.message}`, error);
  }
 },

 updateRPQuestFields(quest, embed) {
  try {
   // Update RP post requirements
   const rpFieldIndex = embed.data.fields.findIndex(field => 
    field.name.includes("RP Posts") || field.name.includes("Posts Required")
   );

   if (rpFieldIndex >= 0) {
    const postRequirement = quest.postRequirement || 15;
    const participants = this.getParticipantsArray(quest);
    
    const rpStatus = participants.map(p => 
     `${p.characterName}: ${p.rpPostCount || 0}/${postRequirement}`
    ).join('\n');

    embed.data.fields[rpFieldIndex] = {
     name: `📝 RP Posts Required (${postRequirement})`,
     value: rpStatus.length > 1024 ? rpStatus.substring(0, 1021) + "..." : rpStatus,
     inline: false
    };
   }

  } catch (error) {
   logger.error('QUEST', `Error updating RP quest fields: ${error.message}`, error);
  }
 },

 updateInteractiveQuestFields(quest, embed) {
  try {
   // Update table roll information
   if (quest.tableRollName) {
    const tableRollFieldIndex = embed.data.fields.findIndex(field => 
     field.name.includes("Table Roll") || field.name.includes("Rolls Required")
    );

    if (tableRollFieldIndex >= 0) {
     const requiredRolls = quest.requiredRolls || 1;
     const participants = this.getParticipantsArray(quest);
     
     const rollStatus = participants.map(p => {
      const successfulRolls = p.successfulRolls || 0;
      return `${p.characterName}: ${successfulRolls}/${requiredRolls}`;
     }).join('\n');

     embed.data.fields[tableRollFieldIndex] = {
      name: `🎲 Table Rolls Required (${requiredRolls})`,
      value: rollStatus.length > 1024 ? rollStatus.substring(0, 1021) + "..." : rollStatus,
      inline: false
     };
    }
   }

  } catch (error) {
   logger.error('QUEST', `Error updating interactive quest fields: ${error.message}`, error);
  }
 },

 async updateQuestSpecificFields(quest, client, embed, updateSource) {
  try {
   // Add quest-specific information based on the update source
   if (updateSource === 'rpQuestTracking') {
    // RP quest specific updates
    await this.updateRPQuestSpecificFields(quest, embed);
   } else if (updateSource === 'questJoin' || updateSource === 'questLeave') {
    // Participant change updates
    await this.updateParticipantChangeFields(quest, embed, updateSource);
   } else if (updateSource === 'modAction') {
    // Mod action updates
    await this.updateModActionFields(quest, embed);
   }

  } catch (error) {
   logger.error('QUEST', `Error updating quest-specific fields: ${error.message}`, error);
  }
 },

 async updateRPQuestSpecificFields(quest, embed) {
  // Add RP quest specific information
  if (quest.requiredVillage) {
   const villageFieldIndex = embed.data.fields.findIndex(field => 
    field.name.includes("Village") || field.name.includes("Location")
   );

   if (villageFieldIndex >= 0) {
    embed.data.fields[villageFieldIndex] = {
     name: "__Location__",
     value: `${quest.requiredVillage} (RP Quest)`,
     inline: true
    };
   }
  }
 },

 async updateParticipantChangeFields(quest, embed, updateSource) {
  // Add participant change information
  const changeField = {
   name: "📊 Recent Activity",
   value: updateSource === 'questJoin' ? 
     "🟢 New participant joined" : 
     "🔴 Participant left",
   inline: true
  };

  // Remove existing activity field if it exists
  const existingActivityIndex = embed.data.fields.findIndex(field => 
   field.name.includes("Recent Activity") || field.name.includes("Activity")
  );

  if (existingActivityIndex >= 0) {
   embed.data.fields[existingActivityIndex] = changeField;
  } else {
   embed.addFields(changeField);
  }
 },

 async updateModActionFields(quest, embed) {
  // Add mod action information
  const modField = {
   name: "🔧 Mod Action",
   value: "Quest updated by moderator",
   inline: true
  };

  // Remove existing mod field if it exists
  const existingModIndex = embed.data.fields.findIndex(field => 
   field.name.includes("Mod Action") || field.name.includes("Moderator")
  );

  if (existingModIndex >= 0) {
   embed.data.fields[existingModIndex] = modField;
  } else {
   embed.addFields(modField);
  }
 },

 updateFooter(embed, updateSource) {
  try {
   const currentFooter = embed.data.footer;
   const timestamp = new Date().toISOString();
   
   let footerText = `Last updated: ${timestamp}`;
   if (updateSource !== 'unknown') {
    footerText += ` | Source: ${updateSource}`;
   }

   embed.setFooter({
    text: footerText,
    iconURL: currentFooter?.iconURL
   });

  } catch (error) {
   logger.error('QUEST', `Error updating footer: ${error.message}`, error);
  }
 },


 // ============================================================================
 // ------------------- Quest Post Count Handler -------------------
 // ============================================================================
 async handlePostCount(interaction) {
  try {
   const questID = interaction.options.getString("questid");
   const quest = await Quest.findOne({ questID });

   if (!quest) {
    return interaction.reply({
     content: "[quest.js]❌ Quest not found. Please check the quest ID and try again.",
     flags: MessageFlags.Ephemeral,
    });
   }

   if (quest.questType !== QUEST_TYPES.RP && quest.questType !== QUEST_TYPES.INTERACTIVE) {
    return interaction.reply({
     content: "[quest.js]❌ This command only works with RP and Interactive quests. The specified quest is not an RP or Interactive quest.",
     flags: MessageFlags.Ephemeral,
    });
   }

   const participants = this.getParticipantsArray(quest);
   if (participants.length === 0) {
    return interaction.reply({
     content: "[quest.js]❌ No participants found for this quest.",
     flags: MessageFlags.Ephemeral,
    });
   }

   const embed = await this.createPostCountEmbed(interaction, quest, participants);
   return interaction.reply({ embeds: [embed] });

  } catch (error) {
   handleInteractionError(error, "quest.js", {
    commandName: "quest postcount",
    userTag: interaction.user.tag,
    userId: interaction.user.id,
    questID: interaction.options.getString("questid")
   });

   return interaction.reply({
    content: "[quest.js]❌ An error occurred while fetching post counts. Please try again later.",
    flags: MessageFlags.Ephemeral,
   });
  }
 },

 // ============================================================================
 // ------------------- Validation Helper Methods -------------------
 // ============================================================================
 // ------------------- Function: parseDeadlineEST -------------------
 // Parses a deadline string and converts it to end-of-day EST (23:59:59 EST)
 // Handles formats like "MM-DD-YY", "YYYY-MM-DD", etc.
 parseDeadlineEST(signupDeadlineString) {
  if (!signupDeadlineString) return null;
  
  try {
   let year, month, day;
   
   // Try parsing different date formats
   // Format: MM-DD-YY or MM-DD-YYYY
   if (signupDeadlineString.includes('-')) {
    const parts = signupDeadlineString.split('-');
    if (parts.length >= 3) {
     month = parseInt(parts[0], 10);
     day = parseInt(parts[1], 10);
     const yearPart = parseInt(parts[2], 10);
     
     // Handle 2-digit years (YY format)
     if (yearPart < 100) {
      // Assume years 00-50 are 2000-2050, 51-99 are 1951-1999
      year = yearPart <= 50 ? 2000 + yearPart : 1900 + yearPart;
     } else {
      year = yearPart;
     }
    }
   } else {
    // Try standard Date parsing as fallback
    const parsedDate = new Date(signupDeadlineString);
    if (!isNaN(parsedDate.getTime())) {
     year = parsedDate.getFullYear();
     month = parsedDate.getMonth() + 1;
     day = parsedDate.getDate();
    } else {
     return null;
    }
   }
   
   if (!year || !month || !day) return null;
   
   // Create a date string in ISO format
   const isoDateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
   
   // Create a test date at noon UTC to determine DST status
   const testDateUTC = new Date(`${isoDateString}T12:00:00Z`);
   
   // Get the offset by comparing what time it is in EST vs UTC
   const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false
   });
   
   const utcFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    hour12: false
   });
   
   const estHour = parseInt(estFormatter.formatToParts(testDateUTC).find(p => p.type === 'hour').value);
   const utcHour = parseInt(utcFormatter.formatToParts(testDateUTC).find(p => p.type === 'hour').value);
   const offsetHours = utcHour - estHour; // EST is UTC-5 or UTC-4 (EDT)
   
   // Create date at 23:59:59 EST
   // 23:59:59 EST = 23:59:59 + offsetHours in UTC
   // EST: 23:59:59 EST = 04:59:59 UTC next day (23 + 5 = 28, wraps to 04 next day)
   // EDT: 23:59:59 EDT = 03:59:59 UTC next day (23 + 4 = 27, wraps to 03 next day)
   const utcHourForEndOfDay = 23 + offsetHours;
   
   // Handle day rollover manually (like blightHandler.js does)
   let utcDay = day;
   let utcMonth = month - 1;
   let utcYear = year;
   let finalHour = utcHourForEndOfDay;
   
   if (utcHourForEndOfDay >= 24) {
    finalHour = utcHourForEndOfDay % 24;
    utcDay += 1;
    // Handle month/year rollover
    const daysInMonth = new Date(year, month, 0).getDate();
    if (utcDay > daysInMonth) {
     utcDay = 1;
     utcMonth += 1;
     if (utcMonth >= 12) {
      utcMonth = 0;
      utcYear += 1;
     }
    }
   }
   
   const deadlineUTC = new Date(Date.UTC(utcYear, utcMonth, utcDay, finalHour, 59, 59));
   
   return deadlineUTC;
  } catch (error) {
   // If parsing fails, try to use the string directly as a fallback
   try {
    const parsedDate = new Date(signupDeadlineString);
    if (!isNaN(parsedDate.getTime())) {
     // Set to end of day in EST (defaulting to EST offset -05:00)
     const year = parsedDate.getFullYear();
     const month = parsedDate.getMonth();
     const day = parsedDate.getDate();
     const estDateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59-05:00`;
     return new Date(estDateString);
    }
   } catch (fallbackError) {
    return null;
   }
   return null;
  }
 },

 async validateQuest(interaction, questID) {
  const quest = await Quest.findOne({ questID });
  if (!quest) {
   await interaction.reply({
    content: `[quest.js]❌ Quest with ID \`${questID}\` does not exist.`,
    flags: MessageFlags.Ephemeral,
   });
   return null;
  }

  if (quest.status !== "active") {
   await interaction.reply({
    content: `[quest.js]❌ The quest \`${quest.title}\` is no longer active.`,
    flags: MessageFlags.Ephemeral,
   });
   return null;
  }

  const now = new Date();
  if (quest.signupDeadline) {
   const deadline = this.parseDeadlineEST(quest.signupDeadline);
   if (!deadline || now > deadline) {
    await interaction.reply({
     content: `[quest.js]❌ The signup deadline for quest \`${quest.title}\` has passed.`,
     flags: MessageFlags.Ephemeral,
    });
    return null;
   }
  }

  return quest;
 },

 async validateCharacter(interaction, characterName, userID) {
  const character = await Character.findOne({
   name: characterName,
   userId: userID,
  });

  if (!character) {
   await interaction.reply({
    content: `[quest.js]❌ You do not own a character named \`${characterName}\`. Please use one of your registered characters.`,
    flags: MessageFlags.Ephemeral,
   });
   return null;
  }

  return character;
 },

 async handleQuestParticipationValidation(interaction, quest, userID, characterName) {
  const validation = await validateQuestParticipation(quest, userID, characterName);
  
  if (!validation.valid) {
   await interaction.reply({
    content: `[quest.js]❌ ${validation.message}`,
    flags: MessageFlags.Ephemeral,
   });
   return false;
  }

  return true;
 },

 async handleRPQuestVillageValidation(interaction, quest, character) {
  return await validateRPQuestVillage(interaction, quest, character);
 },

 // ============================================================================
 // ------------------- Embed Creation Helper Methods -------------------
 // ============================================================================
 createSuccessEmbed(quest, characterName, userName, character, voucherUsed = false) {
  const embed = createBaseEmbed(
   `🎯 Quest Joined Successfully!`,
   `**${characterName}** (${userName}) joined the quest **${quest.title}**!`,
   QUEST_COLORS.SUCCESS
  );

  if (character.icon) {
   embed.setThumbnail(character.icon);
  }

  // Add quest info fields
  addQuestInfoFields(embed, quest);

  // Add voucher information if used
  if (voucherUsed) {
   embed.addFields({
    name: '🎫 Quest Voucher Used',
    value: 'You used a Quest Voucher to join this full quest!',
    inline: false
   });
  }

  let joinText = `</quest join:1389946995468271729>`;
  
  // Add RINGER information for alien minigames
  if (quest.title && quest.title.toLowerCase().includes('alien') && quest.title.toLowerCase().includes('defense')) {
    joinText += `\n\n🆘 **Want to help but not signed up?** Use \`RINGER\` in quest id to help!`;
  }
  
  embed.addFields({
   name: '💡 Want to join this quest?',
   value: joinText,
   inline: false
  });

  return embed;
 },

 createErrorEmbed(title, description) {
  return createBaseEmbed(title, description, QUEST_COLORS.ERROR);
 },

 // ============================================================================
 // ------------------- Quest Join Helper Methods -------------------
 // ============================================================================
 async checkCappedQuestRestrictions(interaction, quest, userID) {
  // Check if user has an active quest voucher
  const hasQuestVoucher = await this.checkQuestVoucher(interaction, userID);
  
  // Always check for other capped quests (voucher doesn't bypass this)
  const otherCappedQuests = await Quest.find({
   participantCap: { $ne: null },
   status: "active",
   questID: { $ne: quest.questID },
  });

  for (const otherQuest of otherCappedQuests) {
   if (otherQuest.participants.has(userID)) {
    const errorEmbed = this.createErrorEmbed(
     "❌ Quest Join Failed",
     `You are already participating in another member-capped quest (**${otherQuest.title}**).`
    ).addFields({
     name: "RULE",
     value: "You can only join ONE member-capped quest at a time.",
     inline: false
    });
    
    await interaction.reply({ embeds: [errorEmbed] });
    return false;
   }
  }

  // Check if quest is full - quest vouchers allow joining even when full
  if (quest.participants.size >= quest.participantCap && !hasQuestVoucher) {
   await interaction.reply({
    content: `[quest.js]❌ The member-capped quest \`${quest.title}\` has reached its participant limit of ${quest.participantCap}.\n\n**💡 Tip:** Use a Quest Voucher to join even when the quest is full!`,
    flags: MessageFlags.Ephemeral,
   });
   return false;
  }

  return true;
 },

 // ------------------- Check Quest Voucher -------------------
 async checkQuestVoucher(interaction, userID) {
  try {
   const Character = require('@/models/CharacterModel');
   const character = await Character.findOne({ userId: userID });
   
   if (!character) return false;
   
   // Check if character has an active quest voucher
   return character.questVoucher === true;
  } catch (error) {
   logger.error('QUEST', `Error checking quest voucher for user ${userID}: ${error.message}`, error);
   return false;
  }
 },

 // ------------------- Handle Quest Voucher Usage -------------------
 async handleQuestVoucherUsage(interaction, quest, userID) {
  try {
   const Character = require('@/models/CharacterModel');
   const character = await Character.findOne({ userId: userID });
   
   if (!character || !character.questVoucher) return false;
   
   // Mark voucher as used for this quest
   character.questVoucher = false;
   character.questVoucherUsedAt = new Date();
   character.questVoucherUsedFor = quest.questID;
   await character.save();
   
   logger.info('QUEST', `Quest voucher used by ${character.name} for quest ${quest.questID}`);
   return true;
  } catch (error) {
   logger.error('QUEST', `Error handling quest voucher usage: ${error.message}`, error);
   return false;
  }
 },


 // ------------------- Get Capped Quest Statistics -------------------
 async getCappedQuestStatistics() {
  try {
   const activeCappedQuests = await Quest.find({
    participantCap: { $ne: null },
    status: "active"
   });
   
   const stats = {
    totalCappedQuests: activeCappedQuests.length,
    totalParticipants: 0,
    totalCapacity: 0,
    availableSpots: 0,
    fullQuests: 0
   };
   
   for (const quest of activeCappedQuests) {
    stats.totalParticipants += quest.participants.size;
    stats.totalCapacity += quest.participantCap;
    
    if (quest.participants.size >= quest.participantCap) {
     stats.fullQuests++;
    } else {
     stats.availableSpots += (quest.participantCap - quest.participants.size);
    }
   }
   
   return stats;
  } catch (error) {
   logger.error('QUEST', `Error getting capped quest statistics: ${error.message}`, error);
   return null;
  }
 },

 async handleQuestTypeRulesValidation(interaction, quest) {
  const validation = await validateQuestTypeRules(quest);
  
  if (!validation.valid) {
   await interaction.reply({
    content: `[quest.js]❌ ${validation.message}`,
    flags: MessageFlags.Ephemeral,
   });
   return false;
  }

  return true;
 },

 async assignQuestRole(interaction, quest, userID) {
  if (quest.roleID) {
   const role = interaction.guild.roles.cache.find((r) => r.id === quest.roleID);
   if (role) {
    const member = interaction.guild.members.cache.get(userID);
    if (member) {
     await member.roles.add(role);
    }
   }
  }
 },

 async addUserToRPThread(interaction, quest, userID, userName) {
  if (quest.questType.toLowerCase() === 'rp' && quest.rpThreadParentChannel) {
   try {
    const rpThread = interaction.guild.channels.cache.get(quest.rpThreadParentChannel);
    if (rpThread && rpThread.isThread()) {
     await rpThread.members.add(userID);
     logger.info('QUEST', `Added ${userName} to RP thread for quest ${quest.title}`);
    } else {
     logger.warn('QUEST', `RP thread not found for quest ${quest.title} (ID: ${quest.rpThreadParentChannel})`);
    }
   } catch (error) {
    logger.error('QUEST', `Failed to add user to RP thread: ${error.message}`, error);
   }
  }
 },

 // ============================================================================
 // ------------------- Quest Join Helper Methods -------------------
 // ============================================================================
 extractJoinData(interaction) {
  return {
   characterName: interaction.options.getString("charactername"),
   questID: interaction.options.getString("questid"),
   userID: interaction.user.id,
   userName: interaction.user.username
  };
 },

 async performJoinValidations(interaction, questID, characterName, userID) {
  // Validate quest exists and is active
  const quest = await this.validateQuest(interaction, questID);
  if (!quest) return { success: false };

  // Validate character ownership
  const character = await this.validateCharacter(interaction, characterName, userID);
  if (!character) return { success: false };

  // Validate quest participation eligibility
  const participationCheck = await this.handleQuestParticipationValidation(interaction, quest, userID, characterName);
  if (!participationCheck) return { success: false };

  // Check member-capped quest restrictions
  if (quest.participantCap) {
   const cappedQuestCheck = await this.checkCappedQuestRestrictions(interaction, quest, userID);
   if (!cappedQuestCheck) return { success: false };
  }

  // Validate quest type specific rules
  const questTypeCheck = await this.handleQuestTypeRulesValidation(interaction, quest);
  if (!questTypeCheck) return { success: false };

  // For RP quests, validate character is in the correct village
  if (quest.questType.toLowerCase() === QUEST_TYPES.RP.toLowerCase()) {
   const villageCheck = await this.handleRPQuestVillageValidation(interaction, quest, character);
   if (!villageCheck) return { success: false };
  }

  return { success: true, quest, character };
 },

 async processQuestJoin(interaction, quest, userID, characterName) {
  // Add role if quest has one
  await this.assignQuestRole(interaction, quest, userID);
  
  // Add participant to quest
  quest.addParticipant(userID, characterName);
 },

 async handleRPQuestJoin(quest, character) {
  const requiredVillages = extractVillageFromLocation(quest.location);
  
  if (requiredVillages) {
   const participant = quest.participants.get(character.userId);
   if (participant) {
    // Store the character's CURRENT village as their required village
    // This is the village they must stay in for the entire quest duration
    const characterVillage = character.currentVillage.toLowerCase();
    participant.requiredVillage = characterVillage;
    
    // Store all allowed villages on the quest (for reference)
    if (!quest.requiredVillage || !Array.isArray(quest.requiredVillages)) {
     quest.requiredVillages = requiredVillages;
    }
    
    // For backward compatibility, set requiredVillage to the first village
    if (!quest.requiredVillage) {
     quest.setRequiredVillage(requiredVillages[0]);
    }
   }
  }
 },

 // ============================================================================
 // ------------------- Quest Leave Helper Methods -------------------
 // ============================================================================
 async validateLeaveRequest(interaction, questID, userID) {
  const quest = await Quest.findOne({ questID });
  if (!quest) {
   await interaction.reply({
    content: `[quest.js]❌ Quest with ID \`${questID}\` does not exist.`,
    flags: MessageFlags.Ephemeral,
   });
   return { success: false };
  }

  if (!quest.participants.has(userID)) {
   await interaction.reply({
    content: `[quest.js]❌ You are not participating in the quest \`${quest.title}\`.`,
    flags: MessageFlags.Ephemeral,
   });
   return { success: false };
  }

  const participant = quest.participants.get(userID);
  const characterName = participant?.characterName;
  return { success: true, quest, characterName };
 },

 async processQuestLeave(interaction, quest, userID) {
  quest.removeParticipant(userID);
  await quest.save();

  // Remove role if quest has one
  if (quest.roleID) {
   const role = interaction.guild.roles.cache.find((r) => r.id === quest.roleID);
   if (role) {
    const member = interaction.guild.members.cache.get(userID);
    if (member && member.roles.cache.has(quest.roleID)) {
     await member.roles.remove(role);
    }
   }
  }
 },

 createLeaveMessage(quest, characterName) {
  let leaveMessage = `[quest.js]✅ You have left the quest **${quest.title}** (Character: **${characterName}**).`;

  if (quest.participantCap) {
   const wasFull = quest.participants.size >= quest.participantCap;
   leaveMessage += `\n**Note**: Since this was a member-capped quest, you can now join another member-capped quest if available.`;
   
   if (wasFull) {
    leaveMessage += `\n**🎯 Quest Status**: This quest now has an available spot!`;
   }
  }

  return leaveMessage;
 },

 // ============================================================================
 // ------------------- Quest List Helper Methods -------------------
 // ============================================================================
 createQuestListEmbed(interaction, quests) {
  const embed = createBaseEmbed(
   "Active Quests - Every Other Month Events!",
   "Official bimonthly quests! Smaller, optional, fun timed tasks for community rewards!",
   0x4A90E2
  );

  const questList = this.buildQuestList(interaction, quests.slice(0, 10));
  embed.setDescription(embed.data.description + "\n\n" + questList);

  if (quests.length > 10) {
   embed.setFooter({
    text: `Showing first 10 of ${quests.length} active quests`,
   });
  }

  embed.addFields({
   name: "🚀 How to Join",
   value: "```/quest join questid: [ID] charactername: [Name]```\n*Click on quest titles above to view full details!*\n\n🆘 **For Alien Defense quests:** Use \`RINGER\` as questid to join as backup!",
   inline: false,
  });

  return embed;
 },

 buildQuestList(interaction, quests) {
  const typeEmojis = {
   [QUEST_TYPES.RP.toLowerCase()]: '🎭',
   [QUEST_TYPES.ART.toLowerCase()]: '🎨',
   [QUEST_TYPES.WRITING.toLowerCase()]: '✍️',
   [QUEST_TYPES.INTERACTIVE.toLowerCase()]: '🎮',
   [QUEST_TYPES.ART_WRITING.toLowerCase()]: '🎨✍️'
  };

  return quests.map(quest => {
   const participantCount = quest.participantCap
    ? `${quest.participants.size}/${quest.participantCap}${quest.participants.size >= quest.participantCap ? " 🔒 FULL" : ""}`
    : `${quest.participants.size} 📝`;

   const questTypeEmoji = typeEmojis[quest.questType.toLowerCase()] || '📋';
   const questTypeDisplay = `${questTypeEmoji} ${quest.questType.toUpperCase()}`;

   const questLink = this.createQuestLink(interaction, quest);

   return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📜 **${questLink}**
🆔 ID: \`${quest.questID}\`
📋 Type: ${questTypeDisplay}
👥 Participants: ${participantCount}
📍 Location: ${quest.location}

`;
  }).join('');
 },

 createQuestLink(interaction, quest) {
  if (quest.messageID && quest.targetChannel) {
   const questUrl = `https://discord.com/channels/${interaction.guild.id}/${quest.targetChannel}/${quest.messageID}`;
   return `[${quest.title}](${questUrl})`;
  }
  return quest.title;
 },

 // ============================================================================
 // ------------------- Quest Status Helper Methods -------------------
 // ============================================================================
 async getUserActiveQuests(userID) {
  return await Quest.find({ 
   status: "active",
   [`participants.${userID}`]: { $exists: true }
  }).sort({ date: 1 });
 },

 createQuestStatusEmbed(interaction, userQuests, userID) {
  const embed = createBaseEmbed(
   "📊 Your Quest Status",
   "Here are all the quests you're currently participating in:",
   0x4A90E2
  );

  userQuests.forEach(quest => {
   const participant = quest.participants.get(userID);
   if (!participant) return;

   const questInfo = this.buildQuestStatusInfo(interaction, quest, participant);
   embed.addFields({
    name: '\u200b',
    value: questInfo,
    inline: false,
   });
  });

  embed.addFields({
   name: "💡 Tips",
   value: "• Use `/quest leave` to leave a quest\n• Use `/quest postcount` to check RP progress\n• Click quest titles to view full details!",
   inline: false,
  });

  return embed;
 },

 buildQuestStatusInfo(interaction, quest, participant) {
  const typeEmojis = {
   [QUEST_TYPES.RP.toLowerCase()]: '🎭',
   [QUEST_TYPES.ART.toLowerCase()]: '🎨',
   [QUEST_TYPES.WRITING.toLowerCase()]: '✍️',
   [QUEST_TYPES.INTERACTIVE.toLowerCase()]: '🎮',
   [QUEST_TYPES.ART_WRITING.toLowerCase()]: '🎨✍️'
  };
  
  const questTypeEmoji = typeEmojis[quest.questType.toLowerCase()] || '📋';
  const questTypeDisplay = `${questTypeEmoji} ${quest.questType.toUpperCase()}`;
  const questLink = this.createQuestLink(interaction, quest);

  let questInfo = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📜 **${questLink}**
🆔 ID: \`${quest.questID}\`
📋 Type: ${questTypeDisplay}
👤 Character: **${participant.characterName}**
📊 Status: **${participant.progress.toUpperCase()}**
📍 Location: ${quest.location}`;

  // Add quest-specific progress info
  if (quest.questType.toLowerCase() === QUEST_TYPES.RP.toLowerCase() && quest.postRequirement) {
   const rpPostCount = participant.rpPostCount || 0;
   const progress = Math.min((rpPostCount / quest.postRequirement) * 100, 100);
   questInfo += `\n📝 RP Progress: ${rpPostCount}/${quest.postRequirement} posts (${Math.round(progress)}%)`;
  }

  if (quest.participantCap) {
   const participantCount = quest.participants.size;
   questInfo += `\n👥 Quest Status: ${participantCount}/${quest.participantCap} participants`;
  }

  // Add submission info if available
  if (participant.submissions && participant.submissions.length > 0) {
   const approvedSubmissions = participant.submissions.filter(sub => sub.approved).length;
  if (quest.questType === QUEST_TYPES.ART_WRITING) {
   const artSubmissions = participant.submissions.filter(sub => sub.type === 'art' && sub.approved).length;
   const writingSubmissions = participant.submissions.filter(sub => sub.type === 'writing' && sub.approved).length;
   questInfo += `\n✅ Submissions: ${artSubmissions} art, ${writingSubmissions} writing (need both)`;
  } else {
   questInfo += `\n✅ Submissions: ${approvedSubmissions} approved`;
  }
  }

  return questInfo;
 },

 // ============================================================================
 // ------------------- Post Count Helper Methods -------------------
 // ============================================================================
 async createPostCountEmbed(interaction, quest, participants) {
  const { requirementValue, requirementText } = this.getQuestRequirements(quest);
  const participantList = await this.buildParticipantList(interaction, quest, participants, requirementValue, requirementText);
  
  const embed = createBaseEmbed(
   `📊 ${quest.questType} Quest Progress: ${quest.title}`,
   `Quest ID: ${quest.questID}`,
   QUEST_COLORS.INFO
  );
  
  embed.addFields(
   { name: quest.questType === 'RP' ? 'Post Requirement' : 'Roll Requirement', value: `${requirementValue} ${requirementText}`, inline: true },
   { name: 'Participants', value: participants.length.toString(), inline: true }
  );
  
  embed.addFields({
   name: '__Participant Progress__',
   value: participantList.length > 1024 ? participantList.substring(0, 1021) + '...' : participantList,
   inline: false
  });
  
  embed.addFields({
   name: quest.questType === 'RP' ? '__❌ Posts That DON\'T Count__' : '__🎲 Table Roll Instructions__',
   value: this.getQuestInstructions(quest, requirementValue),
   inline: false
  });
  
  embed.addFields({
   name: quest.questType === 'RP' ? '__💬 Meta Comments__' : '__📊 Quest Progress__',
   value: this.getQuestMetaInfo(quest),
   inline: false
  });

  // Add table roll information for RP quests if applicable
  if (quest.questType === 'RP' && quest.tableroll) {
   embed.addFields({
    name: '__🎲 Optional Table Roll__',
    value: `This RP quest has an optional table roll available!\n• Use </tableroll roll:1389946995468271729> to roll on **${quest.tableroll}** table\n• Table rolls are optional and don't affect quest completion\n• They may provide additional rewards or flavor text`,
    inline: false
   });
  }

  return embed;
 },

 getQuestRequirements(quest) {
  if (quest.questType === QUEST_TYPES.RP) {
   return { requirementValue: quest.postRequirement || 15, requirementText: "posts" };
  } else if (quest.questType === QUEST_TYPES.INTERACTIVE) {
   return { requirementValue: quest.requiredRolls || 1, requirementText: "successful rolls" };
  }
  return { requirementValue: 0, requirementText: "" };
 },

 async buildParticipantList(interaction, quest, participants, requirementValue, requirementText) {
  const participantList = await Promise.all(
   participants.map(async (participant) => {
    try {
     const user = await interaction.client.users.fetch(participant.userId);
     return this.formatParticipantStatus(quest, participant, user.username, requirementValue, requirementText);
    } catch (error) {
     return this.formatParticipantStatus(quest, participant, participant.userId, requirementValue, requirementText);
    }
   })
  );
  return participantList.join('\n');
 },

 formatParticipantStatus(quest, participant, username, requirementValue, requirementText) {
  let status = "❌";
  let statusText = "";
  let progressText = "";
  
  if (participant.progress === 'disqualified') {
   status = "🚫";
   statusText = ` (DISQUALIFIED: ${participant.disqualificationReason || 'Left quest village'})`;
  } else if (quest.questType === QUEST_TYPES.RP) {
   if (participant.rpPostCount >= requirementValue) {
    status = "✅";
   }
   progressText = `${participant.rpPostCount}/${requirementValue} ${requirementText}`;
  } else if (quest.questType === QUEST_TYPES.INTERACTIVE) {
   if (participant.successfulRolls >= requirementValue) {
    status = "✅";
   }
   progressText = `${participant.successfulRolls}/${requirementValue} ${requirementText}`;
   if (participant.tableRollResults && participant.tableRollResults.length > 0) {
    const totalRolls = participant.tableRollResults.length;
    progressText += ` (${totalRolls} total rolls)`;
   }
  }
  
  return `${status} **${participant.characterName}** (${username}): ${progressText}${statusText}`;
 },

 getQuestInstructions(quest, requirementValue) {
  if (quest.questType === QUEST_TYPES.RP) {
   return `• Messages under 20 characters\n• Just emojis or reactions\n• GIFs/stickers without text\n• Messages with "))" (reaction posts)\n• Just numbers, symbols, or punctuation\n• Single words repeated multiple times\n• URLs, mentions, or pings only\n• Keyboard mashing or spam\n• Messages with less than 30% letters`;
  } else {
   return `• Use </tableroll roll:1389946995468271729> to roll on the ${quest.tableRollName} table\n• Each successful roll counts toward your quest progress\n• Check your progress with this command\n• Quest completes when you reach ${requirementValue} successful rolls`;
  }
 },

 getQuestMetaInfo(quest) {
  if (quest.questType === QUEST_TYPES.RP) {
   return `If you want to talk outside of the RP for meta reasons, please use the gossip and mossy stone or format your comments in this thread "like this text lorem ipsum yada yada ))" - messages with this format don't count as RP posts.`;
  } else {
   return `Use this command to check your table roll progress. Each successful roll on the ${quest.tableRollName} table counts toward completing the quest.`;
  }
 },


};
