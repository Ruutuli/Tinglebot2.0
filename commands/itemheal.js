// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { 
    fetchCharacterByNameAndUserId, 
    updateCharacterById, 
    getCharacterInventoryCollection 
} = require('../database/characterService');
const { fetchItemByName } = require('../database/itemService');
const { updateCurrentHearts, healKoCharacter, updateCurrentStamina } = require('../modules/characterStatsModule');
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');
const { v4: uuidv4 } = require('uuid');

// ------------------- Main Command Module -------------------
module.exports = {
    data: new SlashCommandBuilder()
        .setName('itemheal')
        .setDescription('Use an item to heal yourself')
        .addStringOption(option =>
            option.setName('charactername')
                .setDescription('The name of your character')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('itemname')
                .setDescription('The item to use for healing')
                .setRequired(true)
                .setAutocomplete(true))
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('The number of items to use for healing')
                .setRequired(false)
                .setMinValue(1)),

    // ------------------- Main execute function for item healing -------------------
    async execute(interaction) {
        await interaction.deferReply();

        const characterName = interaction.options.getString('charactername');
        const itemName = interaction.options.getString('itemname');
        const quantity = interaction.options.getInteger('quantity') || 1;
        const userId = interaction.user.id;

        try {
            const character = await fetchCharacterByNameAndUserId(characterName, userId);
            const item = await fetchItemByName(itemName);

            if (!character) {
                await interaction.editReply({ content: `❌ Character not found.`, ephemeral: true });
                return;
            }

            if (!item) {
                await interaction.editReply({ content: `❌ Item not found.`, ephemeral: true });
                return;
            }

            if (character.debuff?.active) {
                const debuffEndDate = new Date(character.debuff.endDate);
                const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
                await interaction.editReply({
                    content: `❌ **${character.name} is currently debuffed and cannot use items to heal. Please wait until the debuff expires.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
                    ephemeral: true,
                });
                return;
              }

            if (!character.inventorySynced) {
                return interaction.editReply({
                    content: `❌ **Inventory not set up. Please initialize and sync the inventory before using items.**`,
                    ephemeral: true,
                });
            }

            // ------------------- Handle KO status -------------------
            if (character.ko && item.itemName.toLowerCase() !== 'fairy') {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⚠️ Healing Failed ⚠️')
                    .setDescription(`**${item.itemName}** cannot be used to recover from KO. Please use a Fairy or request services from a Healer.`)
                    .setFooter({ text: 'Healing Error' });

                await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }

            // ------------------- Check if character is at max hearts -------------------
            if (character.currentHearts >= character.maxHearts && !item.staminaRecovered) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⚠️ Healing Failed ⚠️')
                    .setDescription(`${character.name} is already at maximum health.`)
                    .setFooter({ text: 'Healing Error' });

                await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }

            // ------------------- Validate if the item can be used for healing -------------------
            const restrictedItems = ['oil jar', 'goron spice'];
            if (restrictedItems.includes(item.itemName.toLowerCase())) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Woah there! ⚠️')
                    .setDescription(`**${character.name}** tried to use **${item.itemName}**. Not a suitable choice!`)
                    .setColor('#FF6347')
                    .setThumbnail(item.image)
                    .setFooter({ text: 'Stick to proper healing items!' });

                await interaction.editReply({ embeds: [embed], ephemeral: true });
                return;
            }

            // ------------------- Healing Logic -------------------
            let healAmount = 0;
            let staminaRecovered = 0;

            if (character.ko && item.itemName.toLowerCase() === 'fairy') {
                await healKoCharacter(character._id);
                character.currentHearts = character.maxHearts;
                await updateCurrentHearts(character._id, character.currentHearts);
                await interaction.editReply({ content: `💫 ${character.name} has been revived and fully healed using a ${item.itemName}!`, ephemeral: false });
                return;
            }

            if (item.itemName.toLowerCase() === 'fairy') {
                healAmount = character.maxHearts - character.currentHearts;
                character.currentHearts = character.maxHearts;
                await updateCurrentHearts(character._id, character.currentHearts);
            } else if (item.modifierHearts) {
                healAmount = Math.min(item.modifierHearts * quantity, character.maxHearts - character.currentHearts);
                character.currentHearts += healAmount;
                await updateCurrentHearts(character._id, character.currentHearts);
            }

            if (item.staminaRecovered) {
                staminaRecovered = Math.min(item.staminaRecovered * quantity, character.maxStamina - character.currentStamina);
                character.currentStamina += staminaRecovered;
                await updateCurrentStamina(character._id, character.currentStamina);
            }

            const inventoryCollection = await getCharacterInventoryCollection(character.name);
            await removeItemInventoryDatabase(character._id, item.itemName, quantity, inventoryCollection);

            if (isValidGoogleSheetsUrl(character.inventory || character.inventoryLink)) {
                const spreadsheetId = extractSpreadsheetId(character.inventory || character.inventoryLink);
                const auth = await authorizeSheets();
                const range = 'loggedInventory!A2:M';
                const uniqueSyncId = uuidv4();
                const formattedDateTime = new Date().toISOString();
                const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

                const values = [
                    [
                        character.name,
                        item.itemName,
                        `-${quantity}`,
                        item.category.join(', '),
                        item.type.join(', '),
                        item.subtype.join(', '),
                        'Used for healing',
                        character.job,
                        '',
                        character.currentVillage,
                        interactionUrl,
                        formattedDateTime,
                        uniqueSyncId
                    ]
                ];

                await appendSheetData(auth, spreadsheetId, range, values);
            }

            let description = `**${character.name}** used **${item.itemName}** ${item.emoji || ''}`;
            if (healAmount > 0) {
                description += ` to heal **${healAmount}** hearts!`;
            }
            if (staminaRecovered > 0) {
                description += ` and recovered **${staminaRecovered}** stamina!`;
            }

            const embed = new EmbedBuilder()
                .setColor('#59A914')
                .setTitle('✬ Healing ✬')
                .setAuthor({
                    name: `${character.name} 🔗`,
                    iconURL: character.icon,
                    url: character.inventory
                })
                .setDescription(description)
                .addFields({
                    name: '__❤️ Hearts__',
                    value: `**${character.currentHearts - healAmount}/${character.maxHearts} → ${character.currentHearts}/${character.maxHearts}**`,
                    inline: true
                })
                .addFields({
                    name: '__🟩 Stamina__',
                    value: `**${character.currentStamina - staminaRecovered}/${character.maxStamina} → ${character.currentStamina}/${character.maxStamina}**`,
                    inline: true
                })
                .setFooter({ text: 'Healing and Stamina Recovery Successful' })
                .setThumbnail(item.image);

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`[itemheal.js]: Error during healing process: ${error.message}`);
            await interaction.editReply({ content: `❌ An error occurred during the healing process.`, ephemeral: true });
        }
    }
};
