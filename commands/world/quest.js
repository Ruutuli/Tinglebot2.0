const { SlashCommandBuilder } = require('@discordjs/builders');
const { handleError } = require('../../utils/globalErrorHandler');
const { EmbedBuilder } = require('discord.js');
const Quest = require('../../models/QuestModel');
const QUEST_CHANNEL_ID = '1305486549252706335';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quest')
        .setDescription('Join a quest with your character.')
        .addStringOption(option =>
            option
                .setName('charactername')
                .setDescription('The name of your character.')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option
                .setName('questid')
                .setDescription('The ID of the quest you want to join.')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    async execute(interaction) {
        const characterName = interaction.options.getString('charactername');
        const questID = interaction.options.getString('questid');
        const userID = interaction.user.id;
        const userName = interaction.user.username;

        try {
            // Fetch the quest from the database
            const quest = await Quest.findOne({ questID });

            if (!quest) {
                return interaction.reply({
                    content: `❌ Quest with ID \`${questID}\` does not exist.`,
                    ephemeral: true
                });
            }

            // Check if the user is already a participant
            if (quest.participants.has(userID)) {
                return interaction.reply({
                    content: `❌ You are already participating in the quest \`${quest.title}\` with character **${quest.participants.get(userID)}**.`,
                    ephemeral: true
                });
            }

            // Get the quest role
            const role = interaction.guild.roles.cache.find(r => r.id === quest.roleID);
            if (!role) {
                return interaction.reply({
                    content: `❌ The role for this quest does not exist. Please contact an admin.`,
                    ephemeral: true
                });
            }

            // Assign the role to the user
            const member = interaction.guild.members.cache.get(userID);
            if (!member) {
                return interaction.reply({
                    content: `❌ Unable to find your guild member record.`,
                    ephemeral: true
                });
            }

            await member.roles.add(role);

            // Update the quest's participant list
            quest.participants.set(userID, characterName);
            await quest.save();

            // Update the "Participants" field in the embed
            if (quest.messageID) {
                const questChannel = interaction.guild.channels.cache.get(QUEST_CHANNEL_ID);
                const questMessage = await questChannel.messages.fetch(quest.messageID);

                if (questMessage) {
                    const embed = EmbedBuilder.from(questMessage.embeds[0]); // Clone the existing embed
                    const participantList = Array.from(quest.participants.values()).join(', ') || 'None';

                    // Update only the "Participants" field
                    const updatedFields = embed.data.fields.map(field => 
                        field.name === '👥 Participants'
                            ? { ...field, value: participantList }
                            : field
                    );
                    embed.setFields(updatedFields);

                    await questMessage.edit({ embeds: [embed] });
                }
            }

            return interaction.reply({
                content: `✅ **${userName}** joined the quest **${quest.title}** with character **${characterName}**!`,
                ephemeral: true
            });
        } catch (error) {
    handleError(error, 'quest.js');

            console.error('[ERROR]: Failed to process quest participation:', error);
            return interaction.reply({
                content: `❌ An error occurred while processing your request. Please try again later.`,
                ephemeral: true
            });
        }
    }
};
