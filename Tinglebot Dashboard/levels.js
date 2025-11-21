// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/UserModel');
const { getUserLevelInfo, createProgressBar, getLeaderboard } = require('../../modules/levelingModule');
const { connectToTinglebot } = require('../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('📈 Level system: view rank, exchange levels, and check leaderboards')
    
    // ------------------- Subcommand: rank -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('rank')
        .setDescription('View your level and XP progress')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to check rank for (defaults to yourself)')
            .setRequired(false)
        )
    )
    
    // ------------------- Subcommand: exchange -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('exchange')
        .setDescription('💱 Exchange your levels for tokens (1 level = 100 tokens)')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('What would you like to do?')
            .setRequired(true)
            .addChoices(
              { name: 'Exchange Levels', value: 'exchange' },
              { name: 'Check Exchange Status', value: 'status' }
            )
        )
    )
    
    // ------------------- Subcommand: leaderboard -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('leaderboard')
        .setDescription('View the top leveled users in the server')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of users to show (default: 10, max: 25)')
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(25)
        )
    )
    
    // ------------------- Subcommand: import -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('import')
        .setDescription('📥 Import your levels from MEE6 (one-time only)')
        .addIntegerOption(option =>
          option.setName('mee6_level')
            .setDescription('Your current MEE6 level')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000)
        )
        .addIntegerOption(option =>
          option.setName('last_exchanged_level')
            .setDescription('Last level you exchanged for tokens in MEE6 (0 if never exchanged)')
            .setRequired(true)
            .setMinValue(0)
        )
    ),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'rank') {
        await handleRank(interaction);
      } else if (subcommand === 'exchange') {
        await handleExchange(interaction);
      } else if (subcommand === 'leaderboard') {
        await handleLeaderboard(interaction);
      } else if (subcommand === 'import') {
        await handleImport(interaction);
      }
      
    } catch (error) {
      console.error('[levels.js]: Error executing levels command:', error);
      await interaction.reply({
        content: '❌ There was an error processing your request. Please try again later.',
        ephemeral: true
      });
    }
  }
};

