// ------------------- Imports -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const Party = require('../models/PartyModel');
const Character = require('../models/CharacterModel');
const ItemModel = require('../models/ItemModel');
const MonsterModel = require('../models/MonsterModel');
const { fetchAllItems } = require('../database/itemService');
const { getMonstersByRegion, createWeightedItemList,getMonsterEncounterFromList } = require('../modules/rngModule');
const { createExplorationItemEmbed, createExplorationMonsterEmbed } = require('../embeds/exploringEmbeds');

// ------------------- Utility Functions -------------------
function generateShortId(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
}

const regionColors = {
    'eldin': '#FF0000',
    'lanayru': '#0000FF',
    'faron': '#008000',
    'central_hyrule': '#00FFFF',
    'gerudo': '#FFA500',
    'hebra': '#800080'
};
const regionImage = 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';

// ------------------- Expedition Command Definition -------------------
module.exports = {
    data: new SlashCommandBuilder()
        .setName('explore')
        .setDescription('Manage exploration parties')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Setup a new exploration party')
                .addStringOption(option =>
                    option.setName('region')
                        .setDescription('Select the region for exploration')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Eldin', value: 'eldin' },
                            { name: 'Lanayru', value: 'lanayru' },
                            { name: 'Faron', value: 'faron' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setDescription('Join an expedition party')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Expedition ID to join')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Your character name')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName('item1')
                        .setDescription('First item')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName('item2')
                        .setDescription('Second item')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName('item3')
                        .setDescription('Third item')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start the expedition')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Expedition ID to start')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('roll')
                .setDescription('Roll for a random encounter')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Expedition ID')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Your character name')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    // ------------------- Command Execution Logic -------------------
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        console.log(`Executing subcommand: ${subcommand}, User ID: ${interaction.user.id}`);
    

        // ------------------- Expedition Setup -------------------
        if (subcommand === 'setup') {
            const region = interaction.options.getString('region');
            const startPoints = {
                'lanayru': { square: 'G4', quadrant: 'Q2' },
                'eldin': { square: 'D3', quadrant: 'Q3' },
                'faron': { square: 'H6', quadrant: 'Q4' }
            };
            const startPoint = startPoints[region];
            const partyId = generateShortId();

            const party = new Party({
                leaderId: interaction.user.id,
                region,
                square: startPoint.square,
                quadrant: startPoint.quadrant,
                partyId,
                characters: [],
                status: 'open'
            });
            await party.save();

            const embed = new EmbedBuilder()
                .setTitle(`🗺️ **Expedition Started in ${region.charAt(0).toUpperCase() + region.slice(1)}!**`)
                .setColor(regionColors[region] || '#00ff99')
                .setImage(regionImage)
                .setDescription(`**${interaction.user.tag}** is leading an expedition in the **${region.charAt(0).toUpperCase() + region.slice(1)}** region! 🎉\n\n`)
                .addFields(
                    { name: '🆔 **__Expedition ID__**', value: partyId, inline: true },
                    { name: '📍 **__Starting Location__**', value: `${startPoint.square} ${startPoint.quadrant}`, inline: true },
                    { name: '⏱️ **__Join the Expedition__**', value: `You have **15 minutes** to join!\n\n**To join, use:**\n\`\`\`\n/explore join id:${partyId} charactername: item1: item2: item3:\n\`\`\``, inline: false },
                    { name: '✨ **__Get Ready__**', value: `Once ready, use the following to start:\n\`\`\`\n/explore start id:${partyId}\n\`\`\``, inline: false }
                )
                .setFooter({ text: '🧭 Happy exploring!' });

            const message = await interaction.reply({ embeds: [embed], fetchReply: true });
            party.messageId = message.id;
            await party.save();

        // ------------------- Join Expedition -------------------
        } else if (subcommand === 'join') {
            const expeditionId = interaction.options.getString('id');
            const characterName = interaction.options.getString('charactername');
            const itemNames = [
                interaction.options.getString('item1').split(' - ')[0], 
                interaction.options.getString('item2').split(' - ')[0],
                interaction.options.getString('item3').split(' - ')[0]
            ];
            const userId = interaction.user.id;

            const party = await Party.findOne({ partyId: expeditionId });
            const character = await Character.findOne({ name: characterName, userId }).lean();

            if (!party || !character) {
                return interaction.reply('❌ Invalid expedition ID, character, or items selected. Ensure you meet all requirements.');
            }

            // Check if the character's inventory has been synced
            if (!character.inventorySynced) {
                return interaction.reply({
                    content: `❌ **You cannot use this command because your character does not have an inventory set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> command to initialize your inventory.**`,
                    ephemeral: true,
                });
            }

            const items = [];
            for (const itemName of itemNames) {
                const foundItems = await ItemModel.find({
                    itemName: itemName,
                    $or: [
                        { modifierHearts: { $gt: 0 } },
                        { staminaRecovered: { $gt: 0 } },
                        { itemName: 'Eldin Ore' },
                        { itemName: 'Wood' }
                    ]
                }).lean().exec();
                if (foundItems.length > 0) {
                    items.push(foundItems[0]);
                }
            }

            if (items.length < 3) {
                return interaction.reply('❌ Invalid expedition ID, character, or items selected. Ensure you meet all requirements.');
            }

            const characterData = {
                _id: character._id,
                name: character.name,
                currentHearts: character.currentHearts,
                currentStamina: character.currentStamina,
                items: items.map(item => ({
                    itemName: item.itemName,
                    modifierHearts: item.modifierHearts,
                    staminaRecovered: item.staminaRecovered
                }))
            };
            party.characters.push(characterData);
            await party.save();

            let totalHearts = 0;
            let totalStamina = 0;
            const membersFields = await Promise.all(
                party.characters.map(async (char) => {
                    const charData = await Character.findById(char._id).lean();
                    const charHearts = charData.currentHearts;
                    const charStamina = charData.currentStamina;

                    totalHearts += charHearts;
                    totalStamina += charStamina;

                    const charItems = char.items.map(item => 
                        `${item.itemName} - Heals ${item.modifierHearts || 0} ❤️ | ${item.staminaRecovered || 0} 🟩`
                    ).join('\n');

                    return {
                        name: `🔹 __**${char.name}**__ ❤️ ${charHearts} | 🟩 ${charStamina}`,
                        value: `>>> ${charItems}\n`,
                        inline: false
                    };
                })
            );

            const embedFields = [
                { name: '🆔 **__Expedition ID__**', value: expeditionId, inline: true },
                { name: '📍 **__Starting Location__**', value: `${party.square} ${party.quadrant}`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '❤️ **__Party Hearts__**', value: `${totalHearts}`, inline: true },
                { name: '🟩 **__Party Stamina__**', value: `${totalStamina}`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '\u200B', value: `\`\`\`\n          \n\`\`\``, inline: false },
                ...membersFields
            ];
            
            if (party.characters.length < 4) {
                embedFields.push({
                    name: '⏱️ **__Join the Expedition__**',
                    value: `Use the command below until 4 members join or expedition starts:\n\`\`\`\n/explore join id:${expeditionId} charactername: item1: item2: item3:\n\`\`\``,
                    inline: false
                });
            }
            
            embedFields.push({
                name: '✨ **__Get Ready__**',
                value: `Once ready, use the following to start:\n\`\`\`\n/explore start id:${expeditionId}\n\`\`\``,
                inline: false
            });

            const updatedEmbed = new EmbedBuilder()
                .setTitle(`🗺️ **Expedition in ${party.region.charAt(0).toUpperCase() + party.region.slice(1)}**`)
                .setColor(regionColors[party.region] || '#00ff99')
                .setImage(regionImage)
                .setDescription(`**${interaction.user.tag}** is leading an expedition in the **${party.region.charAt(0).toUpperCase() + party.region.slice(1)}** region! 🎉\n\n`)
                .addFields(embedFields)
                .setFooter({ text: '🧭 Happy exploring!' });

            const originalMessage = await interaction.channel.messages.fetch(party.messageId);
            await originalMessage.edit({ embeds: [updatedEmbed] });
            await interaction.reply({ content: `✅ ${characterName} has joined the expedition with their items!`, ephemeral: true });

        // ------------------- Start Expedition -------------------
        } else if (subcommand === 'start') {
            const expeditionId = interaction.options.getString('id');
            const party = await Party.findOne({ partyId: expeditionId });

            if (!party) {
                return interaction.reply('❌ Expedition ID not found or expedition is not open.');
            }

            party.status = 'started';
            await party.save();
            const originalMessage = await interaction.channel.messages.fetch(party.messageId);

            let totalHearts = 0;
            let totalStamina = 0;

            const membersFields = await Promise.all(
                party.characters.map(async (char) => {
                    const charData = await Character.findById(char._id).lean();
                    const charHearts = charData.currentHearts;
                    const charStamina = charData.currentStamina;

                    totalHearts += charHearts;
                    totalStamina += charStamina;

                    const charItems = char.items.map(item => 
                        `${item.itemName} - Heals ${item.modifierHearts || 0} ❤️ | ${item.staminaRecovered || 0} 🟩`
                    ).join('\n');

                    return {
                        name: `🔹 __**${char.name}**__ ❤️ ${charHearts} | 🟩 ${charStamina}`,
                        value: `>>> ${charItems}\n`,
                        inline: false
                    };
                })
            );

            const startedEmbed = new EmbedBuilder()
                .setTitle(`🗺️ **Expedition Started in ${party.region.charAt(0).toUpperCase() + party.region.slice(1)}!**`)
                .setColor(regionColors[party.region] || '#00ff99')
                .setImage(regionImage)
                .setDescription(`**${interaction.user.tag}** has officially started the expedition in the **${party.region.charAt(0).toUpperCase() + party.region.slice(1)}** region! 🚀\n\n`)
                .addFields(
                    { name: '🆔 **__Expedition ID__**', value: expeditionId, inline: true },
                    { name: '📍 **__Starting Location__**', value: `${party.square} ${party.quadrant}`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: '❤️ **__Party Hearts__**', value: `${totalHearts}`, inline: true },
                    { name: '🟩 **__Party Stamina__**', value: `${totalStamina}`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: '\u200B', value: `\`\`\`\n          \n\`\`\``, inline: false },
                    ...membersFields
                )
                .setFooter({ text: '🧭 Adventure awaits!' });

            await originalMessage.edit({ embeds: [startedEmbed] });
            await interaction.reply({ 
                content: `🚀 Expedition started! Use \`/explore roll id:${expeditionId} charactername:<character_name>\` to begin!`, 
                ephemeral: false 
            });            

        // ------------------- Roll for Encounter -------------------
    } else  if (subcommand === 'roll') {
        const expeditionId = interaction.options.getString('id');
        const characterName = interaction.options.getString('charactername');
        const userId = interaction.user.id;

        console.log(`Rolling for encounter - Expedition ID: ${expeditionId}, Character Name: ${characterName}, User ID: ${userId}`);
        
        const party = await Party.findOne({ partyId: expeditionId });
        const character = await Character.findOne({ name: characterName, userId });

        console.log(`Party found: ${party ? true : false}, Character found: ${character ? character.name : 'Not found'}`);

        if (!party || !character) {
            return interaction.reply('❌ Expedition ID or character not found.');
        }

        // Check if the character's inventory has been synced
        if (!character.inventorySynced) {
            return interaction.reply({
                content: `❌ **You cannot use this command because your character does not have an inventory set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> command to initialize your inventory.**`,
                ephemeral: true,
            });
        }

   
        const location = `${party.square} ${party.quadrant}`;
        const encounterType = Math.random() < 0.5 ? 'monster' : 'item';
        console.log(`Encounter Type: ${encounterType}`);
    
        if (encounterType === 'monster') {
            const monsters = await getMonstersByRegion(party.region.toLowerCase());
            const selectedMonster = monsters.length > 0 ? monsters[Math.floor(Math.random() * monsters.length)] : null;
            if (selectedMonster) {
                const embed = createExplorationMonsterEmbed(party, character, selectedMonster, expeditionId, location);
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.reply('❌ No monsters available.');
            }
        } else {
            const allItems = await fetchAllItems();
            const availableItems = allItems.filter(item => item[party.region.toLowerCase()]);
            const selectedItem = availableItems.length > 0 ? availableItems[Math.floor(Math.random() * availableItems.length)] : null;
            if (selectedItem) {
                const embed = createExplorationItemEmbed(party, character, selectedItem, expeditionId, location);
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.reply('❌ No items available.');
            }
        }
    }
    
    }
};
