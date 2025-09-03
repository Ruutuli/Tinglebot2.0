// ============================================================================
// ------------------- testQuestPosting.js -------------------
// Test script to manually load and post quests to test channel
// ============================================================================

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { authorizeSheets, writeSheetData } = require('../utils/googleSheetsUtils');
const Quest = require('../models/QuestModel');

// ------------------- Discord Bot Setup -------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const TEST_CHANNEL_ID = '1391812848099004578'; // Test channel ID
const QUEST_CHANNEL_ID = '1305486549252706335'; // Original quest channel (for reference)

// ------------------- Google Sheets API Setup -------------------
const SHEET_ID = '1M106nBghmgng9xigxkVpUXuKIF60QXXKiAERlG1a0Gs';

// Load service account credentials
let serviceAccount;
if (process.env.RAILWAY_ENVIRONMENT) {
    // Create service account object from environment variables
    serviceAccount = {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
        universe_domain: "googleapis.com"
    };
} else {
    // Local environment - read from file
    const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../config/service_account.json');
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        console.error('[ERROR]: Service account file not found at', SERVICE_ACCOUNT_PATH);
        process.exit(1);
    }
    serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
}

const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.JWT(
        serviceAccount.client_email,
        null,
        serviceAccount.private_key,
        ['https://www.googleapis.com/auth/spreadsheets.readonly']
    )
});

// ------------------- Function to Fetch Quest Data -------------------
async function fetchQuestData() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'loggedQuests!A2:U', // Updated range to include all columns (A-U = 21 columns)
        });
        return response.data.values || [];
    } catch (error) {
        handleError(error, 'testQuestPosting.js');
        console.error('[QUESTS]: Error fetching data from Google Sheets:', error);
        return [];
    }
}

// ------------------- Function to Format Quest as Embed -------------------
function formatQuestEmbed(quest) {
    const embed = new EmbedBuilder()
        .setTitle(`📜 ${quest.title}`)
        .setDescription(quest.description || 'No description provided.')
        .setColor(0xAA926A)
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

    // Dynamically add fields based on value
    if (quest.questType) embed.addFields({ name: '📖 Quest Type', value: quest.questType, inline: true });
    if (quest.location) embed.addFields({ name: '📍 Location', value: quest.location, inline: true });
    if (quest.timeLimit) embed.addFields({ name: '⏳ Time Limit', value: quest.timeLimit, inline: true });
    if (quest.minRequirements) embed.addFields({ name: '🔑 Minimum Requirements', value: quest.minRequirements.toString(), inline: true });
    if (quest.tokenReward) embed.addFields({ name: '💰 Token Reward', value: quest.tokenReward.toString(), inline: true });
    if (quest.itemReward) embed.addFields({ name: '🎁 Item Reward', value: `${quest.itemReward} x ${quest.itemRewardQty || 'N/A'}`, inline: true });
    if (quest.signupDeadline) embed.addFields({ name: '📅 Signup Deadline', value: quest.signupDeadline, inline: true });
    if (quest.participantCap) embed.addFields({ name: '👥 Participant Cap', value: quest.participantCap.toString(), inline: true });
    if (quest.postRequirement) embed.addFields({ name: '💬 Post Requirement', value: quest.postRequirement.toString(), inline: true });
    if (quest.date) embed.addFields({ name: '📅 Date', value: quest.date, inline: true });
    if (quest.questID) embed.addFields({ name: '🆔 Quest ID', value: quest.questID, inline: true });
    
    // Add special note for RP quests
    if (quest.specialNote) embed.addFields({ name: '📝 Special Notes', value: quest.specialNote, inline: false });

    // Add quest rules reminder
    let rulesText = '• Use `/quest join` to participate\n';
    if (quest.participantCap) {
        rulesText += `• **Member-capped quest** (max ${quest.participantCap} participants)\n`;
        rulesText += '• Only ONE member-capped quest per person\n';
    }
    if (quest.questType.toLowerCase() === 'rp') {
        rulesText += '• RP quests: 1-week signup window\n';
        rulesText += '• Use Quest Vouchers for guaranteed spots!\n';
    }
    
    embed.addFields({ name: '📋 Quest Rules', value: rulesText, inline: false });

    return embed;
}

