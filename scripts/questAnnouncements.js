// ------------------- Import Necessary Libraries -------------------
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { authorizeSheets, writeSheetData }= require('../utils/googleSheetsUtils'); 
const Quest = require('../models/QuestModel');

// ------------------- Discord Bot Setup -------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const QUEST_CHANNEL_ID = '1305486549252706335';

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
            range: 'loggedQuests!A2:S', // Updated range to include all columns
        });
        return response.data.values || [];
    } catch (error) {
        handleError(error, 'questAnnouncements.js');
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
    if (quest.participants.length > 0) embed.addFields({ name: '👥 Participants', value: quest.participants.join(', '), inline: true });

    return embed;
}

// ------------------- Function to Post Quests to Discord -------------------
async function postQuests() {
    console.log('[DEBUG]: Starting postQuests function...');
    const questChannel = await client.channels.fetch(QUEST_CHANNEL_ID);

    if (!questChannel) {
        console.error('[ERROR]: Quest channel not found!');
        return;
    }

    console.log('[DEBUG]: Fetching quest data from Google Sheets...');
    const auth = await authorizeSheets(); // Get authenticated client
    const questData = await fetchQuestData();

    if (!questData.length) {
        console.error('[INFO]: No quest data found in Google Sheets.');
        return;
    }

    console.log(`[DEBUG]: Retrieved ${questData.length} quests from the sheet.`);
    console.log('[DEBUG]: Checking for quests marked as "Posted"...');

    // Filter quests not marked as "Posted"
    const unpostedQuests = questData.filter((quest, index) => {
        const [title, , , , , , , , , , , , , , , questID, , posted, postedAt] = quest;

        // Log the raw value of "Posted" for debugging
        console.log(`[DEBUG]: Raw "Posted" value for quest "${title}" at row ${index + 2}: "${posted}"`);

        const sanitizedPosted = posted ? posted.trim().toLowerCase() : '';
        if (sanitizedPosted === 'posted' && questID && questID !== 'N/A') {
            console.log(`[INFO]: Skipping quest "${title}" - Already posted with ID ${questID}.`);
            return false; // Exclude already posted quests
        }

        console.log(`[DEBUG]: Quest "${title}" at row ${index + 2} is NOT marked as "Posted".`);
        return true; // Include quests that haven't been posted
    });

    if (!unpostedQuests.length) {
        console.log('[INFO]: No new quests to post. All quests are already marked as "Posted".');
        return;
    }

    console.log(`[DEBUG]: Found ${unpostedQuests.length} quests to post.`);
    const guild = questChannel.guild;

    for (const [rowIndex, quest] of unpostedQuests.entries()) {
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
            botNotes
        ] = quest;
    
        try {
            // ------------------- Sanitize and Prepare Quest Data -------------------
            const sanitizedQuest = {
                title: title || 'Untitled Quest',
                description: description || 'No description provided.',
                questType: questType || 'General',
                location: 'Quest Location', // Default location
                timeLimit: 'No time limit', // Default time limit
                minRequirements: 0, // Default requirements
                tokenReward: tokenReward === 'N/A' || !tokenReward ? 0 : parseInt(tokenReward, 10),
                itemReward: itemReward && itemReward !== 'N/A' ? itemReward : null,
                itemRewardQty: itemRewardQty === 'N/A' || !itemRewardQty ? 0 : parseInt(itemRewardQty, 10),
                signupDeadline: signupDeadline && signupDeadline !== 'N/A' ? signupDeadline : null,
                participantCap: participantCap === 'N/A' || !participantCap ? null : parseInt(participantCap, 10),
                postRequirement: postRequirement === 'N/A' || !postRequirement ? null : parseInt(postRequirement, 10),
                specialNote: null, // Will be set below for RP quests
                participants: new Map(), // Initialize as an empty Map
                status: status && status.toLowerCase() === 'active' ? 'active' : 'completed',
                date: date || new Date().toISOString(),
                questID: questID && questID !== 'N/A' ? questID : `Q${Math.floor(Math.random() * 100000)}`,
                posted: true,
                postedAt: new Date(),
                targetChannel: targetChannel || null,
                rpThreadParentChannel: rpThreadParentChannel || null,
                roleID: null, // Will be set below
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

                sanitizedQuest.specialNote = 'RP Quest Rules: 15-20 posts minimum, 2 paragraph maximum per post, member-driven with @TaleWeaver support available.';
            }            
    
            console.log('[DEBUG]: Sanitized quest data:', sanitizedQuest);
    
            // ------------------- Check or Create Quest Role -------------------
            let role = guild.roles.cache.find(r => r.name === `Quest: ${sanitizedQuest.title}`);
            if (!role) {
                console.log(`[DEBUG]: Creating role for quest: "${sanitizedQuest.title}".`);
                role = await guild.roles.create({
                    name: `Quest: ${sanitizedQuest.title}`,
                    color: 0xAA926A,
                    mentionable: true,
                    reason: `Automatically created for the quest: "${sanitizedQuest.title}".`
                });
                console.log(`[INFO]: Role created for quest: "${sanitizedQuest.title}" with ID: ${role.id}.`);
            } else {
                console.log(`[INFO]: Role already exists for quest: "${sanitizedQuest.title}" with ID: ${role.id}.`);
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
                            name: `📜 ${sanitizedQuest.title} - RP Thread`,
                            autoArchiveDuration: 1440, // 24 hours
                            reason: `Auto-created RP thread for quest: ${sanitizedQuest.title}`
                        });
                        
                        // Send initial RP thread message
                        const rpThreadEmbed = new EmbedBuilder()
                            .setColor(0xAA926A)
                            .setTitle(`📜 ${sanitizedQuest.title} - RP Thread`)
                            .setDescription(`This is the RP thread for the quest: **${sanitizedQuest.title}**\n\n**Requirements**: ${sanitizedQuest.postRequirement || 15}-20 posts minimum, 2 paragraph maximum per post.\n\n**Note**: This quest is member-driven. Use @TaleWeaver if you need help moving things along!`)
                            .addFields(
                                { name: 'Quest Type', value: 'RP', inline: true },
                                { name: 'Post Requirement', value: `${sanitizedQuest.postRequirement || 15}-20 posts`, inline: true },
                                { name: 'Status', value: 'Active - Join with `/quest join`', inline: true }
                            )
                            .setTimestamp();

                        await rpThread.send({ embeds: [rpThreadEmbed] });
                        console.log(`[INFO]: Created RP thread for quest "${sanitizedQuest.title}" with ID: ${rpThread.id}.`);
                    }
                } catch (error) {
                    console.error(`[ERROR]: Failed to create RP thread for quest "${sanitizedQuest.title}":`, error);
                    sanitizedQuest.botNotes = `Failed to create RP thread: ${error.message}`;
                }
            }

            // ------------------- Create Quest Embed -------------------
            const questEmbed = formatQuestEmbed(sanitizedQuest);
    
            // ------------------- Post Quest Embed to Discord -------------------
            console.log(`[DEBUG]: Posting embed for quest "${sanitizedQuest.title}" to Discord.`);
            const message = await questChannel.send({ embeds: [questEmbed] });
    
            // Capture the message ID
            sanitizedQuest.messageID = message.id;
    
            // ------------------- Save Quest to Database -------------------
            console.log(`[DEBUG]: Saving quest "${sanitizedQuest.title}" to the database with message ID: ${message.id} and role ID: ${role.id}.`);
            const newQuest = new Quest(sanitizedQuest);
            await newQuest.save();
            console.log(`[INFO]: Quest "${sanitizedQuest.title}" successfully saved to the database.`);
    
            // ------------------- Mark Quest as Posted -------------------
            console.log(`[DEBUG]: Marking quest "${sanitizedQuest.title}" as posted in Google Sheets.`);
            await markQuestAsPosted(auth, rowIndex, sanitizedQuest.questID);
        } catch (error) {
    handleError(error, 'questAnnouncements.js');

            console.error(`[ERROR]: Failed to process quest "${title || 'Untitled Quest'}":`, error);
        }
    }
       
    console.log('[INFO]: Finished processing quests.');
}

