const {
 SlashCommandBuilder,
 PermissionFlagsBits,
} = require("@discordjs/builders");
const { handleError } = require("../../utils/globalErrorHandler");
const {
 EmbedBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle,
 MessageFlags,
} = require("discord.js");
const Quest = require("../../models/QuestModel");
const Character = require("../../models/CharacterModel");

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================
const QUEST_CHANNEL_ID = "1305486549252706335";
const RP_SIGNUP_WINDOW_DAYS = 7;
const EMBED_COLORS = {
 SUCCESS: 0x00ff00,
 ERROR: 0xff0000,
 INFO: 0x0099ff,
};
const BORDER_IMAGE = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================
module.exports = {
 data: new SlashCommandBuilder()
  .setName("quest")
  .setDescription(
   "Quest participation system - join, submit, and manage your quest participation!"
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("join")
    .setDescription("Join a quest with your character")
    .addStringOption((option) =>
     option
      .setName("questid")
      .setDescription("The ID of the quest you want to join")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("The name of your character")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("leave")
    .setDescription("Leave a quest you are currently participating in")
    .addStringOption((option) =>
     option
      .setName("questid")
      .setDescription("The ID of the quest you want to leave")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand.setName("list").setDescription("List all active quests from the quest board")
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("postcount")
    .setDescription("Display post counts for all participants in an RP quest")
    .addStringOption((option) =>
     option
      .setName("questid")
      .setDescription("ID of the RP quest to check post counts for")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("attend")
    .setDescription("Mark a walk-in as attended (Admin only)")
    .addStringOption((option) =>
     option
      .setName("questid")
      .setDescription("ID of the quest")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addUserOption((option) =>
     option
      .setName("user")
      .setDescription("User to mark as attended")
      .setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("character")
      .setDescription("Character name")
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
   switch (subcommand) {
    case "join":
     await this.handleJoinQuest(interaction);
     break;
    case "leave":
     await this.handleLeaveQuest(interaction);
     break;
    case "attend":
     await this.handleQuestAttend(interaction);
     break;
    case "list":
     await this.handleListQuests(interaction);
     break;
    case "postcount":
     await this.handlePostCount(interaction);
     break;
    default:
     await interaction.reply({
      content: "Unknown subcommand.",
      ephemeral: true,
     });
   }
  } catch (error) {
   handleError(error, "quest.js", {
    commandName: "quest",
    userTag: interaction.user.tag,
    userId: interaction.user.id,
    options: interaction.options.data,
   });

   if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({
     content: "[quest.js]❌ An error occurred while processing your request. Please try again later.",
     ephemeral: true,
    });
   }
  }
 },

 // ============================================================================
 // ------------------- Quest Join Handler -------------------
 // ============================================================================
 async handleJoinQuest(interaction) {
  const characterName = interaction.options.getString("charactername");
  const questID = interaction.options.getString("questid");
  const userID = interaction.user.id;
  const userName = interaction.user.username;

  // Validate quest exists and is active
  const quest = await this.validateQuest(interaction, questID);
  if (!quest) return;

  // Validate character ownership
  const character = await this.validateCharacter(interaction, characterName, userID);
  if (!character) return;

  // Validate quest participation eligibility
  const participationCheck = await this.validateQuestParticipation(interaction, quest, userID, characterName);
  if (!participationCheck) return;

  // Check member-capped quest restrictions
  if (quest.participantCap) {
   const cappedQuestCheck = await this.checkCappedQuestRestrictions(interaction, quest, userID);
   if (!cappedQuestCheck) return;
  }

  // Validate quest type specific rules
  const questTypeCheck = await this.validateQuestTypeRules(interaction, quest);
  if (!questTypeCheck) return;

  // Add role if quest has one
  await this.assignQuestRole(interaction, quest, userID);

  // Add participant to quest
  quest.addParticipant(userID, characterName);
  await quest.save();

  // Update quest embed
  await this.updateQuestEmbed(interaction.guild, quest, interaction.client);

  // Add user to RP thread if applicable
  await this.addUserToRPThread(interaction, quest, userID, userName);

  // Send success response
  const successEmbed = this.createSuccessEmbed(quest, characterName, userName, character);
  return interaction.reply({ embeds: [successEmbed] });
 },

 // ============================================================================
 // ------------------- Quest Leave Handler -------------------
 // ============================================================================
 async handleLeaveQuest(interaction) {
  const questID = interaction.options.getString("questid");
  const userID = interaction.user.id;

  const quest = await Quest.findOne({ questID });
  if (!quest) {
   return interaction.reply({
    content: `[quest.js]❌ Quest with ID \`${questID}\` does not exist.`,
    ephemeral: true,
   });
  }

  if (!quest.participants.has(userID)) {
   return interaction.reply({
    content: `[quest.js]❌ You are not participating in the quest \`${quest.title}\`.`,
    ephemeral: true,
   });
  }

  const characterName = quest.participants.get(userID);
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

  await this.updateQuestEmbed(interaction.guild, quest, interaction.client);

  let leaveMessage = `[quest.js]✅ You have left the quest **${quest.title}** (Character: **${characterName}**).`;

  if (quest.participantCap) {
   leaveMessage += `\n**Note**: Since this was a member-capped quest, you can now join another member-capped quest if available.`;
  }

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
    content:
     "No active quests available.\n\n**About Quests**: Quests are posted on the quest board and are smaller, optional, fun timed tasks that happen every other month! They can be Art, Writing, Interactive, or RP based.",
    ephemeral: true,
   });
  }

  const embed = new EmbedBuilder()
   .setColor(EMBED_COLORS.INFO)
   .setTitle("Active Quests - Every Other Month Events!")
   .setDescription("Smaller, optional, fun timed tasks for community rewards!")
   .setImage(BORDER_IMAGE)
   .setTimestamp();

  quests.slice(0, 10).forEach((quest) => {
   const participantCount = quest.participantCap
    ? `${quest.participants.size}/${quest.participantCap} ${
       quest.participants.size >= quest.participantCap ? "(FULL)" : ""
      }`
    : quest.participants.size.toString();

   let questInfo = `**ID**: ${
    quest.questID
   }\n**Type**: ${quest.questType.toUpperCase()}\n**Location**: ${
    quest.location
   }\n**Participants**: ${participantCount}\n   **Reward**: ${
    quest.getNormalizedTokenReward ? quest.getNormalizedTokenReward() : (quest.tokenReward || 0)
   } tokens`;

   if (quest.participantCap) {
    questInfo += `\n**Member-Capped Quest**`;
   }

   if (quest.questType.toLowerCase() === "rp") {
    questInfo += `\n**RP**: ${
     quest.postRequirement || 15
    }-20 posts, 2 para max`;
   }

   embed.addFields({
    name: `${quest.title}`,
    value: questInfo,
    inline: true,
   });
  });

  if (quests.length > 10) {
   embed.setFooter({
    text: `Showing first 10 of ${quests.length} active quests`,
   });
  }

  embed.addFields({
   name: "Quest Rules Reminder",
   value:
    "• Only **ONE** member-capped quest per person\n• RP quests: 1-week signup window\n• Art/Writing/Interactive: No signup deadline\n• Use Quest Vouchers for guaranteed spots!",
   inline: false,
  });

  return interaction.reply({ embeds: [embed], ephemeral: true });
 },

 // ============================================================================
 // ------------------- Quest Embed Update Handler -------------------
 // ============================================================================
 async updateQuestEmbed(guild, quest, client = null) {
  if (!quest.messageID) {
   console.log(`[quest.js]⚠️ No messageID for quest ${quest.title}, skipping embed update`);
   return;
  }

  try {
   const questChannelId = quest.targetChannel || QUEST_CHANNEL_ID;
   const questChannel = guild.channels.cache.get(questChannelId);
   if (!questChannel) {
    console.log(`[quest.js]⚠️ Quest channel not found (${questChannelId})`);
    return;
   }

   const questMessage = await questChannel.messages.fetch(quest.messageID);
   if (!questMessage) {
    console.log(`[quest.js]⚠️ Quest message not found (${quest.messageID})`);
    return;
   }

   const embed = EmbedBuilder.from(questMessage.embeds[0]);
   const participantEntries = Array.from(quest.participants.entries());
   
   const participantList = await Promise.all(
    participantEntries.map(async ([userId, participant]) => {
     try {
      if (client) {
        const user = await client.users.fetch(userId);
        return `• ${participant.characterName} (${user.username})`;
      } else {
        return `• ${participant.characterName} (${userId})`;
      }
     } catch (error) {
      return `• ${participant.characterName} (${userId})`;
     }
    })
   );

   const participantListText = participantList.length > 0 ? participantList.join("\n") : "None";
   console.log(`[quest.js]✅ Updating embed for quest ${quest.title} with ${participantEntries.length} participants`);

   const existingParticipantsFieldIndex = embed.data.fields.findIndex(field => 
    field.name.includes("Participants") || field.name.includes("👥")
   );

   const participantCount = quest.participantCap
    ? `${participantEntries.length}/${quest.participantCap}${
       participantEntries.length >= quest.participantCap ? " - FULL" : ""
      }`
    : `${participantEntries.length}`;

   const participantsField = {
    name: `👥 __Participants__ (${participantCount})`,
    value: participantListText.length > 1024
     ? participantListText.substring(0, 1021) + "..."
     : participantListText,
    inline: false
   };

   if (existingParticipantsFieldIndex >= 0) {
    embed.data.fields[existingParticipantsFieldIndex] = participantsField;
    console.log(`[quest.js]✅ Updated existing participants field for quest ${quest.title}`);
   } else {
    embed.addFields(participantsField);
    console.log(`[quest.js]✅ Added new participants field for quest ${quest.title}`);
   }

   await questMessage.edit({ embeds: [embed] });
   console.log(`[quest.js]✅ Successfully updated quest embed for ${quest.title}`);
  } catch (error) {
   console.warn("[quest.js]❌ Failed to update quest embed:", error);
  }
 },

 // ============================================================================
 // ------------------- Quest Attend Handler -------------------
 // ============================================================================
 async handleQuestAttend(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
   return interaction.reply({
    content: "[quest.js]❌ You need administrator permissions to mark attendance.",
    ephemeral: true,
   });
  }

  const questID = interaction.options.getString("questid");
  const user = interaction.options.getUser("user");
  const characterName = interaction.options.getString("character");

  try {
   // Find the quest
   const quest = await Quest.findOne({ questID });
   if (!quest) {
    return interaction.reply({
     content: `[quest.js]❌ Quest with ID \`${questID}\` does not exist.`,
     ephemeral: true,
    });
   }

   if (quest.status !== "active") {
    return interaction.reply({
     content: `[quest.js]❌ The quest \`${quest.title}\` is no longer active.`,
     ephemeral: true,
    });
   }

   const character = await Character.findOne({
    name: characterName,
    userId: user.id,
   });

   if (!character) {
    return interaction.reply({
     content: `[quest.js]❌ Character \`${characterName}\` does not exist for user ${user.username}.`,
     ephemeral: true,
    });
   }

   // Get or create participant record
   let participant = quest.getParticipant(user.id);
   
   if (!participant) {
    participant = quest.addParticipant(user.id, characterName);
   }

   // Mark as attended (walk-in)
   participant.attended = true;
   participant.signedUp = participant.signedUp || false; // Preserve original signup status

   // Save quest with updated participant data
   await quest.save();

   const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.SUCCESS)
    .setTitle("✅ Walk-in Marked as Attended")
    .setDescription(`**${characterName}** (${user.username}) has been marked as attended for quest **${quest.title}**.`)
    .addFields(
     { name: "Quest ID", value: questID, inline: true },
     { name: "Character", value: characterName, inline: true },
     { name: "User", value: user.username, inline: true }
    )
    .setImage(BORDER_IMAGE)
    .setTimestamp();

   return interaction.reply({ embeds: [embed], ephemeral: true });

  } catch (error) {
   handleError(error, "quest.js", {
    commandName: "quest attend",
    userTag: interaction.user.tag,
    userId: interaction.user.id,
    questID: questID
   });

   return interaction.reply({
    content: "[quest.js]❌ An error occurred while marking attendance. Please try again later.",
    ephemeral: true,
   });
  }
 },

 // ============================================================================
 // ------------------- Quest Post Count Handler -------------------
 // ============================================================================
 async handlePostCount(interaction) {
  try {
   const questID = interaction.options.getString("questid");

   // Find the quest by questID field instead of MongoDB _id
   const quest = await Quest.findOne({ questID: questID });
   if (!quest) {
    return interaction.reply({
     content: "[quest.js]❌ Quest not found. Please check the quest ID and try again.",
     ephemeral: true,
    });
   }

   if (quest.questType !== "RP") {
    return interaction.reply({
     content: "[quest.js]❌ This command only works with RP quests. The specified quest is not an RP quest.",
     ephemeral: true,
    });
   }

     // Get participant details
  const participants = Array.from(quest.participants.values());
  
  if (participants.length === 0) {
   return interaction.reply({
    content: "[quest.js]❌ No participants found for this quest.",
    ephemeral: true,
   });
  }

  // Get post requirement
  const postRequirement = quest.postRequirement || 15;

  // Create participant list with post counts and usernames
  const participantList = await Promise.all(
   participants.map(async (participant) => {
    try {
     const user = await interaction.client.users.fetch(participant.userId);
     const status = participant.rpPostCount >= postRequirement ? "✅" : "❌";
     return `${status} **${participant.characterName}** (${user.username}): ${participant.rpPostCount}/${postRequirement} posts`;
    } catch (error) {
     // Fallback to user ID if username can't be fetched
     const status = participant.rpPostCount >= postRequirement ? "✅" : "❌";
     return `${status} **${participant.characterName}** (${participant.userId}): ${participant.rpPostCount}/${postRequirement} posts`;
    }
   })
  );

   const participantListText = participantList.join('\n');

   const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.INFO)
    .setTitle(`📊 RP Quest Post Counts: ${quest.title}`)
    .setDescription(`Quest ID: ${quest.questID || questID}`)
    .addFields(
     { name: 'Post Requirement', value: `${postRequirement} posts`, inline: true },
     { name: 'Participants', value: participants.length.toString(), inline: true }
    )
    .addFields({
     name: '__Participant Progress__',
     value: participantListText.length > 1024 ? participantListText.substring(0, 1021) + '...' : participantListText,
     inline: false
    })
    .addFields({
     name: '__❌ Posts That DON\'T Count__',
     value: `• Messages under 20 characters\n• Just emojis or reactions\n• GIFs/stickers without text\n• Messages with "))" (reaction posts)\n• Just numbers, symbols, or punctuation\n• Single words repeated multiple times\n• URLs, mentions, or pings only\n• Keyboard mashing or spam\n• Messages with less than 30% letters`,
     inline: false
    })
    .addFields({
     name: '__💬 Meta Comments__',
     value: `If you want to talk outside of the RP for meta reasons, please use the gossip and mossy stone or format your comments in this thread "like this text lorem ipsum yada yada ))" - messages with this format don't count as RP posts.`,
     inline: false
    })
    .setImage(BORDER_IMAGE)
    .setTimestamp();

   return interaction.reply({ embeds: [embed] });

  } catch (error) {
   handleError(error, "quest.js", {
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

 async validateQuestParticipation(interaction, quest, userID, characterName) {
  if (quest.participants.has(userID)) {
   await interaction.reply({
    content: `[quest.js]❌ You are already participating in the quest \`${quest.title}\` with character **${quest.participants.get(userID)}**.`,
    ephemeral: true,
   });
   return false;
  }

  // Check if this character is already in this quest (by any user)
  const participants = Array.from(quest.participants.values());
  const characterAlreadyInQuest = participants.some(participant => 
   participant.characterName.toLowerCase() === characterName.toLowerCase()
  );

  if (characterAlreadyInQuest) {
   await interaction.reply({
    content: `[quest.js]❌ Character **${characterName}** is already participating in the quest \`${quest.title}\`!`,
    ephemeral: true,
   });
   return false;
  }

  // Check if this character has previously left this quest
  if (quest.hasCharacterLeft(characterName)) {
   await interaction.reply({
    content: `[quest.js]❌ Character **${characterName}** has already left the quest \`${quest.title}\` and cannot rejoin!`,
    ephemeral: true,
   });
   return false;
  }

  return true;
 },

 // ============================================================================
 // ------------------- Embed Creation Helper Methods -------------------
 // ============================================================================
 createSuccessEmbed(quest, characterName, userName, character) {
  const participantCount = quest.participants ? quest.participants.size : 0;
  const slotsLeft = quest.participantCap ? quest.participantCap - participantCount : 'Unlimited';
  const slotsText = quest.participantCap ? `${participantCount}/${quest.participantCap} (${slotsLeft} slots left)` : `${participantCount} participants`;

  const embed = new EmbedBuilder()
   .setColor(EMBED_COLORS.SUCCESS)
   .setTitle(`🎯 Quest Joined Successfully!`)
   .setDescription(`**${characterName}** (${userName}) joined the quest **${quest.title}**!`)
   .addFields(
    { name: 'Quest ID', value: `\`${quest.questID}\``, inline: true },
    { name: 'Quest Type', value: quest.questType, inline: true },
    { name: 'Location', value: quest.location, inline: true },
    { name: 'Participants', value: slotsText, inline: true },
    { name: 'Time Limit', value: quest.timeLimit, inline: true },
    { name: 'Token Reward', value: `${quest.getNormalizedTokenReward ? quest.getNormalizedTokenReward() : (quest.tokenReward || 0)} tokens`, inline: true }
   )
   .setImage(BORDER_IMAGE)
   .setTimestamp();

  if (character.icon) {
   embed.setThumbnail(character.icon);
  }

  embed.addFields({
   name: '💡 Want to join this quest?',
   value: `Use \`/quest join questid:${quest.questID} charactername:YourCharacter\``,
   inline: false
  });

  return embed;
 },

 createErrorEmbed(title, description) {
  return new EmbedBuilder()
   .setColor(EMBED_COLORS.ERROR)
   .setTitle(title)
   .setDescription(description)
   .setImage(BORDER_IMAGE)
   .setTimestamp();
 },

 // ============================================================================
 // ------------------- Quest Join Helper Methods -------------------
 // ============================================================================
 async checkCappedQuestRestrictions(interaction, quest, userID) {
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

  if (quest.participants.size >= quest.participantCap) {
   await interaction.reply({
    content: `[quest.js]❌ The member-capped quest \`${quest.title}\` has reached its participant limit of ${quest.participantCap}. Consider getting a Quest Voucher if you miss consecutive member-capped quests!`,
    ephemeral: true,
   });
   return false;
  }

  return true;
 },

 async validateQuestTypeRules(interaction, quest) {
  const now = new Date();
  
  switch (quest.questType.toLowerCase()) {
   case "rp":
    if (quest.posted) {
     const questPostDate = new Date(quest.date);
     const rpSignupDeadline = new Date(
      questPostDate.getTime() + RP_SIGNUP_WINDOW_DAYS * 24 * 60 * 60 * 1000
     );

     if (now > rpSignupDeadline) {
      await interaction.reply({
       content: `[quest.js]❌ The signup window for RP quest \`${quest.title}\` has closed. **RULE**: RP quests have a 1-week signup window after posting.`,
       ephemeral: true,
      });
      return false;
     }
    }
    break;

   case "art":
   case "writing":
   case "interactive":
    break;
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

};
