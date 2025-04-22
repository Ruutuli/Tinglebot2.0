const { handleError } = require('../../utils/globalErrorHandler');

// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder } = require('@discordjs/builders'); // Import Discord.js slash command builder
const { EmbedBuilder, PermissionsBitField } = require('discord.js'); // Import Discord.js EmbedBuilder and permissions
const { storeEncounter, getRandomMount, getMountThumbnail, getRandomVillage, getMountEmoji } = require('../../modules/mountModule'); // Import mount-related helper functions
const { v4: uuidv4 } = require('uuid'); // Import UUID for generating unique encounter IDs

// ------------------- Define village emojis -------------------
const villageEmojis = {
    rudania: '<:rudania:899492917452890142>',
    inariko: '<:inariko:899493009073274920>',
    vhintl: '<:vhintl:899492879205007450>',
};

// ------------------- Define all-village mounts -------------------
const allVillageMounts = ['Horse', 'Donkey'];

// ------------------- Helper function to get the village emoji -------------------
function getVillageEmoji(village) {
    return villageEmojis[village.toLowerCase()] || '';
}

// ------------------- Main command for generating mount encounters -------------------
module.exports = {
    data: new SlashCommandBuilder()
        .setName('modmount')
        .setDescription('Generate a new mount encounter')
        // Add optional village input with autocomplete choices
        .addStringOption(option => option
            .setName('village')
            .setDescription('Enter the village where the encounter happens')
            .setRequired(false)
            .addChoices(
                { name: 'Rudania', value: 'rudania' },
                { name: 'Inariko', value: 'inariko' },
                { name: 'Vhintl', value: 'vhintl' }
            )
        )
        // Add optional level input with autocomplete choices
        .addStringOption(option => option
            .setName('level')
            .setDescription('Choose the mount level (Basic, Mid, High)')
            .setRequired(false)
            .addChoices(
                { name: 'Basic', value: 'Basic' },
                { name: 'Mid', value: 'Mid' },
                { name: 'High', value: 'High' }
            )
        )
        // Add optional species input with autocomplete choices
        .addStringOption(option => option
            .setName('species')
            .setDescription('Choose the mount species')
            .setRequired(false)
            .addChoices(
                { name: 'Horse 🐴', value: 'Horse' },
                { name: 'Donkey 🍑', value: 'Donkey' },
                { name: 'Ostrich 🦃', value: 'Ostrich' },
                { name: 'Mountain Goat 🐐', value: 'Mountain Goat' },
                { name: 'Deer 🦌', value: 'Deer' },
                { name: 'Bullbo 🐗', value: 'Bullbo' },
                { name: 'Water Buffalo 🐃', value: 'Water Buffalo' },
                { name: 'Wolfos 🐺', value: 'Wolfos' },
                { name: 'Dodongo 🐉', value: 'Dodongo' },
                { name: 'Moose 🍁', value: 'Moose' },
                { name: 'Bear 🐻', value: 'Bear' }
            )
        ),

    async execute(interaction) {
        // ------------------- Check for Admin Permissions -------------------
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true,
            });
        }

        // ------------------- Extract Options and Generate Encounter -------------------
        const village = interaction.options.getString('village') || getRandomVillage();
        let species = interaction.options.getString('species') || getRandomMount(village).mount;
        let level = interaction.options.getString('level');

        // ------------------- Assign Level Based on Species -------------------
        if (!level) {
            const speciesToLevelMap = {
                Horse: ['Basic', 'Mid', 'High'],
                Donkey: ['Basic', 'Mid', 'High'],
                Ostrich: ['Basic'],
                'Mountain Goat': ['Basic'],
                Deer: ['Basic'],
                Bullbo: ['Mid'],
                'Water Buffalo': ['Mid'],
                Wolfos: ['Mid'],
                Dodongo: ['High'],
                Moose: ['High'],
                Bear: ['High'],
            };

            const validLevels = speciesToLevelMap[species] || [];
            if (validLevels.length === 0) {
                return interaction.reply({
                    content: `❌ Invalid species: ${species}. Please choose a valid species.`,
                    ephemeral: true,
                });
            }

            level = validLevels[Math.floor(Math.random() * validLevels.length)];
        }

        // ------------------- Shorten UUID -------------------
        const encounterId = uuidv4().split('-')[0];

        // ------------------- Prepare Embed -------------------
        const emoji = getMountEmoji(species);
const villageWithEmoji = `${getVillageEmoji(village)} ${village}`;

const embed = new EmbedBuilder()
    .setTitle(`${emoji} 🌟 ${level} Level ${species} Encounter!`)
    .setDescription(
        `🐾 A **${level} level ${species}** has been spotted in **${villageWithEmoji}**!\n\n` +
        `To join the encounter, use </mount:1306176789755858983>.`   )
    .addFields(
        {
            name: '📜 Encounter Information',
            value: `> You will need **Tokens** for this game if you succeed!\n\n` +
                   `Use the command below to join:\n` +
                   `\`\`\`/mount encounterid:${encounterId} charactername:\`\`\``,
            inline: false,
        },
        {
            name: '🏠 Village',
            value: allVillageMounts.includes(species) 
                ? `> 🏠 This mount can be kept by anyone in **any village**, but only those currently in **${villageWithEmoji}** can participate!`
                : `> ❗ This mount can only be kept by villagers from **${villageWithEmoji}**, and only those currently in **${villageWithEmoji}** can participate!`,
            inline: false,
        }
    )
    .setThumbnail(getMountThumbnail(species) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setColor(0xAA926A)
    .setFooter({ text: '⏳ Wait a minute before rolling again or let others participate.' })
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');


        // ------------------- Create Encounter Data -------------------
        const encounterData = {
            users: [],
            mountType: species,
            rarity: 'To be determined',
            mountLevel: level,
            mountStamina: 'To be determined',
            environment: 'To be determined',
            village: village,
            actions: [],
            tameStatus: false,
        };

        // ------------------- Store Encounter and Handle Errors -------------------
        try {
            storeEncounter(encounterId, encounterData);
        } catch (error) {
    handleError(error, 'modMount.js');

            console.error('[modMount.js]: Error storing encounter:', error);
            return interaction.reply({
                content: '❌ Failed to store encounter. Please try again later.',
                ephemeral: true,
            });
        }

        // ------------------- Send Response -------------------
        await interaction.reply({
            embeds: [embed],
            ephemeral: false,
        });
    },
};
