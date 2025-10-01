const { SlashCommandBuilder, PermissionFlagsBits } = require("@discordjs/builders");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { handleInteractionError } = require("../../utils/globalErrorHandler");
const Quest = require("../../models/QuestModel");
const Character = require("../../models/CharacterModel");
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
    postcount: () => this.handlePostCount(interaction)
   };

   const handler = handlers[subcommand];
   if (handler) {
    await handler();
   } else {
    await interaction.reply({
     content: "[quest.js]❌ Unknown subcommand.",
     ephemeral: true,
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
   ephemeral: true,
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
    ephemeral: true,
   });
  }

  const embed = this.createQuestListEmbed(interaction, quests);
  return interaction.reply({ embeds: [embed], ephemeral: true });
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
     ephemeral: true,
    });
   }

   const embed = this.createQuestStatusEmbed(interaction, userQuests, userID);
   return interaction.reply({ embeds: [embed], ephemeral: true });

  } catch (error) {
   console.error('[quest.js]❌ Error in handleQuestStatus:', error);
   return interaction.reply({
    content: "[quest.js]❌ An error occurred while checking your quest status.",
    ephemeral: true,
   });
  }
 },

 // ============================================================================
 // ------------------- Quest Embed Update Handler -------------------
 // ============================================================================
 async updateQuestEmbed(guild, quest, client = null, updateSource = 'questJoin') {
  try {
   if (!quest || !quest.messageID) {
    console.log(`[quest.js]⚠️ No quest or messageID provided, skipping embed update`);
    return { success: false, reason: 'No quest or messageID' };
   }

   const questID = quest.questID || quest.questId;
   if (!questID) {
    console.log(`[quest.js]⚠️ No questID found, skipping embed update`);
    return { success: false, reason: 'No questID' };
   }

  // Check if we're already updating this quest
  if (this.isQuestBeingUpdated(questID)) {
   console.log(`[quest.js]⏳ Quest ${questID} is already being updated, queuing request from ${updateSource}`);
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
   console.error(`[quest.js]❌ Error updating quest embed:`, error);
   
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
   console.log(`[quest.js]🔄 Processing queued update for quest ${questID} from ${latestUpdate.updateSource}`);
   await this.updateQuestEmbed(null, latestUpdate.quest, latestUpdate.client, latestUpdate.updateSource);
  }
 },

 // ============================================================================
 // ------------------- Core Update Logic -------------------
 // ============================================================================
 async performEmbedUpdate(quest, client, updateSource) {
  try {
   console.log(`[quest.js]🔄 Updating embed for quest ${quest.questID || quest.questId} from ${updateSource}`);

   // Get the quest channel and message
   const questChannelId = quest.targetChannel || QUEST_CHANNEL_ID;
   const questChannel = client.channels.cache.get(questChannelId);
   
   if (!questChannel) {
    console.log(`[quest.js]⚠️ Quest channel not found (${questChannelId})`);
    return { success: false, reason: 'Channel not found' };
   }

   const questMessage = await questChannel.messages.fetch(quest.messageID);
   if (!questMessage) {
    console.log(`[quest.js]⚠️ Quest message not found (${quest.messageID})`);
    return { success: false, reason: 'Message not found' };
   }

   // Get current embed
   const currentEmbed = questMessage.embeds[0];
   if (!currentEmbed) {
    console.log(`[quest.js]⚠️ No embed found in quest message`);
    return { success: false, reason: 'No embed found' };
   }

   // Create updated embed based on quest type
   const updatedEmbed = await this.createUpdatedEmbed(quest, client, currentEmbed, updateSource);

   // Update the message
   await questMessage.edit({ embeds: [updatedEmbed] });

   console.log(`[quest.js]✅ Successfully updated quest embed for ${quest.questID || quest.questId}`);
   return { success: true, reason: 'Updated successfully' };

  } catch (error) {
   console.error(`[quest.js]❌ Error performing embed update:`, error);
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
   console.error(`[quest.js]❌ Error creating updated embed:`, error);
   return currentEmbed; // Return original embed on error
  }
 },

 async updateParticipantFields(quest, client, embed) {
  try {
   const participants = quest.participants ? Array.from(quest.participants.values()) : [];
   
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
   console.error(`[quest.js]❌ Error updating participant fields:`, error);
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
                     quest.status === 'completed' ? '✅ Completed' : 
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
   console.error(`[quest.js]❌ Error updating status fields:`, error);
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
    const participants = quest.participants ? Array.from(quest.participants.values()) : [];
    
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
   console.error(`[quest.js]❌ Error updating RP quest fields:`, error);
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
     const participants = quest.participants ? Array.from(quest.participants.values()) : [];
     
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
   console.error(`[quest.js]❌ Error updating interactive quest fields:`, error);
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
   console.error(`[quest.js]❌ Error updating quest-specific fields:`, error);
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
   console.error(`[quest.js]❌ Error updating footer:`, error);
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
     ephemeral: true,
    });
   }

   if (quest.questType !== QUEST_TYPES.RP && quest.questType !== QUEST_TYPES.INTERACTIVE) {
    return interaction.reply({
     content: "[quest.js]❌ This command only works with RP and Interactive quests. The specified quest is not an RP or Interactive quest.",
     ephemeral: true,
    });
   }

   const participants = Array.from(quest.participants.values());
   if (participants.length === 0) {
    return interaction.reply({
     content: "[quest.js]❌ No participants found for this quest.",
     ephemeral: true,
    });
   }

   const embed = this.createPostCountEmbed(interaction, quest, participants);
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
    ephemeral: true,
   });
  }
 },

 // ============================================================================
 // ------------------- Validation Helper Methods -------------------
 // ============================================================================
 async validateQuest(interaction, questID) {
  const quest = await Quest.findOne({ questID });
  if (!quest) {
   await interaction.reply({
    content: `[quest.js]❌ Quest with ID \`${questID}\` does not exist.`,
    ephemeral: true,
   });
   return null;
  }

  if (quest.status !== "active") {
   await interaction.reply({
    content: `[quest.js]❌ The quest \`${quest.title}\` is no longer active.`,
    ephemeral: true,
   });
   return null;
  }

  const now = new Date();
  if (quest.signupDeadline) {
   const deadline = new Date(quest.signupDeadline);
   if (now > deadline) {
    await interaction.reply({
     content: `[quest.js]❌ The signup deadline for quest \`${quest.title}\` has passed.`,
     ephemeral: true,
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
    ephemeral: true,
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
    ephemeral: true,
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

  embed.addFields({
   name: '💡 Want to join this quest?',
   value: `</quest join:1389946995468271729>`,
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
    ephemeral: true,
   });
   return false;
  }

  return true;
 },

 // ------------------- Check Quest Voucher -------------------
 async checkQuestVoucher(interaction, userID) {
  try {
   const Character = require("../../models/CharacterModel");
   const character = await Character.findOne({ userId: userID });
   
   if (!character) return false;
   
   // Check if character has an active quest voucher
   return character.questVoucher === true;
  } catch (error) {
   console.error(`[quest.js] Error checking quest voucher for user ${userID}:`, error);
   return false;
  }
 },

 // ------------------- Handle Quest Voucher Usage -------------------
 async handleQuestVoucherUsage(interaction, quest, userID) {
  try {
   const Character = require("../../models/CharacterModel");
   const character = await Character.findOne({ userId: userID });
   
   if (!character || !character.questVoucher) return false;
   
   // Mark voucher as used for this quest
   character.questVoucher = false;
   character.questVoucherUsedAt = new Date();
   character.questVoucherUsedFor = quest.questID;
   await character.save();
   
   console.log(`[quest.js] ✅ Quest voucher used by ${character.name} for quest ${quest.questID}`);
   return true;
  } catch (error) {
   console.error(`[quest.js] Error handling quest voucher usage:`, error);
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
   console.error(`[quest.js] Error getting capped quest statistics:`, error);
   return null;
  }
 },

 async handleQuestTypeRulesValidation(interaction, quest) {
  const validation = await validateQuestTypeRules(quest);
  
  if (!validation.valid) {
   await interaction.reply({
    content: `[quest.js]❌ ${validation.message}`,
    ephemeral: true,
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
     console.log(`[quest.js]✅ Added ${userName} to RP thread for quest ${quest.title}`);
    } else {
     console.log(`[quest.js]⚠️ RP thread not found for quest ${quest.title} (ID: ${quest.rpThreadParentChannel})`);
    }
   } catch (error) {
    console.error(`[quest.js]❌ Failed to add user to RP thread: ${error.message}`);
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
    ephemeral: true,
   });
   return { success: false };
  }

  if (!quest.participants.has(userID)) {
   await interaction.reply({
    content: `[quest.js]❌ You are not participating in the quest \`${quest.title}\`.`,
    ephemeral: true,
   });
   return { success: false };
  }

  const characterName = quest.participants.get(userID);
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
   value: "```/quest join questid: [ID] charactername: [Name]```\n*Click on quest titles above to view full details!*",
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
 createPostCountEmbed(interaction, quest, participants) {
  const { requirementValue, requirementText } = this.getQuestRequirements(quest);
  const participantList = this.buildParticipantList(interaction, quest, participants, requirementValue, requirementText);
  
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
