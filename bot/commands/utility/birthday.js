// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const User = require('@/models/UserModel');
const { connectToTinglebot } = require('@/database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('🎂 Birthday system: set, view, and claim birthday rewards')
    
    // ------------------- Subcommand: set -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Set your birthday')
        .addIntegerOption(option =>
          option.setName('month')
            .setDescription('Birth month')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(12)
            .addChoices(
              { name: 'January', value: 1 },
              { name: 'February', value: 2 },
              { name: 'March', value: 3 },
              { name: 'April', value: 4 },
              { name: 'May', value: 5 },
              { name: 'June', value: 6 },
              { name: 'July', value: 7 },
              { name: 'August', value: 8 },
              { name: 'September', value: 9 },
              { name: 'October', value: 10 },
              { name: 'November', value: 11 },
              { name: 'December', value: 12 }
            )
        )
        .addIntegerOption(option =>
          option.setName('day')
            .setDescription('Birth day')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(31)
        )
    )
    
    // ------------------- Subcommand: view -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View birthday information')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to check birthday for (defaults to yourself)')
            .setRequired(false)
        )
    )
    
    // ------------------- Subcommand: claim -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('claim')
        .setDescription('Claim your birthday rewards (if it\'s your birthday)')
        .addStringOption(option =>
          option.setName('reward')
            .setDescription('Choose your birthday reward')
            .setRequired(true)
            .addChoices(
              { name: '💰 1500 Tokens', value: 'tokens' },
              { name: '🛍️ 75% Shop Discount', value: 'discount' }
            )
        )
    )
    
    // ------------------- Subcommand: list -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List upcoming birthdays')
        .addIntegerOption(option =>
          option.setName('days')
            .setDescription('Number of days to look ahead (default: 7)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(30)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    // Defer immediately so the interaction token doesn't expire during DB work (3s limit)
    await interaction.deferReply();

    try {
      await connectToTinglebot();

      if (subcommand === 'set') {
        await handleSetBirthday(interaction);
      } else if (subcommand === 'view') {
        await handleViewBirthday(interaction);
      } else if (subcommand === 'claim') {
        await handleClaimRewards(interaction);
      } else if (subcommand === 'list') {
        await handleListBirthdays(interaction);
      }
    } catch (error) {
      console.error('[birthday.js]: Error executing birthday command:', error);
      try {
        await interaction.editReply({
          content: '❌ There was an error processing your request. Please try again later.',
          flags: MessageFlags.Ephemeral
        });
      } catch (replyError) {
        if (replyError.code !== 10062) throw replyError;
      }
    }
  }
};

