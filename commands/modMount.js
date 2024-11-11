// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder } = require('@discordjs/builders'); // Import Discord.js slash command builder
const { storeEncounter, getRandomMount, getMountThumbnail, getRandomVillage, getRandomLevel, getMountEmoji } = require('../modules/mountModule'); // Import mount-related helper functions
const { v4: uuidv4 } = require('uuid'); // Import UUID for generating unique encounter IDs
const { EmbedBuilder } = require('discord.js'); // Import EmbedBuilder to create rich embeds for messages

// ------------------- Define village emojis -------------------
const villageEmojis = {
    rudania: '<:rudania:899492917452890142>',
    inariko: '<:inariko:899493009073274920>',
    vhintl: '<:vhintl:899492879205007450>',
};

// Helper function to get the village emoji
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
            // Get the options for village, level, and species, or generate them randomly if not provided
            const village = interaction.options.getString('village') || getRandomVillage();
            let species = interaction.options.getString('species') || getRandomMount(village).mount;
        
            // Determine the correct level based on the species if no level is provided
            let level = interaction.options.getString('level');
        
            // Ensure the randomly assigned level is valid for the species
            if (!level) {
                const speciesToLevelMap = {
                    'Horse': ['Basic', 'Mid', 'High'],
                    'Donkey': ['Basic', 'Mid', 'High'],
                    'Ostrich': ['Basic'],
                    'Mountain Goat': ['Basic'],
                    'Deer': ['Basic'],
                    'Bullbo': ['Mid'],
                    'Water Buffalo': ['Mid'],
                    'Wolfos': ['Mid'],
                    'Dodongo': ['High'],
                    'Moose': ['High'],
                    'Bear': ['High'],
                };
        
                // Get the valid levels for the chosen species
                const validLevels = speciesToLevelMap[species];
        
                // Randomly select a valid level from the allowed levels for that species
                level = validLevels[Math.floor(Math.random() * validLevels.length)];
            }
        
            // Generate a unique encounter ID
            const encounterId = uuidv4();
        
            // List of mounts available to all villages
            const allVillageMounts = ['Horse', 'Donkey'];
        
            // Get the emoji for the species and village
            const emoji = getMountEmoji(species);
            const villageWithEmoji = `${getVillageEmoji(village)} ${village}`;
        
            // Create the base embed with encounter details
            const embed = new EmbedBuilder()
                .setTitle(`${emoji} ${level} level ${species} Encounter!`)
                .setDescription(`A **${level} level ${species}** has been spotted in **${villageWithEmoji}**!`)
                .addFields({
                    name: 'Encounter Information', 
                    value: `You will need **Tokens** for this game if you succeed!\n\nUse the following command to join this game:\n\`\`\`/mount encounterid:${encounterId} charactername:\`\`\``,
                    inline: false
                })
                .setThumbnail(getMountThumbnail(species))
                .setColor(0x00FF00) // Green color for the encounter
                .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Decorative image for the embed
                .setFooter({ text: 'Please be polite and wait for others before rolling again or wait a full minute.' });
        
            // If the mount can be kept by anyone in any village, update the village field
            if (allVillageMounts.includes(species)) {
                embed.addFields({
                    name: 'Village',
                    value: `This mount can be kept by anyone in **any village**, but only those currently in **${villageWithEmoji}** can participate!`,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: 'Village',
                    value: `This mount can only be kept by villagers from **${villageWithEmoji}**, and only those currently in **${villageWithEmoji}** can participate!`,
                    inline: false
                });
            }
        
            // Create and store encounter details in the system
            const encounterData = {
                users: [],
                mountType: species,
                rarity: 'To be determined',
                mountLevel: level,
                mountStamina: 'To be determined',
                environment: 'To be determined',
                village: village,
                actions: [],
                tameStatus: false
            };
        
            // Error handling for storing encounter
            try {
                storeEncounter(encounterId, encounterData);
            } catch (error) {
                await interaction.reply({
                    content: '❌ Failed to store encounter. Please try again later.',
                    ephemeral: true
                });
                return;
            }
        
            // Send the encounter embed message
            await interaction.reply({
                embeds: [embed],
                ephemeral: false
            });
        }
    };
