// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder  } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { 
    fetchCharacterByNameAndUserId, 
    updateCharacterById, 
    getCharacterInventoryCollection 
} = require('../database/characterService');
const { fetchItemByName } = require('../database/itemService');
const { updateCurrentHearts, healKoCharacter, updateCurrentStamina } = require('../modules/characterStatsModule');
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { getJobPerk } = require('../modules/jobsModule');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');
const { capitalizeWords } = require('../modules/formattingModule');
const initializeInventoryModel = require('../models/InventoryModel');
const { getVillageEmojiByName } = require('../modules/locationsModule');
const { v4: uuidv4 } = require('uuid');

// ------------------- Main Command Module -------------------
module.exports = {
    data: new SlashCommandBuilder()
    .setName('item')
    .setDescription('Use an item for various purposes')
    .addStringOption(option =>
        option.setName('charactername')
            .setDescription('The name of your character')
            .setRequired(true)
            .setAutocomplete(true))
    .addStringOption(option =>
        option.setName('itemname')
            .setDescription('The item to use')
            .setRequired(true)
            .setAutocomplete(true))
    .addIntegerOption(option =>
        option.setName('quantity')
            .setDescription('The number of items to use')
            .setRequired(false)
            .setMinValue(1))
    .addStringOption(option =>
        option.setName('jobname')
            .setDescription('The job to perform using the voucher')
            .setRequired(false)
            .setAutocomplete(true)),      

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

            if (item.itemName.toLowerCase() === 'job voucher') {
                if (character.jobVoucher === true) {
                    await interaction.editReply({
                        content: `❌ A job voucher is already active for **${character.name}** with the job **${character.jobVoucherJob}**. Complete a job before using another voucher.`,
                        ephemeral: true
                    });
                    return;
                }
            
                const jobName = interaction.options.getString('jobname');
                if (!jobName) {
                    await interaction.editReply({
                        content: `❌ You must specify a job to use with the job voucher.`,
                        ephemeral: true
                    });
                    return;
                }
            
                // Activate job voucher and set the job
                character.jobVoucher = true;
                character.jobVoucherJob = jobName;
                await updateCharacterById(character._id, { jobVoucher: true, jobVoucherJob: jobName });
            
                // Deduct the voucher from inventory
                const inventoryCollection = await getCharacterInventoryCollection(character.name);
                await removeItemInventoryDatabase(character._id, item.itemName, quantity, inventoryCollection);
            
// Capitalize the current village
const currentVillage = capitalizeWords(character.currentVillage || 'Unknown');

// Get the emoji for the current village
const villageEmoji = getVillageEmojiByName(currentVillage) || '🌍';

// Fetch the perk for the specified job
const jobPerkInfo = getJobPerk(jobName);

let perkDescription = '';
if (jobPerkInfo) {
    const { perks, village } = jobPerkInfo;

    // Determine the job and perk description
    if (perks.length > 0) {
        perkDescription = `**${character.name}** has used a Job Voucher to perform the ${perks.join(' Perk ')} job, **${jobName}**.`;
    } else {
        perkDescription = `**${character.name}** has used a Job Voucher to perform the **${jobName}** job.`;
    }

    // Conditionally include commands based on unlocked perks
    const commands = [
        perks.includes('GATHERING') ? '</gather:1306176789755858974>' : null,
        perks.includes('CRAFTING') ? '</crafting:1306176789634355242>' : null,
        perks.includes('LOOTING') ? '</loot:1316682863143424121>' : null,
        perks.includes('HEALING') ? '</heal fufill:1306176789755858977>' : null
    ].filter(Boolean); // Remove null values

    if (commands.length) {
        perkDescription += `\n\nUse the following commands to make the most of this Job Voucher:\n${commands.join('\n')}`;
    }
} else {
    perkDescription = `**${character.name}** has used a Job Voucher to perform the job **${jobName}**.`;
}

// ------------------- Embed Configuration -------------------
const embed = new EmbedBuilder()
    .setColor('#FFD700') // Gold color for the embed
    .setTitle('🎫 Job Voucher Activated!')
    .setDescription(perkDescription)
    .addFields(
        { name: `${villageEmoji} Current Village`, value: `**${currentVillage}**`, inline: true },
        { name: '🏷️ Normal Job', value: `**${character.job || "Unemployed"}**`, inline: true }
    )
    .setThumbnail(item.image || 'https://via.placeholder.com/150') // Thumbnail for the item
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Large image for the embed
    .setFooter({ text: '✨ Good luck in your new role! Make the most of this opportunity!' });

// Send the updated embed
await interaction.editReply({ embeds: [embed], ephemeral: true });
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

// ------------------- Healing Logic -------------------
if (character.ko && item.itemName.toLowerCase() === 'fairy') {
    await healKoCharacter(character._id);
    character.currentHearts = character.maxHearts;
    await updateCurrentHearts(character._id, character.currentHearts);
    await interaction.editReply({ content: `💫 ${character.name} has been revived and fully healed using a ${item.itemName}!`, ephemeral: false });
    return;
  } else if (character.ko) {
    await interaction.editReply({
      content: `❌ ${item.itemName} cannot revive a KO'd character. Use a Fairy or consult a Healer.`,
      ephemeral: true,
    });
    return;
  }
  
  if (item.modifierHearts) {
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
