// ------------------- Standard Libraries -------------------
// Used for generating unique identifiers.
const { v4: uuidv4 } = require('uuid');


const { handleError } = require('../../utils/globalErrorHandler');
// ------------------- Discord.js Components -------------------
// Components for building slash commands and rich embed messages.
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');


// ------------------- Database Services -------------------
// Service modules for character and item operations.
const { fetchCharacterByNameAndUserId, updateCharacterById, getCharacterInventoryCollection,fetchItemByName } = require('../../database/db');


// ------------------- Modules -------------------
// Custom modules for character statistics, jobs, formatting, and location information.
const { updateCurrentHearts, healKoCharacter, updateCurrentStamina } = require('../../modules/characterStatsModule');
const { getJobPerk } = require('../../modules/jobsModule');
const { capitalizeWords } = require('../../modules/formattingModule');
const { getVillageEmojiByName } = require('../../modules/locationsModule');


// ------------------- Utility Functions -------------------
// Inventory utility functions.
const { removeItemInventoryDatabase } = require('../../utils/inventoryUtils');


// ------------------- Google Sheets API -------------------
// Functions for integrating with Google Sheets.
const { authorizeSheets, appendSheetData } = require('../../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../../utils/validation');


// ------------------- Main Command Module -------------------
// This module defines the /item command for using items (e.g., healing or job vouchers).
module.exports = {
    data: new SlashCommandBuilder()
        .setName('item')
        .setDescription('Use an item for various purposes')
        .addStringOption(option =>
            option.setName('charactername')
                .setDescription('The name of your character')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName('itemname')
                .setDescription('The item to use')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('The number of items to use')
                .setRequired(false)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('jobname')
                .setDescription('The job to perform using the voucher')
                .setRequired(false)
                .setAutocomplete(true)
        ),

    // ------------------- Execute Function for Item Command -------------------
    // Handles the execution of the item command, including healing logic, job voucher activation,
    // and various validations such as debuff, KO status, and inventory sync.
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
                // ------------------- Job Voucher Handling -------------------
                if (item.itemName.toLowerCase() === 'job voucher') {
                    // ------------------- Active Voucher Check -------------------
                    if (character.jobVoucher === true) {
                    await interaction.editReply({
                        content: `❌ **${character.name}** already has an active Job Voucher for **${character.jobVoucherJob}**.\nPlease complete the current job before using another voucher.`,
                        ephemeral: true,
                    });
                    return;
                    }
                
                    // ------------------- Validate Inventory Existence -------------------
                    const inventoryCollection = await getCharacterInventoryCollection(character.name);
                    if (!inventoryCollection) {
                    await interaction.editReply({
                        content: `❌ **${character.name}** does not have an inventory set up. Please initialize an inventory before using a Job Voucher.`,
                        ephemeral: true,
                    });
                    return;
                    }
                
                    const inventoryItems = await inventoryCollection.find().toArray();
                    const hasJobVoucher = inventoryItems.some(invItem =>
                    invItem.itemName && invItem.itemName.toLowerCase() === 'job voucher'
                    );
                
                    if (!hasJobVoucher) {
                    await interaction.editReply({
                        content: `❌ **${character.name}** does not have a Job Voucher in their inventory.`,
                        ephemeral: true,
                    });
                    return;
                    }
                
                    // ------------------- Validate Job Selection -------------------
                    const jobName = interaction.options.getString('jobname');
                    if (!jobName) {
                    await interaction.editReply({
                        content: `❌ You must specify a job to use with the Job Voucher.`,
                        ephemeral: true,
                    });
                    return;
                    }
                
                    const jobPerkInfo = getJobPerk(jobName);
                    if (!jobPerkInfo) {
                    await interaction.editReply({
                        content: `❌ "**${capitalizeWords(jobName)}**" is not a valid job.\nPlease select a valid job from the suggestions.`,
                        ephemeral: true,
                    });
                    return;
                    }
                
                    // ------------------- Activate Voucher -------------------
                    character.jobVoucher = true;
                    character.jobVoucherJob = jobName;
                    await updateCharacterById(character._id, { jobVoucher: true, jobVoucherJob: jobName });
                
                    // ------------------- Remove Job Voucher from Inventory -------------------
                        await removeItemInventoryDatabase(character._id, "Job Voucher", 1, interaction);

                        // ------------------- Log Removal to Google Sheets -------------------
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
                            "Job Voucher",
                            "-1",
                            "Voucher",
                            "Special",
                            "",
                            `Used for ${jobName}`,
                            character.job,
                            "",
                            character.currentVillage,
                            interactionUrl,
                            formattedDateTime,
                            uniqueSyncId
                            ]
                        ];

                        await appendSheetData(auth, spreadsheetId, range, values);
                        }

                    // ------------------- Build Voucher Embed -------------------
                    const currentVillage = capitalizeWords(character.currentVillage || 'Unknown');
                    const villageEmoji = getVillageEmojiByName(currentVillage) || '🌍';
                
                    let perkDescription = `**${character.name}** has used a Job Voucher to perform the **${jobName}** job.`;
                
                    if (jobPerkInfo?.perks?.length > 0) {
                    perkDescription = `**${character.name}** has used a Job Voucher to perform the **${jobName}** job with the following perk(s): **${jobPerkInfo.perks.join(', ')}**.`;
                
                    const commands = [
                        jobPerkInfo.perks.includes('GATHERING') ? '> </gather:1306176789755858974>' : null,
                        jobPerkInfo.perks.includes('CRAFTING') ? '> </crafting:1306176789634355242>' : null,
                        jobPerkInfo.perks.includes('LOOTING') ? '> </loot:1316682863143424121>' : null,
                        jobPerkInfo.perks.includes('HEALING') ? '> </heal fufill:1306176789755858977>' : null,
                    ].filter(Boolean);
                
                    if (commands.length) {
                        perkDescription += `\n\nUse the following commands to make the most of this role:\n${commands.join('\n')}`;
                    }
                    }
                
                    const voucherEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🎫 Job Voucher Activated!')
                    .setDescription(perkDescription)
                    .addFields(
                        { name: `${villageEmoji} Current Village`, value: `**${currentVillage}**`, inline: true },
                        { name: '🏷️ Normal Job', value: `**${character.job || 'Unemployed'}**`, inline: true }
                    )
                    .setThumbnail(item.image || 'https://via.placeholder.com/150')
                    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
                    .setFooter({ text: '✨ Good luck in your new role! Make the most of this opportunity!' });
                
                    await interaction.editReply({ embeds: [voucherEmbed], ephemeral: true });
                    return;
                }
  
                     
            // ------------------- Debuff Check -------------------
            if (character.debuff?.active) {
                const debuffEndDate = new Date(character.debuff.endDate);
                const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
                await interaction.editReply({
                    content: `❌ **${character.name} is currently debuffed and cannot use items to heal. Please wait until the debuff expires.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
                    ephemeral: true,
                });
                return;
            }

            // ------------------- Inventory Sync Check -------------------
            if (!character.inventorySynced) {
                return interaction.editReply({
                    content: `❌ **Inventory not set up. Please initialize and sync the inventory before using items.**`,
                    ephemeral: true,
                });
            }

            // ------------------- KO Status Handling -------------------
            if (character.ko && item.itemName.toLowerCase() !== 'fairy') {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⚠️ Healing Failed ⚠️')
                    .setDescription(`**${item.itemName}** cannot be used to recover from KO. Please use a Fairy or request services from a Healer.`)
                    .setFooter({ text: 'Healing Error' });
                await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }

            // ------------------- Max Health Check -------------------
            if (character.currentHearts >= character.maxHearts && !item.staminaRecovered) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⚠️ Healing Failed ⚠️')
                    .setDescription(`${character.name} is already at maximum health.`)
                    .setFooter({ text: 'Healing Error' });
                await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }

            // ------------------- Restricted Items Check -------------------
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

            // ------------------- KO Healing Logic -------------------
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
  
            // ------------------- Apply Healing and Stamina Recovery -------------------
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

            // ------------------- Update Inventory -------------------
            const inventoryCollection = await getCharacterInventoryCollection(character.name);
            await removeItemInventoryDatabase(character._id, item.itemName, quantity, inventoryCollection);

            // ------------------- Log Healing to Google Sheets -------------------
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

            // ------------------- Build Healing Confirmation Embed -------------------
            let description = `**${character.name}** used **${item.itemName}** ${item.emoji || ''}`;
            if (healAmount > 0) {
                description += ` to heal **${healAmount}** hearts!`;
            }
            if (staminaRecovered > 0) {
                description += ` and recovered **${staminaRecovered}** stamina!`;
            }

            const confirmationEmbed = new EmbedBuilder()
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

            await interaction.editReply({ embeds: [confirmationEmbed] });

        } catch (error) {
    handleError(error, 'item.js');

            console.error(`[item.js:logs] Error during healing process: ${error.message}`);
            await interaction.editReply({ content: `❌ An error occurred during the healing process.`, ephemeral: true });
        }
    }
};