// ------------------- Function: handleSetBirthday -------------------
async function handleSetBirthday(interaction) {
  try {
    const month = interaction.options.getInteger('month');
    const day = interaction.options.getInteger('day');
    
    // Get or create user
    const user = await User.getOrCreateUser(interaction.user.id);
    
    // Set birthday
    const result = await user.setBirthday(month, day);

    if (!result.success) {
      return await interaction.editReply({
        content: `❌ **${result.message}**`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Create success embed
    const embed = new EmbedBuilder()
      .setColor(0xff69b4)
      .setTitle('🎂 Birthday Set!')
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setDescription(`**${result.message}**\n\n🎉 **Your birthday will be celebrated with special announcements and rewards!**`)
      .addFields(
        {
          name: '📅 Birthday',
          value: `**${result.birthday}**`,
          inline: false
        },
        {
          name: '🎁 Rewards',
          value: '**Choose one:** 1500 tokens OR 75% shop discount',
          inline: false
        },
        {
          name: '🎲 Reward Selection',
          value: '**You choose!** Pick your reward when you claim',
          inline: false
        },
        {
          name: '🌟 Special Features',
          value: '• **Birthday role** assigned on your special day\n• **@everyone announcement** in the server\n• **Mods get special role** instead of regular birthday role',
          inline: false
        }
      )
      .setFooter({
        text: 'Use /birthday claim on your birthday to choose and get your rewards!',
        icon_url: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[birthday.js]: Error in handleSetBirthday:', error);
    try {
      await interaction.editReply({
        content: '❌ There was an error setting your birthday. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    } catch (replyError) {
      if (replyError.code !== 10062) throw replyError;
    }
  }
}

// ------------------- Function: handleViewBirthday -------------------
async function handleViewBirthday(interaction) {
  try {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const user = await User.findOne({ discordId: targetUser.id });
    
    if (!user || !user.birthday || !user.birthday.month || !user.birthday.day) {
      const message = targetUser.id === interaction.user.id 
        ? 'You haven\'t set your birthday yet. Use `/birthday set` to set it!'
        : `${targetUser.displayName} hasn't set their birthday yet.`;
      
      return await interaction.editReply({
        content: `❌ **${message}**`,
        flags: MessageFlags.Ephemeral
      });
    }

    const birthday = user.formatBirthday();
    const isToday = user.isBirthdayToday();
    const hasClaimedThisYear = user.birthday.lastBirthdayReward === new Date().getFullYear().toString();
    const isOwnBirthday = targetUser.id === interaction.user.id;
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(isToday ? 0xff69b4 : 0x0099FF)
      .setTitle(`${isToday ? '🎉' : '🎂'} ${targetUser.displayName}'s Birthday`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .addFields(
        {
          name: '📅 Birthday',
          value: `**${birthday}**`,
          inline: false
        },
        {
          name: '📊 Status',
          value: isToday ? '**🎉 Today!**' : '**Not today**',
          inline: false
        },
        {
          name: '🎁 Rewards',
          value: '**Choose one:** 1500 tokens OR 75% shop discount',
          inline: false
        }
      )
      .setFooter({
        text: isToday && !hasClaimedThisYear && isOwnBirthday 
          ? 'Use /birthday claim to choose and get your rewards!' 
          : 'Birthday information',
        icon_url: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    
    if (isToday && !hasClaimedThisYear && isOwnBirthday) {
      embed.addFields({
        name: '🎁 Rewards Available!',
        value: '**Claim your birthday rewards now! You can choose which reward you want.**',
        inline: false
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[birthday.js]: Error in handleViewBirthday:', error);
    try {
      await interaction.editReply({
        content: '❌ There was an error viewing birthday information. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    } catch (replyError) {
      if (replyError.code !== 10062) throw replyError;
    }
  }
}

// ------------------- Function: handleClaimRewards -------------------
async function handleClaimRewards(interaction) {
  try {
    const user = await User.findOne({ discordId: interaction.user.id });
    const rewardChoice = interaction.options.getString('reward');
    
    if (!user || !user.birthday || !user.birthday.month || !user.birthday.day) {
      return await interaction.editReply({
        content: '❌ **You haven\'t set your birthday yet. Use `/birthday set` to set it!**',
        flags: MessageFlags.Ephemeral
      });
    }

    if (!user.isBirthdayToday()) {
      return await interaction.editReply({
        content: '❌ **It\'s not your birthday today! Check back on your birthday to claim rewards.**',
        flags: MessageFlags.Ephemeral
      });
    }
    
    // Give birthday rewards with user's choice
    const result = await user.giveBirthdayRewards(rewardChoice);
    
    if (!result.success) {
      return await interaction.editReply({
        content: `❌ **${result.message}**`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Create success embed
    const embed = new EmbedBuilder()
      .setColor(0xff69b4)
      .setTitle('🎉 Happy Birthday!')
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setDescription(`**🎂 Happy Birthday, ${interaction.user.displayName}! 🎂**\n\nHere are your birthday rewards!`)
      .addFields(
        {
          name: '🎁 Birthday Reward',
          value: `**${result.rewardDescription}**`,
          inline: false
        },
        {
          name: '🎲 Reward Choice',
          value: `**${result.rewardType.toUpperCase()}**`,
          inline: false
        },
        {
          name: '💰 Token Balance',
          value: `**${result.newTokenBalance.toLocaleString()} tokens**`,
          inline: false
        }
      )
      .setFooter({
        text: 'Have a wonderful birthday! 🎉',
        icon_url: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[birthday.js]: Error in handleClaimRewards:', error);
    try {
      await interaction.editReply({
        content: '❌ There was an error claiming your birthday rewards. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    } catch (replyError) {
      if (replyError.code !== 10062) throw replyError;
    }
  }
}

// ------------------- Function: handleListBirthdays -------------------
async function handleListBirthdays(interaction) {
  try {
    const daysAhead = interaction.options.getInteger('days') || 7;
    const today = new Date();
    const upcomingBirthdays = [];
    
    // Get all users with birthdays set
    const users = await User.find({
      'birthday.month': { $exists: true },
      'birthday.day': { $exists: true }
    });
    
    // Find birthdays in the next X days
    for (let i = 0; i < daysAhead; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      const month = checkDate.getMonth() + 1;
      const day = checkDate.getDate();
      
      const birthdayUsers = users.filter(user => 
        user.birthday.month === month && user.birthday.day === day
      );
      
      if (birthdayUsers.length > 0) {
        upcomingBirthdays.push({
          date: checkDate,
          users: birthdayUsers
        });
      }
    }
    
    if (upcomingBirthdays.length === 0) {
      return await interaction.editReply({
        content: `❌ **No upcoming birthdays in the next ${daysAhead} days.**`,
        flags: MessageFlags.Ephemeral
      });
    }
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0xff69b4)
      .setTitle('🎂 Upcoming Birthdays')
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setFooter({
        text: `Next ${daysAhead} days • Use /birthday view to see details`,
        icon_url: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    
    let description = '';
    upcomingBirthdays.forEach(({ date, users }) => {
      const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth();
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const emoji = isToday ? '🎉' : '🎂';
      
      description += `**${emoji} ${dateStr}**${isToday ? ' (Today!)' : ''}\n`;
      users.forEach(user => {
        description += `• <@${user.discordId}>\n`;
      });
      description += '\n';
    });
    
    embed.setDescription(description);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[birthday.js]: Error in handleListBirthdays:', error);
    try {
      await interaction.editReply({
        content: '❌ There was an error listing upcoming birthdays. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    } catch (replyError) {
      if (replyError.code !== 10062) throw replyError;
    }
  }
}
