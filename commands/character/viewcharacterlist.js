// viewcharacterlist.js

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler');
const { fetchCharactersByUserId } = require('../../database/characterService');
const { connectToTinglebot } = require('../../database/connection');
const { capitalize, getRandomColor } = require('../../modules/formattingModule');
const { handleComponentInteraction } = require('../../handlers/componentHandler'); // Import handler

const characterEmojis = [
    '🍃', '🍂', '🍁', '🌙', '💫', '⭐️', '🌟', '✨', '⚡️', '☄️', '💥', '🔥', '🌱', '🌿',
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewcharacterlist')
        .setDescription('View a list of your characters')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose characters you want to view')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const userId = targetUser.id;

            await connectToTinglebot();
            const characters = await fetchCharactersByUserId(userId);

            if (!characters.length) {
                await interaction.reply({ content: `❌ **${targetUser.username}** has no saved characters.`, ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setAuthor({ name: `${targetUser.username}'s Character List`, iconURL: targetUser.displayAvatarURL() })
                .setColor(getRandomColor())
                .setFooter({ text: 'Click a character below to view more details!' })
                .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

            const rows = [];
            characters.forEach((character, index) => {
                const randomEmoji = characterEmojis[Math.floor(Math.random() * characterEmojis.length)];

                embed.addFields({
                    name: `${randomEmoji} ${character.name} | **${capitalize(character.race)}** | **${capitalize(character.homeVillage)}** | **${capitalize(character.job)}**`,
                    value: `> **❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n> **🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}\n\u200B`,
                    inline: true
                });

                if ((index + 1) % 2 === 0) {
                    embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
                }

                const button = new ButtonBuilder()
                    .setCustomId(`view|${character._id}`)
                    .setLabel(character.name)
                    .setStyle(ButtonStyle.Primary);

                if (index % 5 === 0) {
                    rows.push(new ActionRowBuilder());
                }
                rows[rows.length - 1].addComponents(button);
            });

            await interaction.reply({ embeds: [embed], components: rows });
        } catch (error) {
    handleError(error, 'viewcharacterlist.js');

            await interaction.reply({ content: `❌ Error retrieving character list.`, ephemeral: true });
        }
    }
};