// ------------------- Function: handleRank -------------------
async function handleRank(interaction) {
  try {
    // Get the target user (defaults to command user)
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const discordId = targetUser.id;

    // Get user's level information
    const levelInfo = await getUserLevelInfo(discordId);
    
    if (!levelInfo) {
      return await interaction.reply({
        content: '❌ Failed to retrieve level information. Please try again.',
        ephemeral: true
      });
    }
    
    // Get exchange information
    const user = await User.findOne({ discordId });
    const exchangeInfo = user ? user.getExchangeableLevels() : {
      exchangeableLevels: 0,
      potentialTokens: 0,
      totalLevelsExchanged: 0
    };
    
    // Check if user imported from MEE6
    const hasImportedFromMee6 = user?.leveling?.hasImportedFromMee6 || false;
    const importedMee6Level = user?.leveling?.importedMee6Level || null;

    // Create progress bar (10 squares to fit on one line)
    const progressBar = createProgressBar(levelInfo.progress.current, levelInfo.progress.needed, 10);

    // Build statistics display
    let statsValue = `**${levelInfo.xp.toLocaleString()} XP**`;
    if (hasImportedFromMee6 && importedMee6Level) {
      statsValue += `\n📥 Imported from MEE6 (Level ${importedMee6Level})`;
    }

    // Create embed with better styling
    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle(`📈 ${targetUser.displayName}'s Level Information`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setDescription(`**Level ${levelInfo.level}** • ${levelInfo.rank ? `**#${levelInfo.rank}** on server` : '**Unranked**'}`)
      .addFields(
        {
          name: '📊 Statistics',
          value: statsValue,
          inline: false
        },
        {
          name: '💎 Exchange Information',
          value: `**${exchangeInfo.exchangeableLevels} levels** available • **${exchangeInfo.potentialTokens.toLocaleString()} tokens** potential`,
          inline: false
        },
        {
          name: `📈 Progress to Level ${levelInfo.level + 1}`,
          value: `\`${progressBar}\`\n**${levelInfo.progress.percentage}%** • **${levelInfo.progress.current.toLocaleString()}** / **${levelInfo.progress.needed.toLocaleString()}** XP`,
          inline: false
        }
      )
      .setFooter({
        text: 'Keep chatting to level up! • XP gained by messaging (15-25 XP/minute)',
        icon_url: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('[levels.js]: Error in handleRank:', error);
    await interaction.reply({
      content: '❌ There was an error retrieving rank information. Please try again later.',
      ephemeral: true
    });
  }
}

// ------------------- Function: handleExchange -------------------
async function handleExchange(interaction) {
  try {
    // Connect to database
    await connectToTinglebot();
    
    // Get or create user
    const user = await User.getOrCreateUser(interaction.user.id);
    const action = interaction.options.getString('action');
    
    if (action === 'status') {
      // Show exchange status
      const exchangeInfo = user.getExchangeableLevels();
      
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('💱 Level Exchange Status')
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .addFields(
          {
            name: '📊 Current Level',
            value: `**Level ${exchangeInfo.currentLevel}**`,
            inline: true
          },
          {
            name: '🔄 Last Exchanged Level',
            value: `**Level ${exchangeInfo.lastExchangedLevel}**`,
            inline: true
          },
          {
            name: '💎 Exchangeable Levels',
            value: `**${exchangeInfo.exchangeableLevels}**`,
            inline: true
          },
          {
            name: '🪙 Potential Tokens',
            value: `**${exchangeInfo.potentialTokens.toLocaleString()}**`,
            inline: true
          },
          {
            name: '📈 Total Levels Exchanged',
            value: `**${user.leveling?.totalLevelsExchanged || 0}**`,
            inline: true
          },
          {
            name: '💰 Current Token Balance',
            value: `**${user.tokens.toLocaleString()}**`,
            inline: true
          }
        )
        .setFooter({
          text: 'Use /levels exchange action:Exchange Levels to convert levels to tokens',
          icon_url: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      
      if (exchangeInfo.exchangeableLevels > 0) {
        embed.addFields({
          name: '✨ Ready to Exchange!',
          value: `You can exchange **${exchangeInfo.exchangeableLevels} levels** for **${exchangeInfo.potentialTokens.toLocaleString()} tokens**!`,
          inline: false
        });
      } else {
        embed.addFields({
          name: '⏳ No Levels to Exchange',
          value: 'Level up more to exchange for tokens!',
          inline: false
        });
      }
      
      await interaction.reply({ embeds: [embed] });
      
    } else if (action === 'exchange') {
      // Perform the exchange
      const exchangeResult = await user.exchangeLevelsForTokens();
      
      if (!exchangeResult.success) {
        const embed = new EmbedBuilder()
          .setColor(0xff6b6b)
          .setTitle('❌ Exchange Failed')
          .setDescription(`**${exchangeResult.message}**`)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .addFields({
            name: '💡 Tip',
            value: '**Level up more by chatting in the server to gain new levels to exchange!**',
            inline: false
          })
          .setFooter({
            text: 'Use /levels rank to check your current level',
            icon_url: interaction.client.user.displayAvatarURL()
          })
          .setTimestamp();
        
        return await interaction.reply({ embeds: [embed] });
      }
      
      // Add tokens to user's balance
      const newTokenBalance = user.tokens + exchangeResult.tokensReceived;
      await User.findOneAndUpdate(
        { discordId: interaction.user.id },
        { $set: { tokens: newTokenBalance } }
      );
      
      // Create success embed
      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('🎉 Exchange Successful!')
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .addFields(
          {
            name: '📊 Levels Exchanged',
            value: `**${exchangeResult.levelsExchanged}**`,
            inline: true
          },
          {
            name: '🪙 Tokens Received',
            value: `**+${exchangeResult.tokensReceived.toLocaleString()}**`,
            inline: true
          },
          {
            name: '💰 New Token Balance',
            value: `**${newTokenBalance.toLocaleString()}**`,
            inline: true
          },
          {
            name: '📈 Current Level',
            value: `**Level ${exchangeResult.currentLevel}**`,
            inline: true
          },
          {
            name: '🔄 Last Exchanged Level',
            value: `**Level ${exchangeResult.lastExchangedLevel}**`,
            inline: true
          },
          {
            name: '💬 Total Messages',
            value: `**${exchangeResult.totalMessages.toLocaleString()}**`,
            inline: true
          },
          {
            name: '📝 Exchange Rate',
            value: '**1 Level = 100 Tokens**',
            inline: true
          }
        )
        .setFooter({
          text: 'Keep leveling up to exchange more levels for tokens!',
          icon_url: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
      // Log the exchange
      console.log(`[levels.js]: ${interaction.user.tag} exchanged ${exchangeResult.levelsExchanged} levels for ${exchangeResult.tokensReceived} tokens`);
    }
    
  } catch (error) {
    console.error('[levels.js]: Error in handleExchange:', error);
    await interaction.reply({
      content: '❌ There was an error processing your exchange. Please try again later.',
      ephemeral: true
    });
  }
}

// ------------------- Function: handleLeaderboard -------------------
async function handleLeaderboard(interaction) {
  try {
    const limit = interaction.options.getInteger('limit') || 10;
    
    // Get leaderboard data
    const topUsers = await getLeaderboard(limit);
    
    if (!topUsers || topUsers.length === 0) {
      return await interaction.reply({
        content: '📊 No leveling data available yet. Start chatting to appear on the leaderboard!',
        ephemeral: true
      });
    }

    // Create leaderboard description with better formatting
    let leaderboardText = '';
    const medals = ['🥇', '🥈', '🥉'];
    
    topUsers.forEach((user, index) => {
      const medal = index < 3 ? medals[index] : `**${index + 1}.**`;
      const level = user.leveling?.level || 1;
      const xp = user.leveling?.xp || 0;
      
      // Better formatting with proper spacing and alignment
      const rankSpacing = index < 9 ? ' ' : ''; // Extra space for single digits
      leaderboardText += `${medal}${rankSpacing} <@${user.discordId}>\n`;
      leaderboardText += `    📊 **Level ${level}** • ⭐ **${xp.toLocaleString()} XP**\n\n`;
    });

    // Create embed with border image and better styling
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Server Level Leaderboard')
      .setDescription(`**Top ${limit} Leveled Users**\n\n${leaderboardText || 'No users found'}`)
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setFooter({
        text: `Showing top ${limit} users • Use /levels rank to check your level`,
        icon_url: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('[levels.js]: Error in handleLeaderboard:', error);
    await interaction.reply({
      content: '❌ There was an error retrieving the leaderboard. Please try again later.',
      ephemeral: true
    });
  }
}

// ------------------- Function: handleImport -------------------
async function handleImport(interaction) {
  try {
    // Connect to database
    await connectToTinglebot();
    
    // Get or create user
    const user = await User.getOrCreateUser(interaction.user.id);
    
    const mee6Level = interaction.options.getInteger('mee6_level');
    const lastExchangedLevel = interaction.options.getInteger('last_exchanged_level');
    
    // Validate that last_exchanged_level is less than mee6_level
    if (lastExchangedLevel >= mee6Level) {
      return await interaction.reply({
        content: `❌ Invalid input! Your last exchanged level (${lastExchangedLevel}) cannot be greater than or equal to your current MEE6 level (${mee6Level}).`,
        ephemeral: true
      });
    }
    
    // Perform the import
    const importResult = await user.importMee6Levels(mee6Level, lastExchangedLevel);
    
    if (!importResult.success) {
      const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('❌ Import Failed')
        .setDescription(`**${importResult.message}**`)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .setFooter({
          text: importResult.hasImported ? 'You can only import once from MEE6' : 'Please check your input values',
          icon_url: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      
      return await interaction.reply({ embeds: [embed] });
    }
    
    // Create success embed
    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('🎉 MEE6 Import Successful!')
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .addFields(
        {
          name: '📊 Imported Level',
          value: `**Level ${importResult.importedLevel}**`,
          inline: true
        },
        {
          name: '🔄 Last Exchanged Level',
          value: `**Level ${importResult.lastExchangedLevel}**`,
          inline: true
        },
        {
          name: '💎 Exchangeable Levels',
          value: `**${importResult.exchangeableLevels}**`,
          inline: true
        },
        {
          name: '🪙 Potential Tokens',
          value: `**${importResult.potentialTokens.toLocaleString()}**`,
          inline: true
        },
        {
          name: '📅 Import Date',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: true
        },
        {
          name: '⚠️ Important',
          value: '**This import can only be done once!**',
          inline: true
        }
      )
      .setDescription('**Your MEE6 levels have been successfully imported into our new leveling system!**')
      .setFooter({
        text: 'Use /levels exchange to convert levels to tokens',
        icon_url: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    
    if (importResult.exchangeableLevels > 0) {
      embed.addFields({
        name: '✨ Ready to Exchange!',
        value: `You can immediately exchange **${importResult.exchangeableLevels} levels** for **${importResult.potentialTokens.toLocaleString()} tokens**!`,
        inline: false
      });
    } else {
      embed.addFields({
        name: '📝 Note',
        value: 'You have no exchangeable levels because your last exchanged level matches your current level.',
        inline: false
      });
    }
    
    await interaction.reply({ embeds: [embed] });
    
    // Log the import
    console.log(`[levels.js]: ${interaction.user.tag} imported Level ${importResult.importedLevel} from MEE6 (last exchanged: ${importResult.lastExchangedLevel})`);
    
  } catch (error) {
    console.error('[levels.js]: Error in handleImport:', error);
    await interaction.reply({
      content: '❌ There was an error processing your MEE6 import. Please try again later.',
      ephemeral: true
    });
  }
}
