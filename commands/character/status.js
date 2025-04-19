// ------------------- Discord.js Components -------------------
// Alphabetized imports from discord.js
const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

const { handleError } = require('../../utils/globalErrorHandler');
// ------------------- Database Models -------------------
const User = require("../../models/UserModel");

module.exports = {
  // ------------------- Slash Command Definition for Status -------------------
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Set your activity status or generate an inactivity report")
    .addSubcommand((sub) =>
      sub.setName("active").setDescription("Mark yourself as active")
    )
    .addSubcommand((sub) =>
      sub.setName("inactive").setDescription("Mark yourself as inactive")
    )
    .addSubcommand((sub) =>
      sub
        .setName("inactivityreport")
        .setDescription("📋 View members inactive for 3+ months")
    ),

  // ------------------- Execute Command Function -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const discordId = interaction.user.id;
    const timestamp = new Date();

    try {
      // ------------------- Handle Active/Inactive Subcommands -------------------
      if (subcommand === "active" || subcommand === "inactive") {
        await interaction.deferReply({ ephemeral: true });

        // Find or create a user record in the database
        let user = await User.findOne({ discordId });
        if (!user) {
          user = new User({ discordId });
        }

        // Update user status and timestamp
        user.status = subcommand;
        user.statusChangedAt = timestamp;
        await user.save();

        // Prepare response message with markdown formatting and emojis
        const response =
          subcommand === "active"
            ? "✅ You are now marked as **active**. Welcome back!"
            : "🛌 You are now marked as **inactive**. We'll miss you while you're gone!";

        await interaction.editReply({ content: response });
      }
      // ------------------- Handle Inactivity Report Subcommand (Mod Only) -------------------
      else if (subcommand === "inactivityreport") {
        await interaction.deferReply({ ephemeral: true });

        // Check if the member has the required permissions
        if (
          !interaction.member.permissions.has(
            PermissionsBitField.Flags.ManageGuild
          )
        ) {
          return await interaction.editReply({
            content: "❌ You do not have permission to use this command.",
          });
        }

        // ------------------- Calculate 3-Month Threshold -------------------
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        // ------------------- Retrieve Inactive Users -------------------
        let inactiveUsers = await User.find({
          $or: [
            { lastMessageTimestamp: { $exists: false } },
            { lastMessageTimestamp: { $lte: threeMonthsAgo } },
          ],
        });

        // Filter out users who are no longer in the server
        inactiveUsers = (await Promise.all(
          inactiveUsers.map(async (user) => {
            try {
              await interaction.guild.members.fetch(user.discordId);
              return user;
            } catch (error) {
    handleError(error, 'status.js');

              return null;
            }
          })
        )).filter(Boolean);

        // ------------------- Helper Functions for Message Fetching -------------------

        // Fetch a user's last message in a specific channel in batches
        async function fetchUserLastMessageInChannel(channel, userDiscordId) {
          let before;
          const maxMessagesToFetch = 500; // Adjust this number as needed.
          let fetchedCount = 0;

          while (fetchedCount < maxMessagesToFetch) {
            const options = { limit: 100 };
            if (before) options.before = before;

            try {
              const messages = await channel.messages.fetch(options);
              if (messages.size === 0) break;

              // Messages are sorted in descending order (most recent first)
              const userMessage = messages.find(
                (msg) => msg.author.id === userDiscordId
              );
              if (userMessage) return { channel, message: userMessage };

              fetchedCount += messages.size;
              before = messages.last().id;
            } catch (err) {
    handleError(err, 'status.js');

              console.warn(
                "[status.js]: Error fetching messages in channel " +
                  channel.id +
                  ":",
                err
              );
              break;
            }
          }
          return null;
        }

        // Iterate over channels to find and save the most recent message for a user
        async function fetchLastMessageForUser(user) {
          const channelsToCheck = interaction.guild.channels.cache.filter(
            (channel) =>
              channel.isTextBased() &&
              channel.viewable &&
              channel.permissionsFor(interaction.client.user)?.has("ReadMessageHistory")
          );

          const promises = channelsToCheck.map((channel) =>
            fetchUserLastMessageInChannel(channel, user.discordId)
          );
          const results = await Promise.all(promises);
          const validResults = results.filter((r) => r !== null);
          if (validResults.length > 0) {
            // Pick the message with the latest creation date
            const best = validResults.reduce((prev, curr) =>
              new Date(curr.message.createdAt) > new Date(prev.message.createdAt)
                ? curr
                : prev
            );
            user.lastMessageTimestamp = best.message.createdAt;
            user.lastMessageJump = `https://discord.com/channels/${interaction.guild.id}/${best.channel.id}/${best.message.id}`;
            await user.save();
            // Extensive error logging added for debugging message retrieval issues can be placed here if needed.
          }
        }

        // Count messages for a user in a specific channel over the past 3 months
        async function fetchUserMessageCountInChannel(channel, userDiscordId, threeMonthsAgo) {
          let before;
          let count = 0;
          while (true) {
            const options = { limit: 100 };
            if (before) options.before = before;
            try {
              const messages = await channel.messages.fetch(options);
              if (messages.size === 0) break;
              let reachedOlder = false;
              for (const msg of messages.values()) {
                if (msg.createdAt < threeMonthsAgo) {
                  reachedOlder = true;
                  break; // Since messages are sorted descending, remaining ones are older.
                }
                if (msg.author.id === userDiscordId) {
                  count++;
                }
              }
              if (reachedOlder) break;
              before = messages.last().id;
            } catch (err) {
    handleError(err, 'status.js');

              console.warn(
                "[status.js]: Error fetching messages in channel " +
                  channel.id +
                  ":",
                err
              );
              break;
            }
          }
          return count;
        }

        // Sum message counts for a user across all accessible channels over the past 3 months
        async function fetchUserMessageCount(user) {
          const channelsToCheck = interaction.guild.channels.cache.filter(
            (channel) =>
              channel.isTextBased() &&
              channel.viewable &&
              channel.permissionsFor(interaction.client.user)?.has("ReadMessageHistory")
          );
          let totalCount = 0;
          const promises = [];
          for (const channel of channelsToCheck.values()) {
            promises.push(
              fetchUserMessageCountInChannel(channel, user.discordId, threeMonthsAgo)
            );
          }
          const counts = await Promise.all(promises);
          counts.forEach((c) => (totalCount += c));
          return totalCount;
        }

        // ------------------- Retrieve and Update Last Message Data for Inactive Users -------------------
        await Promise.all(
          inactiveUsers.map(async (user) => {
            if (!user.lastMessageTimestamp || !user.lastMessageJump) {
              await fetchLastMessageForUser(user);
            }
          })
        );

        // ------------------- Update Message Counts for Each Inactive User -------------------
        await Promise.all(
          inactiveUsers.map(async (user) => {
            const messageCount = await fetchUserMessageCount(user);
            user.messageCount = messageCount;
          })
        );

        // ------------------- Helper Functions for Report Formatting -------------------
        // Format a date as MM/DD/YY
        function formatDate(date) {
          const d = new Date(date);
          const month = ("0" + (d.getMonth() + 1)).slice(-2);
          const day = ("0" + d.getDate()).slice(-2);
          const year = d.getFullYear().toString().slice(-2);
          return `${month}/${day}/${year}`;
        }

        // Split a long message into chunks to adhere to Discord's message length limits
        function splitMessage(text, maxLength = 2000) {
          const lines = text.split("\n");
          const chunks = [];
          let currentChunk = "";
          for (const line of lines) {
            if (currentChunk.length + line.length + 1 > maxLength) {
              chunks.push(currentChunk);
              currentChunk = line;
            } else {
              currentChunk += "\n" + line;
            }
          }
          if (currentChunk.length) {
            chunks.push(currentChunk);
          }
          return chunks;
        }

        // ------------------- Format the Inactivity Report -------------------
        const reportLines = inactiveUsers.map((user) => {
          const statusUpdatedDate = user.statusChangedAt
            ? formatDate(user.statusChangedAt)
            : "N/A";

          let lastMsg;
          let emoji;
          if (user.lastMessageTimestamp) {
            const lastMsgDate = formatDate(user.lastMessageTimestamp);
            // Determine emoji based on the activity check using the 3-month threshold
            if (new Date(user.lastMessageTimestamp) > threeMonthsAgo) {
              emoji = "✅";
            } else {
              emoji = "⚠️";
            }
            if (user.lastMessageJump) {
              lastMsg = `[Jump to Message](${user.lastMessageJump}) on ${lastMsgDate}`;
            } else {
              lastMsg = `Last Message on ${lastMsgDate}`;
            }
          } else {
            emoji = "❌";
            lastMsg = "*Never Messaged*";
          }

          return `**Member:** <@${user.discordId}>\n**Status:** ${user.status} ${emoji}\n**Status Updated:** ${statusUpdatedDate}\n**Last Message:** ${lastMsg}\n**Messages (past 3 months):** ${user.messageCount}`;
        });

        const output = `📋 **Users inactive for 3+ months:**\n\n${reportLines.join("\n\n")}`;

        // ------------------- Send Report in Chunks if Necessary -------------------
        const chunks = splitMessage(output, 2000);
        await interaction.editReply({ content: chunks[0] });
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp({ content: chunks[i], ephemeral: true });
        }
      }
    } catch (error) {
    handleError(error, 'status.js');

      // ------------------- Extensive Error Logging for Command Execution -------------------
      console.error("[status.js]: Error handling status command:", error);
      await interaction.reply({
        content: "⚠️ Something went wrong while processing the command.",
        ephemeral: true,
      });
    }
  },
};
