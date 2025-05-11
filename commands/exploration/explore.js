const { handleError } = require('../../utils/globalErrorHandler.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { fetchAllItems, fetchItemsByMonster } = require('../../database/db.js');
const { calculateFinalValue, getMonstersByRegion } = require('../../modules/rngModule.js');
const { getEncounterOutcome } = require('../../modules/encounterModule.js');
const { storeRaidProgress, getRaidProgressById } = require('../../modules/raidModule.js');
const { handleKO } = require('../../modules/characterStatsModule.js');
const { triggerRaid } = require('../../modules/raidModule.js');
const { addItemInventoryDatabase } = require('../../utils/inventoryUtils.js');
const { checkInventorySync } = require('../../utils/characterUtils.js');
const Party = require('../../models/PartyModel.js');
const Character = require('../../models/CharacterModel.js');
const ItemModel = require('../../models/ItemModel.js');
const Square = require('../../models/mapModel.js');
const { createExplorationItemEmbed, createExplorationMonsterEmbed } = require('../../embeds/embeds.js');

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
                status: 'open',
                currentTurn: 0, 
                totalStamina: 0,
                totalHearts: 0, 
                gatheredItems: [], 
                quadrantState: 'unexplored' 
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

            const party = await Party.findOne({ partyId: expeditionId }).lean();
            const character = await Character.findOne({ name: characterName, userId });

            if (!party || !character) {
                return interaction.reply('❌ Expedition ID or character not found.');
            }

            if (party.status !== 'open') {
                return interaction.reply('❌ This expedition has already started.');
            }

            if (party.characters.length >= 4) {
                return interaction.reply('❌ This expedition already has the maximum number of participants (4).');
            }

            const hasCharacterInParty = party.characters.some(char => 
                char.userId === userId
            );
            
            if (hasCharacterInParty) {
                return interaction.reply('❌ You already have a character in this expedition.');
            }

            // ------------------- Check Inventory Sync -------------------
            try {
                await checkInventorySync(character);
            } catch (error) {
                await interaction.reply({
                    content: error.message,
                    ephemeral: true
                });
                return;
            }

            const regionToVillage = {
                'eldin': 'rudania', 
                'lanayru': 'inariko',
                'faron': 'vhintl'
            };
            
            const requiredVillage = regionToVillage[party.region];
            if (character.currentVillage.toLowerCase() !== requiredVillage) {
                return interaction.reply(`❌ Your character must be in ${requiredVillage.charAt(0).toUpperCase() + requiredVillage.slice(1)} to join this expedition.`);
            }

            // ------------------- Validate Character Name and Icon -------------------
            if (!character.name || typeof character.name !== 'string') {
                console.error(`[ERROR] Character name is invalid or undefined for Character ID: ${character._id}`);
                return interaction.reply('❌ **Character name is invalid or missing. Please check your character settings.**');
            }

            if (!character.icon || !character.icon.startsWith('http')) {
                console.warn(`[WARN] Character icon is invalid or undefined for Character ID: ${character._id}. Defaulting to placeholder.`);
                character.icon = 'https://via.placeholder.com/100';
            }

            // Validate items
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
                return interaction.reply('❌ Invalid items selected. Please ensure you have 3 valid exploration items.');
            }

            const characterData = {
                _id: character._id,
                userId: character.userId, 
                name: character.name,
                currentHearts: character.currentHearts,
                currentStamina: character.currentStamina,
                icon: character.icon,
                items: items.map(item => ({
                    itemName: item.itemName,
                    modifierHearts: item.modifierHearts || 0,
                    staminaRecovered: item.staminaRecovered || 0,
                    emoji: item.emoji || '🔹'
                }))
            };

            await Party.updateOne(
                { partyId: expeditionId },
                { 
                    $push: { characters: characterData },
                    $inc: { 
                        totalHearts: character.currentHearts,
                        totalStamina: character.currentStamina
                    }
                }
            );

            const updatedParty = await Party.findOne({ partyId: expeditionId });
            
            let totalHearts = 0;
            let totalStamina = 0;
            const membersFields = updatedParty.characters.map(char => {
                totalHearts += char.currentHearts || 0;
                totalStamina += char.currentStamina || 0;

                const charItems = char.items.map(item => 
                    `${item.emoji || '🔹'} ${item.itemName} - Heals ${item.modifierHearts || 0} ❤️ | ${item.staminaRecovered || 0} 🟩`
                ).join('\n');

                return {
                    name: `🔹 __**${char.name}**__ ❤️ ${char.currentHearts || 0} | 🟩 ${char.currentStamina || 0}`,
                    value: `>>> ${charItems}\n`,
                    inline: false
                };
            });

            const embedFields = [
                { name: '🆔 **__Expedition ID__**', value: expeditionId, inline: true },
                { name: '📍 **__Starting Location__**', value: `${updatedParty.square} ${updatedParty.quadrant}`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '❤️ **__Party Hearts__**', value: `${totalHearts}`, inline: true },
                { name: '🟩 **__Party Stamina__**', value: `${totalStamina}`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '\u200B', value: `\`\`\`\n          \n\`\`\``, inline: false },
                ...membersFields
            ];
            
            if (updatedParty.characters.length < 4) {
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
                .setTitle(`🗺️ **Expedition in ${updatedParty.region.charAt(0).toUpperCase() + updatedParty.region.slice(1)}**`)
                .setColor(regionColors[updatedParty.region] || '#00ff99')
                .setImage(regionImage)
                .setDescription(`**${interaction.user.tag}** is leading an expedition in the **${updatedParty.region.charAt(0).toUpperCase() + updatedParty.region.slice(1)}** region! 🎉\n\n`)
                .addFields(embedFields)
                .setFooter({ text: '🧭 Happy exploring!' });

            try {
                const originalMessage = await interaction.channel.messages.fetch(updatedParty.messageId);
                await originalMessage.edit({ embeds: [updatedEmbed] });
                await interaction.reply({ content: `✅ ${characterName} has joined the expedition with their items!`, ephemeral: true });
            } catch (error) {
                handleError(error, 'explore.js');
                await interaction.reply({ content: `✅ ${characterName} has joined the expedition, but I couldn't update the original message.`, ephemeral: true });
            }

        // ------------------- Start Expedition -------------------
        } else if (subcommand === 'start') {
            const expeditionId = interaction.options.getString('id');
            const party = await Party.findOne({ partyId: expeditionId });
        
            if (!party) {
                return interaction.reply('❌ Expedition ID not found.');
            }
        
            if (party.status !== 'open') {
                return interaction.reply('❌ This expedition has already started.');
            }
        
            if (party.characters.length === 0) {
                return interaction.reply('❌ Cannot start an expedition with no participants.');
            }
        
            if (interaction.user.id !== party.leaderId) {
                return interaction.reply('❌ Only the expedition leader can start the expedition.');
            }
        
            let leaderIndex = party.characters.findIndex(char => char.name === interaction.options.getString('charactername'));
            
            if (leaderIndex === -1) {
                const userCharacters = await Character.find({ userId: interaction.user.id }).lean();
                const userCharacterNames = userCharacters.map(char => char.name);
                
                leaderIndex = party.characters.findIndex(char => userCharacterNames.includes(char.name));
            }
            
            party.currentTurn = leaderIndex !== -1 ? leaderIndex : 0;
            party.status = 'started';
            await party.save();
            try {
                const originalMessage = await interaction.channel.messages.fetch(party.messageId);

                let totalHearts = 0;
                let totalStamina = 0;

                const membersFields = party.characters.map(char => {
                    totalHearts += char.currentHearts || 0;
                    totalStamina += char.currentStamina || 0;

                    const charItems = char.items.map(item => 
                        `${item.emoji || '🔹'} ${item.itemName} - Heals ${item.modifierHearts || 0} ❤️ | ${item.staminaRecovered || 0} 🟩`
                    ).join('\n');

                    return {
                        name: `🔹 __**${char.name}**__ ❤️ ${char.currentHearts || 0} | 🟩 ${char.currentStamina || 0}`,
                        value: `>>> ${charItems}\n`,
                        inline: false
                    };
                });

                const startedEmbed = new EmbedBuilder()
                    .setTitle(`🗺️ **Expedition Started in ${party.region.charAt(0).toUpperCase() + party.region.slice(1)}!**`)
                    .setColor(regionColors[party.region] || '#00ff99')
                    .setImage(regionImage)
                    .setDescription(`**${interaction.user.tag}** has officially started the expedition in the **${party.region.charAt(0).toUpperCase() + party.region.slice(1)}** region! 🚀\n\n`)
                    .addFields(
                        { name: '🆔 **__Expedition ID__**', value: expeditionId, inline: true },
                        { name: '📍 **__Starting Location__**', value: `${party.square} ${party.quadrant}`, inline: true },
                        { name: '📋 **__Quadrant State__**', value: `${party.quadrantState || 'unexplored'}`, inline: true },
                        { name: '❤️ **__Party Hearts__**', value: `${totalHearts}`, inline: true },
                        { name: '🟩 **__Party Stamina__**', value: `${totalStamina}`, inline: true },
                        { name: '🎮 **__Next Turn__**', value: party.characters[0]?.name || 'Unknown', inline: true },
                        { name: '\u200B', value: `\`\`\`\n          \n\`\`\``, inline: false },
                        ...membersFields
                    )
                    .setFooter({ text: '🧭 Adventure awaits!' });

                await originalMessage.edit({ embeds: [startedEmbed] });
                await interaction.reply({ 
                    content: `🚀 Expedition started! Use \`/explore roll id:${expeditionId} charactername:${party.characters[0]?.name || '<character_name>'}\` to begin!`, 
                    ephemeral: false 
                });
            } catch (error) {
                handleError(error, 'explore.js');
                await interaction.reply({ 
                    content: `🚀 Expedition started, but I couldn't update the original message. Use \`/explore roll id:${expeditionId} charactername:<character_name>\` to begin!`, 
                    ephemeral: false 
                });
            }

        // ------------------- Roll for Encounter -------------------
        } else if (subcommand === 'roll') {
            try {
                await interaction.deferReply();

                // ------------------- Retrieve Command Options -------------------
                const expeditionId = interaction.options.getString('id');
                const characterName = interaction.options.getString('charactername');
                const userId = interaction.user.id;

                // ------------------- Fetch Expedition and Character Data -------------------
                const party = await Party.findOne({ partyId: expeditionId });
                if (!party) {
                    return interaction.editReply('❌ Expedition ID not found.');
                }

                const character = await Character.findOne({ name: characterName, userId });
                if (!character) {
                    return interaction.editReply('❌ Character not found or you do not own this character.');
                }

                if (party.status !== 'started') {
                    return interaction.editReply('❌ This expedition has not been started yet.');
                }

                // ------------------- Check Turn Order -------------------
                // Find character's index in the party
                const characterIndex = party.characters.findIndex(char => 
                    char.name === characterName
                );
                
                if (characterIndex === -1) {
                    return interaction.editReply('❌ Your character is not part of this expedition.');
                }

                // Check if it's this character's turn
                if (party.currentTurn !== characterIndex) {
                    const nextCharacter = party.characters[party.currentTurn];
                    return interaction.editReply(`❌ It's not your turn. Next turn: ${nextCharacter?.name || 'Unknown'}`);
                }

                // ------------------- Check Quadrant State and Manage Stamina -------------------
                let staminaCost = 0;
                
                if (party.quadrantState === 'unexplored') {
                    staminaCost = 2; 
                } else if (party.quadrantState === 'explored') {
                    staminaCost = 1;
                } else if (party.quadrantState === 'secured') {
                    staminaCost = 0;
                }

                if (party.totalStamina < staminaCost) {
                    return interaction.editReply(`❌ Not enough party stamina! Required: ${staminaCost}, Available: ${party.totalStamina}`);
                }

                party.totalStamina -= staminaCost;
                await party.save();

                // ------------------- Generate Encounter Type -------------------
                // Generate a random number between 0 and 1
                const encounterType = Math.random() < 0.7 ? 'monster' : 'item'; // 70% chance for monster
                const location = `${party.square} ${party.quadrant}`;

                // ------------------- Handle Item Encounter -------------------
                if (encounterType === 'item') {
                    const allItems = await fetchAllItems();
                    const availableItems = allItems.filter(item => item[party.region.toLowerCase()]);
                    
                    if (availableItems.length === 0) {
                        return interaction.editReply('❌ No items available for this region.');
                    }
                    
                    const selectedItem = availableItems[Math.floor(Math.random() * availableItems.length)];

                    // Create the embed with item information
                    const embed = createExplorationItemEmbed(
                        party,
                        character,
                        selectedItem,
                        expeditionId,
                        location,
                        party.totalHearts,
                        party.totalStamina,
                        party.characters.flatMap(char => char.items).map(item => 
                            `${item.emoji || '🔹'} ${item.itemName}`
                        ).join(', ')
                    );

                    // Add the gathered item to the party's items
                    if (!party.gatheredItems) {
                        party.gatheredItems = [];
                    }

                    party.gatheredItems.push({
                        characterId: character._id,
                        characterName: character.name,
                        itemName: selectedItem.itemName,
                        quantity: 1,
                        emoji: selectedItem.emoji || '',
                    });

                    // Check if this roll completes the quadrant exploration
                    const exploreChance = Math.random();
                    if (exploreChance > 0.7 || party.quadrantState !== 'unexplored') {
                        // This roll has completed the exploration of this quadrant
                        party.quadrantState = 'explored';
                        
                        // Add a field to the embed to indicate this
                        embed.addFields(
                            { name: '✅ Quadrant Explored!', value: 'You have successfully explored this quadrant. You can now:\n- Rest (3 stamina)\n- Secure Quadrant (5 stamina + resources)\n- Continue to next quadrant (2 stamina)', inline: false }
                        );
                    }

                    // Move to the next character's turn
                    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
                    await party.save();

                    // Add the next turn information to the embed
                    embed.addFields(
                        { name: '🎮 **__Next Turn__**', value: party.characters[party.currentTurn]?.name || 'Unknown', inline: true }
                    );

                    // Send the response
                    await interaction.editReply({ embeds: [embed] });
                    
                    // Also add the item to the character's inventory
                    try {
                        await addItemInventoryDatabase(
                            character._id,
                            selectedItem.itemName,
                            1, // Quantity
                            selectedItem.category?.join(', ') || 'Unknown',
                            selectedItem.type?.join(', ') || 'Unknown',
                            interaction
                        );
                    } catch (error) {
                        handleError(error, 'explore.js');
                        console.error(`[ERROR] Could not add item to inventory: ${error.message}`);
                        // Don't fail the command if inventory update fails
                    }

                // ------------------- Handle Monster Encounter -------------------
                } else if (encounterType === 'monster') {
                    const monsters = await getMonstersByRegion(party.region.toLowerCase());
                    if (!monsters || monsters.length === 0) {
                        return interaction.editReply('❌ No monsters available for this region.');
                    }

                    const selectedMonster = monsters[Math.floor(Math.random() * monsters.length)];
                    console.log(`[explore.js]: ⚔️ Encounter: ${selectedMonster.name} (Tier ${selectedMonster.tier})`);

                    // Handle high-tier monsters with raid system
                    if (selectedMonster.tier > 4) {
                        // Create a unique battle ID for the raid
                        const battleId = Date.now().toString();
                        
                        // Store initial battle progress
                        const monsterHearts = { max: selectedMonster.hearts, current: selectedMonster.hearts };
                        
                        // Store battle progress for this raid
                        await storeRaidProgress(
                            character, 
                            selectedMonster, 
                            selectedMonster.tier,
                            monsterHearts, 
                            `Raid started: ${character.name} vs ${selectedMonster.name}`
                        );

                        try {
                            // Trigger the raid and get the battleId
                            const battleId = await triggerRaid(
                                character,
                                selectedMonster,
                                interaction,
                                null,
                                false // Not a Blood Moon Raid
                            );

                            if (!battleId) {
                                console.error(`[ERROR] Failed to trigger raid for battle.`);
                                await interaction.editReply('❌ **An error occurred during the raid setup.**');
                                return;
                            }

                          await new Promise(resolve => setTimeout(resolve, 2000));

                            // Get battle progress to check monster hearts
                            const battleProgress = await getRaidProgressById(battleId);
                            if (!battleProgress) {
                                console.error(`[ERROR] No battle progress found for Battle ID: ${battleId}`);
                                await interaction.editReply('❌ **An error occurred retrieving raid progress.**');
                                return;
                            }

                            // Check if monster was defeated (monsterHearts.current === 0)
                            const monsterDefeated = battleProgress.monsterHearts?.current === 0;
                            
                            // Generate embed for the raid outcome
                            const embed = createExplorationMonsterEmbed(
                                party,
                                character,
                                selectedMonster,
                                expeditionId,
                                location,
                                party.totalHearts,
                                party.totalStamina,
                                party.characters.flatMap(char => char.items).map(item => 
                                    `${item.emoji || '🔹'} ${item.itemName}`
                                ).join(', ')
                            );

                            // Add raid-specific fields
                            embed.addFields(
                                { name: `💙 __Monster Hearts__`, value: `${battleProgress.monsterHearts.current}/${battleProgress.monsterHearts.max}`, inline: true },
                                { name: '🆔 **__Raid ID__**', value: battleId, inline: true },
                                { name: '🆔 **__Expedition ID__**', value: expeditionId || 'Unknown', inline: true },
                                { name: `⚔️ __Raid Outcome__`, value: monsterDefeated ? 'Monster defeated!' : 'Raid in progress...', inline: false }
                            );

                            // Check if monster was defeated to award loot
                            if (monsterDefeated) {
                                // Only check for loot if monster was defeated
                                const items = await fetchItemsByMonster(selectedMonster.name);
                                const lootedItem = items.length > 0
                                    ? items[Math.floor(Math.random() * items.length)]
                                    : null;

                                if (lootedItem) {
                                    embed.addFields({
                                        name: `🎉 __Loot Found__`,
                                        value: `${lootedItem.emoji || ''} **${lootedItem.itemName}**`,
                                        inline: false
                                    });

                                    // Add the loot to the character's inventory
                                    await addItemInventoryDatabase(
                                        character._id,
                                        lootedItem.itemName,
                                        1, // Quantity
                                        lootedItem.category?.join(', ') || 'Unknown',
                                        lootedItem.type?.join(', ') || 'Unknown',
                                        interaction
                                    );

                                    // Also add to party gathered items
                                    if (!party.gatheredItems) {
                                        party.gatheredItems = [];
                                    }
                                    party.gatheredItems.push({
                                        characterId: character._id,
                                        characterName: character.name,
                                        itemName: lootedItem.itemName,
                                        quantity: 1,
                                        emoji: lootedItem.emoji || '',
                                    });
                                }

                                // Check if this roll completes the quadrant exploration
                                const exploreChance = Math.random();
                                if (exploreChance > 0.3 || party.quadrantState !== 'unexplored') {
                                    party.quadrantState = 'explored';
                                    embed.addFields(
                                        { name: '✅ Quadrant Explored!', value: 'You have successfully explored this quadrant. You can now:\n- Rest (3 stamina)\n- Secure Quadrant (5 stamina + resources)\n- Continue to next quadrant (2 stamina)', inline: false }
                                    );
                                }
                            }

                            // Move to the next character's turn
                            party.currentTurn = (party.currentTurn + 1) % party.characters.length;
                            await party.save();

                            // Add the next turn information to the embed
                            embed.addFields(
                                { name: '🎮 **__Next Turn__**', value: party.characters[party.currentTurn]?.name || 'Unknown', inline: true }
                            );

                            // Send the raid outcome embed
                            await interaction.editReply({ embeds: [embed] });

                        } catch (error) {
                            handleError(error, 'explore.js');
                            console.error(`[ERROR] Raid processing failed:`, error);
                            await interaction.editReply('❌ **An error occurred during the raid.**');
                        }
                    } else {
                        // Handle normal encounter logic for Tier 4 and below
                        console.log(`[ENCOUNTER] Normal encounter with ${selectedMonster.name} (Tier ${selectedMonster.tier}).`);

                        // Calculate the outcome using RNG and character stats
                        const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);
                        console.log(`[ENCOUNTER] Damage: ${damageValue}, Adjusted Random Value: ${adjustedRandomValue}`);

                        // Get the encounter outcome based on the calculations
                        const outcome = await getEncounterOutcome(
                            character,
                            selectedMonster,
                            damageValue,
                            adjustedRandomValue,
                            attackSuccess,
                            defenseSuccess
                        );

                        // Handle damage to character and check for KO
                        if (outcome.hearts > 0) {
                            // Deduct hearts from party's total
                            party.totalHearts = Math.max(0, party.totalHearts - outcome.hearts);
                            
                            // Deduct hearts from the character
                            character.currentHearts = Math.max(0, character.currentHearts - outcome.hearts);
                            
                            // Check if character is KO'd
                            if (character.currentHearts === 0) {
                                await handleKO(character._id);
                                console.log(`[ENCOUNTER] ${character.name} is KO'd.`);
                            }
                            
                            // Save the updated character
                            await character.save();
                        }

                        // Create the monster encounter embed
                        const embed = createExplorationMonsterEmbed(
                            party,
                            character,
                            selectedMonster,
                            expeditionId,
                            location,
                            party.totalHearts,
                            party.totalStamina,
                            party.characters.flatMap(char => char.items).map(item => 
                                `${item.emoji || '🔹'} ${item.itemName}`
                            ).join(', ')
                        );

                        // Add outcome details to the embed
                        embed.addFields(
                            { name: `❤️ __${character.name} Hearts__`, value: `${character.currentHearts}/${character.maxHearts}`, inline: true },
                            { name: '🆔 **__Expedition ID__**', value: expeditionId || 'Unknown', inline: true },
                            { name: '📍 **__Current Location__**', value: location || "Unknown Location", inline: true },
                            { name: `⚔️ __Battle Outcome__`, value: outcome.result, inline: false }
                        );

                        // Handle loot if the encounter outcome allows it
                        if (outcome.canLoot) {
                            const items = await fetchItemsByMonster(selectedMonster.name);
                            const lootedItem = items.length > 0
                                ? items[Math.floor(Math.random() * items.length)]
                                : null;

                            if (lootedItem) {
                                embed.addFields({
                                    name: `🎉 __Loot Found__`,
                                    value: `${lootedItem.emoji || ''} **${lootedItem.itemName}**`,
                                    inline: false
                                });

                                // Add the loot to the character's inventory
                                await addItemInventoryDatabase(
                                    character._id,
                                    lootedItem.itemName,
                                    1, // Quantity
                                    lootedItem.category?.join(', ') || 'Unknown',
                                    lootedItem.type?.join(', ') || 'Unknown',
                                    interaction
                                );

                                // Also add to party gathered items
                                if (!party.gatheredItems) {
                                    party.gatheredItems = [];
                                }
                                party.gatheredItems.push({
                                    characterId: character._id,
                                    characterName: character.name,
                                    itemName: lootedItem.itemName,
                                    quantity: 1,
                                    emoji: lootedItem.emoji || '',
                                });
                            }

                            // Check if this roll completes the quadrant exploration
                            const exploreChance = Math.random();
                            if (exploreChance > 0.3 || party.quadrantState !== 'unexplored') {
                                party.quadrantState = 'explored';
                                embed.addFields(
                                    { name: '✅ Quadrant Explored!', value: 'You have successfully explored this quadrant. You can now:\n- Rest (3 stamina)\n- Secure Quadrant (5 stamina + resources)\n- Continue to next quadrant (2 stamina)', inline: false }
                                );
                            }
                        }

                        // Move to the next character's turn
                        party.currentTurn = (party.currentTurn + 1) % party.characters.length;
                        await party.save();

                        // Add the next turn information to the embed
                        embed.addFields(
                            { name: '🎮 **__Next Turn__**', value: party.characters[party.currentTurn]?.name || 'Unknown', inline: true }
                        );

                        // Send the encounter outcome embed
                        await interaction.editReply({ embeds: [embed] });
                    }
                }
            } catch (error) {
                handleError(error, 'explore.js');
                console.error(`[Roll Command Error]`, error);
                await interaction.editReply('❌ An error occurred while processing the roll command.');
            }
        }
    }
};
