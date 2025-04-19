// ------------------- Imports -------------------
// Standard Libraries
const { v4: uuidv4 } = require('uuid');

const { handleError } = require('../../utils/globalErrorHandler.js');
// Discord.js Components
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');

// Database Connections
// (Add imports for database connection modules here if applicable)

// Database Services
const { fetchAllItems, fetchItemsByMonster } = require('../../database/itemService.js');

// Modules
const { calculateFinalValue, createWeightedItemList, getMonsterEncounterFromList, getMonstersByRegion } = require('../../modules/rngModule.js');
const { processBattle, getEncounterOutcome } = require('../../modules/damageModule.js');
const { storeBattleProgress } = require('../../modules/combatModule.js');
const { triggerRaid } = require('../../handlers/raidHandler.js');

// Utility Functions
const { addItemInventoryDatabase } = require('../../utils/inventoryUtils.js');
const { authorizeSheets, appendSheetData, extractSpreadsheetId } = require('../../utils/googleSheetsUtils.js');

// Database Models
const Party = require('../../models/PartyModel.js');
const Character = require('../../models/CharacterModel.js');
const ItemModel = require('../../models/ItemModel.js');
const MonsterModel = require('../../models/MonsterModel.js');

// Embeds
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

            const party = await Party.findOne({ partyId: expeditionId }).lean();
const character = await Character.findOne({ name: characterName, userId });

if (!party || !character) {
    return interaction.editReply('❌ Expedition ID or character not found.');
}

if (!character.inventorySynced) {
    return interaction.editReply({
        content: `❌ **You cannot use this command because your character does not have an inventory set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> command to initialize your inventory.**`,
        ephemeral: true,
    });
}

// ------------------- Validate Character Name and Icon -------------------
if (!character.name || typeof character.name !== 'string') {
    console.error(`[ERROR] Character name is invalid or undefined for Character ID: ${character._id}`);
    return interaction.editReply('❌ **Character name is invalid or missing. Please check your character settings.**');
}