// ------------------- Function to Post Test Quests -------------------
async function postTestQuests() {
    console.log('[TEST]: Starting test quest posting...');
    const testChannel = await client.channels.fetch(TEST_CHANNEL_ID);

    if (!testChannel) {
        console.error('[ERROR]: Test channel not found!');
        return;
    }

    console.log('[TEST]: Fetching quest data from Google Sheets...');
    const auth = await authorizeSheets();
    const questData = await fetchQuestData();

    if (!questData.length) {
        console.error('[INFO]: No quest data found in Google Sheets.');
        return;
    }

    console.log(`[TEST]: Retrieved ${questData.length} quests from the sheet.`);
    console.log('[TEST]: Processing quests for testing...');

    const guild = testChannel.guild;

    // Process all quests from the sheet
    const testQuests = questData;

    for (const [rowIndex, quest] of testQuests.entries()) {
        // Map your actual data structure: Title, Description, Quest Type, Status, Target Channel, Date, Signup Deadline, Participant Cap, Post Requirement, RP Thread Parent Channel, Token Reward, Item Reward, Item Reward Qty, Quest ID, Posted, Posted At, Bot Notes, Location, Time Limit, Min Requirements, Special Note
        const [
            title,
            description,
            questType,
            status,
            targetChannel,
            date,
            signupDeadline,
            participantCap,
            postRequirement,
            rpThreadParentChannel,
            tokenReward,
            itemReward,
            itemRewardQty,
            questID,
            posted,
            postedAt,
            botNotes,
            location,
            timeLimit,
            minRequirements,
            specialNote
        ] = quest;
    
        try {
            console.log(`[TEST]: Processing quest "${title}"...`);
            
            // ------------------- Sanitize and Prepare Quest Data -------------------
            const sanitizedQuest = {
                title: title || 'Untitled Quest',
                description: description || 'No description provided.',
                questType: questType || 'General',
                location: location || 'Quest Location',
                timeLimit: timeLimit || 'No time limit',
                minRequirements: minRequirements || 0,
                tokenReward: tokenReward === 'N/A' || !tokenReward ? 0 : parseInt(tokenReward, 10),
                itemReward: itemReward && itemReward !== 'N/A' ? itemReward : null,
                itemRewardQty: itemRewardQty === 'N/A' || !itemRewardQty ? 0 : parseInt(itemRewardQty, 10),
                signupDeadline: signupDeadline && signupDeadline !== 'N/A' ? signupDeadline : null,
                participantCap: participantCap === 'N/A' || !participantCap ? null : parseInt(participantCap, 10),
                postRequirement: postRequirement === 'N/A' || !postRequirement ? null : parseInt(postRequirement, 10),
                specialNote: specialNote || null,
                participants: new Map(),
                status: status && status.toLowerCase() === 'active' ? 'active' : 'completed',
                date: date || new Date().toISOString(),
                questID: questID && questID !== 'N/A' ? questID : `TEST_Q${Math.floor(Math.random() * 100000)}`,
                posted: false, // Don't mark as posted in test
                postedAt: new Date(),
                targetChannel: targetChannel || TEST_CHANNEL_ID,
                rpThreadParentChannel: rpThreadParentChannel || null,
                roleID: null,
            };

            // ------------------- RP Quest Special Handling -------------------
            if (sanitizedQuest.questType.toLowerCase() === 'rp') {
                if (!sanitizedQuest.postRequirement) {
                    sanitizedQuest.postRequirement = 15;
                }
                
                if (!sanitizedQuest.signupDeadline) {
                    const questDate = new Date(sanitizedQuest.date);
                    const rpDeadline = new Date(questDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                    sanitizedQuest.signupDeadline = rpDeadline.toISOString().split('T')[0];
                }

                // Use RP thread parent channel from sheet, or set based on location
                if (!sanitizedQuest.rpThreadParentChannel && sanitizedQuest.location) {
                    if (sanitizedQuest.location.includes('Rudania')) {
                        sanitizedQuest.rpThreadParentChannel = '1234567890'; // Replace with actual Rudania RP channel ID
                    } else if (sanitizedQuest.location.includes('Inariko')) {
                        sanitizedQuest.rpThreadParentChannel = '1234567891'; // Replace with actual Inariko RP channel ID
                    } else if (sanitizedQuest.location.includes('Vhintl')) {
                        sanitizedQuest.rpThreadParentChannel = '1234567892'; // Replace with actual Vhintl RP channel ID
                    }
                }

                sanitizedQuest.specialNote = 'RP Quest Rules: 15-20 posts minimum, 2 paragraph maximum per post, member-driven with @TaleWeaver support available.';
            }            
    
            console.log('[TEST]: Sanitized quest data:', sanitizedQuest);
    
            // ------------------- Check or Create Quest Role -------------------
            let role = guild.roles.cache.find(r => r.name === `TEST Quest: ${sanitizedQuest.title}`);
            if (!role) {
                console.log(`[TEST]: Creating test role for quest: "${sanitizedQuest.title}".`);
                role = await guild.roles.create({
                    name: `TEST Quest: ${sanitizedQuest.title}`,
                    color: 0xFF6B6B, // Different color for test roles
                    mentionable: true,
                    reason: `Test role for quest: "${sanitizedQuest.title}".`
                });
                console.log(`[TEST]: Test role created for quest: "${sanitizedQuest.title}" with ID: ${role.id}.`);
            } else {
                console.log(`[TEST]: Test role already exists for quest: "${sanitizedQuest.title}" with ID: ${role.id}.`);
            }
    
            // Save the role ID in sanitized quest data
            sanitizedQuest.roleID = role.id;

            // ------------------- Create RP Thread for RP Quests -------------------
            let rpThread = null;
            if (sanitizedQuest.questType.toLowerCase() === 'rp' && sanitizedQuest.rpThreadParentChannel) {
                try {
                    const parentChannel = guild.channels.cache.get(sanitizedQuest.rpThreadParentChannel);
                    if (parentChannel) {
                        rpThread = await parentChannel.threads.create({
                            name: `🧪 TEST - ${sanitizedQuest.title} - RP Thread`,
                            autoArchiveDuration: 1440, // 24 hours
                            reason: `Test RP thread for quest: ${sanitizedQuest.title}`
                        });
                        
                        // Send initial RP thread message
                        const rpThreadEmbed = new EmbedBuilder()
                            .setColor(0xFF6B6B)
                            .setTitle(`🧪 TEST - ${sanitizedQuest.title} - RP Thread`)
                            .setDescription(`**TEST MODE** - This is a test RP thread for the quest: **${sanitizedQuest.title}**\n\n**Requirements**: ${sanitizedQuest.postRequirement || 15}-20 posts minimum, 2 paragraph maximum per post.\n\n**Note**: This quest is member-driven. Use @TaleWeaver if you need help moving things along!`)
                            .addFields(
                                { name: 'Quest Type', value: 'RP (TEST)', inline: true },
                                { name: 'Post Requirement', value: `${sanitizedQuest.postRequirement || 15}-20 posts`, inline: true },
                                { name: 'Status', value: 'TEST MODE - Join with `/quest join`', inline: true }
                            )
                            .setTimestamp();

                        await rpThread.send({ embeds: [rpThreadEmbed] });
                        console.log(`[TEST]: Created test RP thread for quest "${sanitizedQuest.title}" with ID: ${rpThread.id}.`);
                    }
                } catch (error) {
                    console.error(`[TEST]: Failed to create test RP thread for quest "${sanitizedQuest.title}":`, error);
                    sanitizedQuest.botNotes = `Failed to create test RP thread: ${error.message}`;
                }
            }

            // ------------------- Create Quest Embed -------------------
            const questEmbed = formatQuestEmbed(sanitizedQuest);
            
            // Add test mode indicator
            questEmbed.setFooter({ text: '🧪 TEST MODE - This is a test quest posting' });
    
            // ------------------- Post Quest Embed to Test Channel -------------------
            console.log(`[TEST]: Posting test embed for quest "${sanitizedQuest.title}" to test channel.`);
            const message = await testChannel.send({ embeds: [questEmbed] });
    
            // Capture the message ID
            sanitizedQuest.messageID = message.id;
    
            // ------------------- Save Quest to Database (with TEST prefix) -------------------
            console.log(`[TEST]: Saving test quest "${sanitizedQuest.title}" to the database with message ID: ${message.id} and role ID: ${role.id}.`);
            const newQuest = new Quest(sanitizedQuest);
            await newQuest.save();
            console.log(`[TEST]: Test quest "${sanitizedQuest.title}" successfully saved to the database.`);
    
            // Add a small delay between quests
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            handleError(error, 'testQuestPosting.js');
            console.error(`[TEST]: Failed to process test quest "${title || 'Untitled Quest'}":`, error);
        }
    }
       
    console.log('[TEST]: Finished processing test quests.');
}

// ------------------- Discord Bot Event Listeners -------------------
client.once('ready', async () => {
    console.log(`[TEST BOT]: Logged in as ${client.user.tag}`);
    console.log(`[TEST BOT]: Test channel ID: ${TEST_CHANNEL_ID}`);
    console.log(`[TEST BOT]: Auto-posting quests from sheet...`);
    
    // Auto-post quests when bot starts
    try {
        await postTestQuests();
        console.log(`[TEST BOT]: Quest posting completed. Exiting...`);
        process.exit(0); // Exit after posting
    } catch (error) {
        handleError(error, 'testQuestPosting.js');
        console.error('[TEST BOT]: Failed to post quests:', error);
        process.exit(1);
    }
});

client.on('error', (error) => {
    console.error('[TEST BOT]: Discord client error:', error);
});

// ------------------- Login Bot -------------------
client.login(process.env.DISCORD_BOT_TOKEN);
