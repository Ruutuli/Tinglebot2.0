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
} = require("discord.js");
const Quest = require("../../models/QuestModel");
const Character = require("../../models/CharacterModel");
const QUEST_CHANNEL_ID = "1305486549252706335";

module.exports = {
 data: new SlashCommandBuilder()
  .setName("quest")
  .setDescription(
   "Quest management system - smaller, optional, fun timed tasks for rewards!"
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("join")
    .setDescription("Join a quest with your character")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("The name of your character")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("questid")
      .setDescription("The ID of the quest you want to join")
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
   subcommand
    .setName("create")
    .setDescription("Create a new quest (Admin only)")
    .addStringOption((option) =>
     option.setName("title").setDescription("Quest title").setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("description")
      .setDescription("Quest description")
      .setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("type")
      .setDescription("Quest type")
      .setRequired(true)
      .addChoices(
       { name: "Art", value: "art" },
       { name: "Writing", value: "writing" },
       { name: "Interactive", value: "interactive" },
       { name: "RP", value: "rp" }
      )
    )
    .addStringOption((option) =>
     option
      .setName("location")
      .setDescription("Quest location")
      .setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("timelimit")
      .setDescription("Quest time limit (explicit start and end date/time)")
      .setRequired(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("tokenreward")
      .setDescription("Token reward for completion")
      .setRequired(true)
      .setMinValue(0)
    )
    .addStringOption((option) =>
     option
      .setName("questid")
      .setDescription("Unique quest ID")
      .setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("date")
      .setDescription("Quest start date (YYYY-MM-DD format)")
      .setRequired(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("minrequirements")
      .setDescription("Minimum requirements (for RP: 15-20 posts)")
      .setRequired(false)
      .setMinValue(0)
    )
    .addStringOption((option) =>
     option
      .setName("itemreward")
      .setDescription("Item reward name")
      .setRequired(false)
    )
    .addIntegerOption((option) =>
     option
      .setName("itemrewardqty")
      .setDescription("Item reward quantity")
      .setRequired(false)
      .setMinValue(1)
    )
    .addStringOption((option) =>
     option
      .setName("signupdeadline")
      .setDescription(
       "Signup deadline (YYYY-MM-DD format) - RP quests auto-set to 1 week"
      )
      .setRequired(false)
    )
    .addIntegerOption((option) =>
     option
      .setName("participantcap")
      .setDescription("Maximum participants (member-capped quest)")
      .setRequired(false)
      .setMinValue(1)
    )
    .addIntegerOption((option) =>
     option
      .setName("postrequirement")
      .setDescription(
       "Post requirement (RP quests: 15-20 posts, 2 paragraph max)"
      )
      .setRequired(false)
      .setMinValue(1)
    )
    .addStringOption((option) =>
     option
      .setName("specialnote")
      .setDescription("Special notes about the quest")
      .setRequired(false)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("edit")
    .setDescription("Edit an existing quest (Admin only)")
    .addStringOption((option) =>
     option
      .setName("questid")
      .setDescription("ID of the quest to edit")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("field")
      .setDescription("Field to edit")
      .setRequired(true)
      .addChoices(
       { name: "Title", value: "title" },
       { name: "Description", value: "description" },
       { name: "Type", value: "questType" },
       { name: "Location", value: "location" },
       { name: "Time Limit", value: "timeLimit" },
       { name: "Token Reward", value: "tokenReward" },
       { name: "Item Reward", value: "itemReward" },
       { name: "Item Reward Quantity", value: "itemRewardQty" },
       { name: "Signup Deadline", value: "signupDeadline" },
       { name: "Participant Cap", value: "participantCap" },
       { name: "Post Requirement", value: "postRequirement" },
       { name: "Special Note", value: "specialNote" },
       { name: "Status", value: "status" }
      )
    )
    .addStringOption((option) =>
     option
      .setName("value")
      .setDescription("New value for the field")
      .setRequired(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("delete")
    .setDescription("Delete a quest (Admin only)")
    .addStringOption((option) =>
     option
      .setName("questid")
      .setDescription("ID of the quest to delete")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("voucher")
    .setDescription(
     "Use a quest voucher to guarantee a spot in member-capped quests"
    )
    .addStringOption((option) =>
     option
      .setName("questid")
      .setDescription("ID of the member-capped quest to use voucher for")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Character to use voucher with")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand.setName("list").setDescription("List all active quests")
  ),

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
    case "create":
     await this.handleCreateQuest(interaction);
     break;
    case "edit":
     await this.handleEditQuest(interaction);
     break;
    case "delete":
     await this.handleDeleteQuest(interaction);
     break;
    case "voucher":
     await this.handleVoucherUse(interaction);
     break;
    case "list":
     await this.handleListQuests(interaction);
     break;
    default:
     await interaction.reply({
      content: "❌ Unknown subcommand.",
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
     content:
      "❌ An error occurred while processing your request. Please try again later.",
     ephemeral: true,
    });
   }
  }
 },

 async handleJoinQuest(interaction) {
  const characterName = interaction.options.getString("charactername");
  const questID = interaction.options.getString("questid");
  const userID = interaction.user.id;
  const userName = interaction.user.username;

  const quest = await Quest.findOne({ questID });
  if (!quest) {
   return interaction.reply({
    content: `❌ Quest with ID \`${questID}\` does not exist.`,
    ephemeral: true,
   });
  }

  if (quest.status !== "active") {
   return interaction.reply({
    content: `❌ The quest \`${quest.title}\` is no longer active.`,
    ephemeral: true,
   });
  }

  const now = new Date();
  if (quest.signupDeadline) {
   const deadline = new Date(quest.signupDeadline);
   if (now > deadline) {
    return interaction.reply({
     content: `❌ The signup deadline for quest \`${quest.title}\` has passed.`,
     ephemeral: true,
    });
   }
  }

  const character = await Character.findOne({
   name: characterName,
   userId: userID,
  });

  if (!character) {
   return interaction.reply({
    content: `❌ You don't own a character named \`${characterName}\`. Please use one of your registered characters.`,
    ephemeral: true,
   });
  }

  if (quest.participants.has(userID)) {
   return interaction.reply({
    content: `❌ You are already participating in the quest \`${
     quest.title
    }\` with character **${quest.participants.get(userID)}**.`,
    ephemeral: true,
   });
  }

  if (quest.participantCap) {
   const otherCappedQuests = await Quest.find({
    participantCap: { $ne: null },
    status: "active",
    questID: { $ne: questID },
   });

   for (const otherQuest of otherCappedQuests) {
    if (otherQuest.participants.has(userID)) {
     return interaction.reply({
      content: `❌ You are already participating in another member-capped quest (\`${otherQuest.title}\`). **RULE**: You can only join ONE member-capped quest at a time.`,
      ephemeral: true,
     });
    }
   }

   if (quest.participants.size >= quest.participantCap) {
    return interaction.reply({
     content: `❌ The member-capped quest \`${quest.title}\` has reached its participant limit of ${quest.participantCap}. Consider getting a Quest Voucher if you miss consecutive member-capped quests!`,
     ephemeral: true,
    });
   }
  }

  switch (quest.questType.toLowerCase()) {
   case "rp":
    if (quest.posted) {
     const questPostDate = new Date(quest.date);
     const rpSignupDeadline = new Date(
      questPostDate.getTime() + 7 * 24 * 60 * 60 * 1000
     );

     if (now > rpSignupDeadline) {
      return interaction.reply({
       content: `❌ The signup window for RP quest \`${quest.title}\` has closed. **RULE**: RP quests have a 1-week signup window after posting.`,
       ephemeral: true,
      });
     }
    }
    break;

   case "art":
   case "writing":
   case "interactive":
    break;
  }

  if (quest.roleID) {
   const role = interaction.guild.roles.cache.find(
    (r) => r.id === quest.roleID
   );
   if (role) {
    const member = interaction.guild.members.cache.get(userID);
    if (member) {
     await member.roles.add(role);
    }
   }
  }

  quest.participants.set(userID, characterName);
  await quest.save();

  await this.updateQuestEmbed(interaction.guild, quest);

  let successMessage = `✅ **${userName}** joined the quest **${quest.title}** with character **${characterName}**!`;

  switch (quest.questType.toLowerCase()) {
   case "rp":
    if (quest.postRequirement) {
     successMessage += `\n📝 **RP Rules Reminder**: This quest requires a minimum of ${quest.postRequirement} posts with a **maximum of 2 paragraphs each**.`;
    }
    successMessage += `\n🎭 **RP Note**: These quests are member-driven. Use @TaleWeaver if you need help moving things along!`;
    break;

   case "art":
    successMessage += `\n🎨 **Art Quest**: Create an illustration based on quest specifications. Collaborations may be allowed!`;
    break;

   case "writing":
    successMessage += `\n✍️ **Writing Quest**: Write a piece based on quest specifications. Collaborations may be allowed!`;
    break;

   case "interactive":
    successMessage += `\n🎲 **Interactive Quest**: Follow the mod-run event commands as they come to you!`;
    break;
  }

  if (quest.timeLimit) {
   successMessage += `\n⏰ **Time Limit**: ${quest.timeLimit}`;
  }

  return interaction.reply({
   content: successMessage,
   ephemeral: true,
  });
 },

 async handleLeaveQuest(interaction) {
  const questID = interaction.options.getString("questid");
  const userID = interaction.user.id;

  const quest = await Quest.findOne({ questID });
  if (!quest) {
   return interaction.reply({
    content: `❌ Quest with ID \`${questID}\` does not exist.`,
    ephemeral: true,
   });
  }

  if (!quest.participants.has(userID)) {
   return interaction.reply({
    content: `❌ You are not participating in the quest \`${quest.title}\`.`,
    ephemeral: true,
   });
  }

  const characterName = quest.participants.get(userID);
  quest.participants.delete(userID);
  await quest.save();

  if (quest.roleID) {
   const role = interaction.guild.roles.cache.find(
    (r) => r.id === quest.roleID
   );
   if (role) {
    const member = interaction.guild.members.cache.get(userID);
    if (member && member.roles.cache.has(quest.roleID)) {
     await member.roles.remove(role);
    }
   }
  }

  await this.updateQuestEmbed(interaction.guild, quest);

  let leaveMessage = `✅ You have left the quest **${quest.title}** (Character: **${characterName}**).`;

  if (quest.participantCap) {
   leaveMessage += `\n📝 **Note**: Since this was a member-capped quest, you can now join another member-capped quest if available.`;
  }

  return interaction.reply({
   content: leaveMessage,
   ephemeral: true,
  });
 },

 async handleCreateQuest(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
   return interaction.reply({
    content: "❌ You need administrator permissions to create quests.",
    ephemeral: true,
   });
  }

  const questData = {
   title: interaction.options.getString("title"),
   description: interaction.options.getString("description"),
   questType: interaction.options.getString("type"),
   location: interaction.options.getString("location"),
   timeLimit: interaction.options.getString("timelimit"),
   tokenReward: interaction.options.getInteger("tokenreward"),
   questID: interaction.options.getString("questid"),
   date: interaction.options.getString("date"),
   minRequirements: interaction.options.getInteger("minrequirements") || 0,
   itemReward: interaction.options.getString("itemreward"),
   itemRewardQty: interaction.options.getInteger("itemrewardqty"),
   signupDeadline: interaction.options.getString("signupdeadline"),
   participantCap: interaction.options.getInteger("participantcap"),
   postRequirement: interaction.options.getInteger("postrequirement"),
   specialNote: interaction.options.getString("specialnote"),
  };

  if (questData.questType.toLowerCase() === "rp") {
   if (!questData.postRequirement) {
    questData.postRequirement = 15;
   }

   if (!questData.signupDeadline) {
    const questDate = new Date(questData.date);
    const rpDeadline = new Date(questDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    questData.signupDeadline = rpDeadline.toISOString().split("T")[0];
   }

   const rpRules =
    "📝 RP Quest Rules: 15-20 posts minimum, 2 paragraph maximum per post, member-driven with @TaleWeaver support available.";
   questData.specialNote = questData.specialNote
    ? `${questData.specialNote}\n\n${rpRules}`
    : rpRules;
  }

  const existingQuest = await Quest.findOne({ questID: questData.questID });
  if (existingQuest) {
   return interaction.reply({
    content: `❌ A quest with ID \`${questData.questID}\` already exists.`,
    ephemeral: true,
   });
  }

  const newQuest = new Quest(questData);
  await newQuest.save();

  const embed = new EmbedBuilder()
   .setColor(0x00ff00)
   .setTitle("✅ Quest Created Successfully")
   .setDescription("A smaller, optional, fun timed task for community rewards!")
   .addFields(
    { name: "🎯 Title", value: questData.title, inline: true },
    { name: "🆔 Quest ID", value: questData.questID, inline: true },
    { name: "📝 Type", value: questData.questType.toUpperCase(), inline: true },
    { name: "📍 Location", value: questData.location, inline: true },
    { name: "⏰ Time Limit", value: questData.timeLimit, inline: true },
    {
     name: "🪙 Token Reward",
     value: questData.tokenReward.toString(),
     inline: true,
    }
   );

  if (questData.participantCap) {
   embed.addFields({
    name: "👥 Participant Cap",
    value: `${questData.participantCap} (Member-Capped Quest)`,
    inline: true,
   });
  }

  if (questData.questType.toLowerCase() === "rp") {
   embed.addFields({
    name: "📋 RP Rules Applied",
    value: "1-week signup window, 15-20 posts min, 2 paragraph max",
    inline: false,
   });
  }

  embed.setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
 },

 async handleEditQuest(interaction) {
  // Check admin permissions
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
   return interaction.reply({
    content: "❌ You need administrator permissions to edit quests.",
    ephemeral: true,
   });
  }

  const questID = interaction.options.getString("questid");
  const field = interaction.options.getString("field");
  const value = interaction.options.getString("value");

  const quest = await Quest.findOne({ questID });
  if (!quest) {
   return interaction.reply({
    content: `❌ Quest with ID \`${questID}\` does not exist.`,
    ephemeral: true,
   });
  }

  let convertedValue = value;
  if (
   [
    "tokenReward",
    "minRequirements",
    "itemRewardQty",
    "participantCap",
    "postRequirement",
   ].includes(field)
  ) {
   convertedValue = parseInt(value);
   if (isNaN(convertedValue)) {
    return interaction.reply({
     content: `❌ Invalid number format for field \`${field}\`.`,
     ephemeral: true,
    });
   }
  }

  const oldValue = quest[field];
  quest[field] = convertedValue;
  await quest.save();

  await this.updateQuestEmbed(interaction.guild, quest);
  let updateMessage = `✅ Quest \`${quest.title}\` updated successfully!\n**${field}**: \`${oldValue}\` → \`${convertedValue}\``;

  if (field === "participantCap" && convertedValue) {
   updateMessage += `\n⚠️ **Note**: This is now a member-capped quest. Members can only join ONE member-capped quest at a time.`;
  }

  return interaction.reply({
   content: updateMessage,
   ephemeral: true,
  });
 },

 async handleDeleteQuest(interaction) {
  // Check admin permissions
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
   return interaction.reply({
    content: "❌ You need administrator permissions to delete quests.",
    ephemeral: true,
   });
  }

  const questID = interaction.options.getString("questid");

  const quest = await Quest.findOne({ questID });
  if (!quest) {
   return interaction.reply({
    content: `❌ Quest with ID \`${questID}\` does not exist.`,
    ephemeral: true,
   });
  }

  const confirmButton = new ButtonBuilder()
   .setCustomId(`confirm_delete_${questID}`)
   .setLabel("Confirm Delete")
   .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
   .setCustomId(`cancel_delete_${questID}`)
   .setLabel("Cancel")
   .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

  const embed = new EmbedBuilder()
   .setColor(0xff0000)
   .setTitle("⚠️ Confirm Quest Deletion")
   .setDescription(
    `Are you sure you want to delete the quest **${
     quest.title
    }**?\n\n**Participants**: ${
     quest.participants.size
    }\n**Type**: ${quest.questType.toUpperCase()}\n**Status**: ${quest.status}`
   )
   .addFields(
    { name: "🆔 Quest ID", value: questID, inline: true },
    { name: "📝 Quest Type", value: quest.questType, inline: true }
   );

  if (quest.participantCap) {
   embed.addFields({
    name: "⚠️ Warning",
    value:
     "This is a member-capped quest! Participants will be able to join other member-capped quests after deletion.",
    inline: false,
   });
  }

  await interaction.reply({
   embeds: [embed],
   components: [row],
   ephemeral: true,
  });

  const filter = (i) =>
   i.user.id === interaction.user.id && i.customId.includes(questID);
  const collector = interaction.channel.createMessageComponentCollector({
   filter,
   time: 30000,
  });

  collector.on("collect", async (i) => {
   if (i.customId.startsWith("confirm_delete_")) {
    if (quest.roleID) {
     const role = interaction.guild.roles.cache.find(
      (r) => r.id === quest.roleID
     );
     if (role) {
      for (const [userId] of quest.participants) {
       const member = interaction.guild.members.cache.get(userId);
       if (member && member.roles.cache.has(quest.roleID)) {
        await member.roles.remove(role);
       }
      }
     }
    }

    await Quest.deleteOne({ questID });

    let deleteMessage = `✅ Quest **${quest.title}** has been deleted successfully.`;
    if (quest.participantCap) {
     deleteMessage += `\n📝 **Note**: This was a member-capped quest. ${quest.participants.size} participants can now join other member-capped quests.`;
    }

    await i.update({
     content: deleteMessage,
     embeds: [],
     components: [],
    });
   } else {
    await i.update({
     content: "❌ Quest deletion cancelled.",
     embeds: [],
     components: [],
    });
   }
   collector.stop();
  });

  collector.on("end", async (collected) => {
   if (collected.size === 0) {
    await interaction.editReply({
     content: "❌ Quest deletion timed out.",
     embeds: [],
     components: [],
    });
   }
  });
 },

 async handleVoucherUse(interaction) {
  const questID = interaction.options.getString("questid");
  const characterName = interaction.options.getString("charactername");
  const userID = interaction.user.id;

  const character = await Character.findOne({
   name: characterName,
   userId: userID,
  });

  if (!character) {
   return interaction.reply({
    content: `❌ You don't own a character named \`${characterName}\`.`,
    ephemeral: true,
   });
  }

  if (!character.jobVoucher) {
   return interaction.reply({
    content: `❌ Character \`${characterName}\` doesn't have a quest voucher available.\n\n💡 **Quest Voucher Info**: Vouchers are given to members who miss 2 consecutive member-capped quests. DM the Admin Account to claim one if eligible!`,
    ephemeral: true,
   });
  }

  const quest = await Quest.findOne({ questID });
  if (!quest) {
   return interaction.reply({
    content: `❌ Quest with ID \`${questID}\` does not exist.`,
    ephemeral: true,
   });
  }

  if (quest.status !== "active") {
   return interaction.reply({
    content: `❌ The quest \`${quest.title}\` is no longer active.`,
    ephemeral: true,
   });
  }

  if (!quest.participantCap) {
   return interaction.reply({
    content: `❌ Quest vouchers can only be used for member-capped quests. \`${quest.title}\` is not member-capped.`,
    ephemeral: true,
   });
  }

  if (quest.participants.has(userID)) {
   return interaction.reply({
    content: `❌ You are already participating in the quest \`${quest.title}\`.`,
    ephemeral: true,
   });
  }

  const otherCappedQuests = await Quest.find({
   participantCap: { $ne: null },
   status: "active",
   questID: { $ne: questID },
  });

  for (const otherQuest of otherCappedQuests) {
   if (otherQuest.participants.has(userID)) {
    return interaction.reply({
     content: `❌ You are already participating in another member-capped quest (\`${otherQuest.title}\`). You must leave that quest first before using a voucher for another member-capped quest.`,
     ephemeral: true,
    });
   }
  }

  character.jobVoucher = false;
  await character.save();

  quest.participants.set(userID, characterName);
  await quest.save();

  if (quest.roleID) {
   const role = interaction.guild.roles.cache.find(
    (r) => r.id === quest.roleID
   );
   if (role) {
    const member = interaction.guild.members.cache.get(userID);
    if (member) {
     await member.roles.add(role);
    }
   }
  }

  await this.updateQuestEmbed(interaction.guild, quest);

  let voucherMessage = `🎫 **Quest Voucher Used!** ${interaction.user.username} joined the member-capped quest **${quest.title}** with character **${characterName}**.`;
  voucherMessage += `\n✨ **Voucher Benefit**: Guaranteed spot bypassing the participant cap!`;

  // Add quest-specific info
  if (quest.questType.toLowerCase() === "rp") {
   voucherMessage += `\n📝 **RP Rules**: ${
    quest.postRequirement || 15
   }-20 posts minimum, 2 paragraph maximum per post.`;
  }

  return interaction.reply({
   content: voucherMessage,
   ephemeral: true,
  });
 },

 async handleListQuests(interaction) {
  const quests = await Quest.find({ status: "active" }).sort({ date: 1 });

  if (quests.length === 0) {
   return interaction.reply({
    content:
     "📋 No active quests available.\n\n💡 **About Quests**: Quests are smaller, optional, fun timed tasks that happen every other month! They can be Art, Writing, Interactive, or RP based.",
    ephemeral: true,
   });
  }

  const embed = new EmbedBuilder()
   .setColor(0x0099ff)
   .setTitle("📋 Active Quests - Every Other Month Events!")
   .setDescription("Smaller, optional, fun timed tasks for community rewards!")
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
   }\n**Participants**: ${participantCount}\n**Reward**: ${
    quest.tokenReward
   } tokens`;

   if (quest.participantCap) {
    questInfo += `\n🔒 **Member-Capped Quest**`;
   }

   if (quest.questType.toLowerCase() === "rp") {
    questInfo += `\n📝 **RP**: ${
     quest.postRequirement || 15
    }-20 posts, 2 para max`;
   }

   embed.addFields({
    name: `🎯 ${quest.title}`,
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
   name: "📚 Quest Rules Reminder",
   value:
    "• Only **ONE** member-capped quest per person\n• RP quests: 1-week signup window\n• Art/Writing/Interactive: No signup deadline\n• Use Quest Vouchers for guaranteed spots!",
   inline: false,
  });

  return interaction.reply({ embeds: [embed], ephemeral: true });
 },

 async updateQuestEmbed(guild, quest) {
  if (!quest.messageID) return;

  try {
   const questChannel = guild.channels.cache.get(QUEST_CHANNEL_ID);
   if (!questChannel) return;

   const questMessage = await questChannel.messages.fetch(quest.messageID);
   if (!questMessage) return;

   const embed = EmbedBuilder.from(questMessage.embeds[0]);

   const participantEntries = Array.from(quest.participants.entries());
   const participantList =
    participantEntries.length > 0
     ? participantEntries
        .map(([userId, charName]) => `• ${charName}`)
        .join("\n")
     : "None";

   const updatedFields = embed.data.fields.map((field) => {
    if (field.name.includes("Participants")) {
     const participantCount = quest.participantCap
      ? `(${participantEntries.length}/${quest.participantCap}${
         participantEntries.length >= quest.participantCap ? " - FULL" : ""
        })`
      : `(${participantEntries.length})`;

     return {
      ...field,
      name: `👥 Participants ${participantCount}`,
      value:
       participantList.length > 1024
        ? participantList.substring(0, 1021) + "..."
        : participantList,
     };
    }
    return field;
   });

   embed.setFields(updatedFields);
   await questMessage.edit({ embeds: [embed] });
  } catch (error) {
   console.warn("[WARNING]: Failed to update quest embed:", error);
  }
 },
};