if (!character.icon || !character.icon.startsWith('http')) {
    console.warn(`[WARN] Character icon is invalid or undefined for Character ID: ${character._id}. Defaulting to placeholder.`);
    character.icon = 'https://via.placeholder.com/100'; // Fallback to a default icon
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
} else if (subcommand === 'roll') {
    try {
        // Defer the reply to indicate a delay in processing
        await interaction.deferReply();

        // ------------------- Retrieve Command Options -------------------
        const expeditionId = interaction.options.getString('id');
        const characterName = interaction.options.getString('charactername');
        const userId = interaction.user.id;

        // ------------------- Fetch Expedition and Character Data -------------------
        const party = await Party.findOne({ partyId: expeditionId }).lean();
        const character = await Character.findOne({ name: characterName, userId });

        if (!party || !character) {
            return interaction.editReply('❌ Expedition ID or character not found.');
        }

        if (!character.inventorySynced) {
            return interaction.editReply({
                content: `❌ **You cannot use this command because your character does not have an inventory set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> command to initialize your inventory.**`,
                ephemeral: true,
            });
        }

        // ------------------- Calculate Party Stats -------------------
        let totalHearts = 0;
        let totalStamina = 0;

        const charactersWithData = await Promise.all(
            party.characters.map(async (char) => {
                const charData = await Character.findById(char._id).lean();
                totalHearts += charData.currentHearts || 0;
                totalStamina += charData.currentStamina || 0;

                // Combine the original Party model character data with fresh Character model data
                return { ...char, currentHearts: charData.currentHearts, currentStamina: charData.currentStamina };
            })
        );

        // ------------------- Generate Items Carried String -------------------
        const itemsCarried = charactersWithData
            .flatMap(char => (char.items || []).map(item =>
                `${item.itemName} - Heals ${item.modifierHearts || 0} ❤️ | ${item.staminaRecovered || 0} 🟩`
            ))
            .join('\n') || "None";

        // ------------------- Determine Encounter Type -------------------
        const location = `${party.square} ${party.quadrant}`;
        const encounterType = Math.random() < 1 ? 'monster' : 'item';

// ------------------- Handle Monster Encounter -------------------
if (encounterType === 'monster') {
    const monsters = await getMonstersByRegion(party.region.toLowerCase());
    const selectedMonster = monsters.length > 0 ? monsters[Math.floor(Math.random() * monsters.length)] : null;

    if (selectedMonster) {
        console.log(`[ENCOUNTER] Monster Encountered: ${selectedMonster.name}, Tier: ${selectedMonster.tier}`);

        if (selectedMonster.tier > 4) {
            const battleId = Date.now(); // Generate a unique battle ID
            const monsterHearts = { max: selectedMonster.hearts, current: selectedMonster.hearts };

            console.log(`[DEBUG] Triggering raid for Tier ${selectedMonster.tier} monster: ${selectedMonster.name}`);
            await storeBattleProgress(
                battleId,
                character,
                selectedMonster,
                selectedMonster.tier,
                monsterHearts,
                null, // Thread ID (optional)
                'Raid started: Player turn next.'
            );

            try {
                // Start the raid
   // Defer the reply to prepare for followUp usage
await interaction.deferReply();

await triggerRaid(
    character,
    selectedMonster,
    interaction, // Pass the interaction after deferring
    null,        // No threadId initially
    false        // Not a Blood Moon Raid
);


                if (!raidOutcome) {
                    console.error(`[ERROR] Raid outcome is undefined for battle ID: ${battleId}`);
                    await interaction.editReply('❌ **An error occurred during the raid.**');
                    return;
                }

                // Adjust party hearts after the raid
                const koCharacters = raidOutcome.koCharacters || [];
                for (const koChar of koCharacters) {
                    const characterIndex = party.characters.findIndex(char => char._id.toString() === koChar._id.toString());
                    if (characterIndex !== -1) {
                        totalHearts -= koChar.currentHearts;
                        party.characters[characterIndex].currentHearts = 0;
                    }
                }

                await Party.updateOne({ partyId: expeditionId }, { characters: party.characters });

                // Generate raid outcome embed
                const embed = createExplorationMonsterEmbed(
                    party,
                    character,
                    selectedMonster,
                    expeditionId,
                    location,
                    totalHearts,
                    totalStamina,
                    itemsCarried
                );

                embed.addFields(
                    { name: `💙 __Monster Hearts__`, value: `${monsterHearts.current}/${monsterHearts.max}`, inline: true },
                    { name: '🆔 **__Expedition ID__**', value: expeditionId || 'Unknown', inline: true },
                    { name: '📍 **__Current Location__**', value: location || "Unknown Location", inline: true },
                    { name: `⚔️ __Raid Outcome__`, value: raidOutcome.result, inline: false }
                );

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
    handleError(error, 'explore.js');

                console.error(`[ERROR] Raid processing failed for battle ID: ${battleId}`, error);
                await interaction.editReply('❌ **An error occurred during the raid.**');
            }
        } else {
            // Handle normal encounter logic for Tier 4 and below
            console.log(`[ENCOUNTER] Normal encounter with ${selectedMonster.name} (Tier ${selectedMonster.tier}).`);

            const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);

            console.log(`[ENCOUNTER] Damage: ${damageValue}, Adjusted Random Value: ${adjustedRandomValue}`);

            const outcome = await getEncounterOutcome(
                character,
                selectedMonster,
                damageValue,
                adjustedRandomValue,
                attackSuccess,
                defenseSuccess
            );


            const updatedCharacter = await Character.findById(character._id);

            if (updatedCharacter.currentHearts === 0 && !updatedCharacter.ko) {
                console.log(`[ENCOUNTER] ${character.name} is KO'd.`);
                totalHearts -= outcome.hearts; // Deduct the damage dealt from party hearts
                await handleKO(updatedCharacter._id);
            } else {
                totalHearts -= outcome.hearts; // Deduct the damage dealt from party hearts
                console.log(`[ENCOUNTER] ${character.name} took ${outcome.hearts} hearts of damage. Remaining party hearts: ${totalHearts}`);
            }
            
            // Update party hearts in the database
            await Party.updateOne(
                { partyId: expeditionId },
                { $set: { totalHearts } }
            );
            

            const embed = createExplorationMonsterEmbed(
                party,
                character,
                selectedMonster,
                expeditionId,
                location,
                totalHearts,
                totalStamina,
                itemsCarried
            );

            embed.addFields(
                { name: `❤️ __${character.name} Hearts__`, value: `${updatedCharacter.currentHearts}/${updatedCharacter.maxHearts}`, inline: true },
                { name: '🆔 **__Expedition ID__**', value: expeditionId || 'Unknown', inline: true },
                { name: '📍 **__Current Location__**', value: location || "Unknown Location", inline: true },
                { name: `⚔️ __Battle Outcome__`, value: outcome.result, inline: false }
            );

            await interaction.editReply({ embeds: [embed] });

            if (outcome.canLoot) {
                const items = await fetchItemsByMonster(selectedMonster.name);
                const lootedItem = items.length > 0
                    ? items[Math.floor(Math.random() * items.length)]
                    : null;

                if (lootedItem) {
                    await addItemInventoryDatabase(
                        character._id,
                        lootedItem.itemName,
                        1, // Quantity
                        lootedItem.category?.join(', ') || 'Unknown',
                        lootedItem.type?.join(', ') || 'Unknown',
                        interaction
                    );

                    embed.addFields({
                        name: `🎉 __Loot Found__`,
                        value: `${lootedItem.emoji || ''} **${lootedItem.itemName}**`,
                        inline: false
                    });

                    await interaction.editReply({ embeds: [embed] });
                }
            }
        }
    } else {
        console.log('[ENCOUNTER] No monster found.');
        await interaction.editReply('❌ No monsters available.');
    }
}


        // ------------------- Handle Item Encounter -------------------
else {
    const allItems = await fetchAllItems();
    const availableItems = allItems.filter(item => item[party.region.toLowerCase()]);
    const selectedItem = availableItems.length > 0 ? availableItems[Math.floor(Math.random() * availableItems.length)] : null;

    if (selectedItem) {
        const embed = createExplorationItemEmbed(
            party,
            character,
            selectedItem,
            expeditionId,
            location,
            totalHearts,
            totalStamina,
            itemsCarried
        );

        // Ensure gatheredItems exists before pushing
        if (!party.gatheredItems) {
            party.gatheredItems = [];
        }

        // Add the gathered item to the array
        party.gatheredItems.push({
            characterId: character._id,
            characterName: character.name,
            itemName: selectedItem.itemName,
            quantity: 1,
            emoji: selectedItem.emoji || '',
        });
        await Party.updateOne({ partyId: expeditionId }, { gatheredItems: party.gatheredItems });

        // Send the response to the user
        await interaction.editReply({ embeds: [embed] });
    } else {
        await interaction.editReply('❌ No items available for this region.');
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
