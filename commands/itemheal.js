// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { 
    fetchCharacterByNameAndUserId, 
    updateCharacterById, 
    getCharacterInventoryCollection 
} = require('../database/characterService');
const { fetchItemByName } = require('../database/itemService');
const { updateCurrentHearts, healKoCharacter, updateCurrentStamina } = require('../modules/characterStatsModule'); // Added updateCurrentStamina
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

            // Check if the character's inventory has been synced
if (!character.inventorySynced) {
    return interaction.editReply({
        content: `❌ **You cannot use items for healing because \`${character.name}\`'s inventory is not set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> commands to initialize the inventory.**`,
        ephemeral: true,
    });
}


            // ------------------- Check if character is at max hearts -------------------
            if (character.currentHearts >= character.maxHearts && !item.staminaRecovered) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⚠️ Healing Failed ⚠️')
                    .setDescription(`${character.name} could not be healed as they are already at maximum health.`)
                    .setFooter({ text: 'Healing Error' });

                await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }

            // ------------------- Validate if the item can be used for healing -------------------
            const restrictedItems = ['oil jar', 'goron spice']; // Restricted items
            if (restrictedItems.includes(item.itemName.toLowerCase())) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Woah there! ⚠️')
                    .setDescription(`**${character.name}** tried to eat **${item.itemName}**. That's not exactly gourmet, maybe don’t eat that! 🍳`)
                    .setColor('#FF6347')
                    .setThumbnail(item.image)
                    .setFooter({ text: 'Let’s stick to food next time!' });

                await interaction.editReply({ embeds: [embed], ephemeral: true });
                return;
            }

            // ------------------- Handle KO status (Fairy can revive KO'd characters) -------------------
            let healAmount = 0;
            let staminaRecovered = 0;
            if (character.ko && item.itemName.toLowerCase() === 'fairy') {
                await healKoCharacter(character._id); 
                character.currentHearts = character.maxHearts;
                await updateCurrentHearts(character._id, character.currentHearts);
                await interaction.editReply({ content: `💫 ${character.name} has been revived and fully healed using a ${item.itemName}!`, ephemeral: false });
                return;
            }

            // ------------------- Handle regular healing -------------------
            if (item.itemName.toLowerCase() === 'fairy') {
                healAmount = character.maxHearts - character.currentHearts;
                character.currentHearts = character.maxHearts;
                await updateCurrentHearts(character._id, character.currentHearts);
            } else if (item.modifierHearts) {
                healAmount = Math.min(item.modifierHearts * quantity, character.maxHearts - character.currentHearts);
                character.currentHearts += healAmount;
                await updateCurrentHearts(character._id, character.currentHearts);
            }

            // ------------------- Handle stamina recovery -------------------
            if (item.staminaRecovered) {
                staminaRecovered = Math.min(item.staminaRecovered * quantity, character.maxStamina - character.currentStamina);
                character.currentStamina += staminaRecovered;
                await updateCurrentStamina(character._id, character.currentStamina);
            }

            // ------------------- Remove used items from inventory -------------------
            const inventoryCollection = await getCharacterInventoryCollection(character.name);
            await removeItemInventoryDatabase(character._id, item.itemName, quantity, inventoryCollection);

            // ------------------- Update Google Sheets if inventory link is valid -------------------
            const inventoryLink = character.inventory || character.inventoryLink;
            if (isValidGoogleSheetsUrl(inventoryLink)) {
                const spreadsheetId = extractSpreadsheetId(inventoryLink);
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

            // ------------------- Create and send embed with healing and stamina recovery details -------------------
            let description = `**${character.name}** used **${item.itemName}** ${item.emoji || ''}`;
            if (healAmount > 0) {
                description += ` to heal **${healAmount}** hearts!`;
            }
            if (staminaRecovered > 0) {
                description += ` and recovered **${staminaRecovered}** stamina!`;
            }

            const embed = new EmbedBuilder()
                .setColor('#59A914') // Green healing color
                .setTitle('✬ Healing ✬')
                .setAuthor({
                    name: `${character.name} 🔗`, 
                    iconURL: character.icon, 
                    url: character.inventory // Inventory link added to the author
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
                .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Custom image added
                .setThumbnail(item.image); // Add item image as a thumbnail

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply({ content: `❌ An error occurred during the healing process.`, ephemeral: true });
        }
    }
};