// ------------------- Function to Mark Quest as Posted -------------------
async function markQuestAsPosted(auth, rowIndex, questID) {
    try {
        console.log(`[DEBUG]: Marking quest as posted in Google Sheets (Row: ${rowIndex + 2}, Quest ID: ${questID}).`);
        const now = new Date().toISOString();
        await writeSheetData(auth, SHEET_ID, `loggedQuests!Q${rowIndex + 2}:S${rowIndex + 2}`, [[questID, 'Posted', now]]);
        console.log(`[INFO]: Quest successfully marked as posted in Google Sheets (Row: ${rowIndex + 2}).`);
    } catch (error) {
    handleError(error, 'questAnnouncements.js');

        console.error(`[ERROR]: Failed to mark quest as posted in Google Sheets (Row: ${rowIndex + 2}):`, error);
    }
}

// ------------------- Discord Bot Test Command -------------------
client.on('messageCreate', async (message) => {
    if (message.content.trim() === '!testQuests') {
        console.log('[TEST]: Triggering quest posting manually.');
        try {
            await postQuests();
            await message.reply('✅ Quests have been posted for testing!');
        } catch (error) {
    handleError(error, 'questAnnouncements.js');

            console.error('[ERROR]: Failed to execute postQuests:', error);
            await message.reply('❌ An error occurred while posting quests.');
        }
    }
});

// ------------------- Discord Bot Event Listeners -------------------
client.once('ready', () => {
    console.log(`[BOT]: Logged in as ${client.user.tag}`);
});

client.on('error', (error) => {
    console.error('[BOT]: Discord client error:', error);
});

// ------------------- Login Bot -------------------
client.login(process.env.DISCORD_BOT_TOKEN);
