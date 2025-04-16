// ------------------- Import Necessary Libraries -------------------
const { Client, GatewayIntentBits } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const { google } = require('googleapis');
const schedule = require('node-schedule');
require('dotenv').config();

// ------------------- Discord Bot Setup -------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const QUEST_CHANNEL_ID = '1305486549252706335';

// ------------------- Google Sheets API Setup -------------------
const SHEET_ID = '1M106nBghmgng9xigxkVpUXuKIF60QXXKiAERlG1a0Gs';
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);

const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.JWT(
        GOOGLE_CREDENTIALS.client_email,
        null,
        GOOGLE_CREDENTIALS.private_key,
        ['https://www.googleapis.com/auth/spreadsheets.readonly']
    )
});

// ------------------- Function to Fetch Quest Data -------------------
async function fetchQuestData() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'loggedQuests!A2:Q', // Adjust range as per sheet layout
        });
        return response.data.values || [];
    } catch (error) {
    handleError(error, 'fetchCommands.js');

        console.error('[QUESTS]: Error fetching data from Google Sheets:', error);
        return [];
    }
}

// ------------------- Function to Format Quest Message -------------------
function formatQuestMessage(quest) {
    const [
        title,
        description,
        questType,
        location,
        timeLimit,
        minRequirements,
        rewards,
        rewardsCap,
        signupDeadline,
        participantCap,
        postRequirement,
        specialNote,
        roles,
        participants,
        status,
        image,
        date
    ] = quest;

    return `📜 **Quest Title:** ${title}

📝 **Description:** ${description}
📍 **Location:** ${location}
⏳ **Time Limit:** ${timeLimit}
🔑 **Minimum Requirements:** ${minRequirements}
🎁 **Rewards:** ${rewards} (Cap: ${rewardsCap})
📅 **Signup Deadline:** ${signupDeadline}
👥 **Participant Cap:** ${participantCap}
💬 **Post Requirement:** ${postRequirement}
✨ **Special Note:** ${specialNote || 'None'}
🎭 **Roles:** ${roles || 'None'}
📌 **Date:** ${date}

${
        image ? `🌄 **Image:** [Link](${image})` : ''
    }`;
}

// ------------------- Function to Post Quests to Discord -------------------
async function postQuests() {
    const questChannel = await client.channels.fetch(QUEST_CHANNEL_ID);

    if (!questChannel) {
        console.error('[QUESTS]: Channel not found!');
        return;
    }

    const questData = await fetchQuestData();

    if (!questData.length) {
        console.error('[QUESTS]: No quest data found.');
        return;
    }

    for (const quest of questData) {
        const questMessage = formatQuestMessage(quest);

        try {
            await questChannel.send(questMessage);
        } catch (error) {
    handleError(error, 'fetchCommands.js');

            console.error(`[QUESTS]: Error posting quest: ${quest[0]}`, error);
        }
    }
}

// ------------------- Schedule Quest Posting -------------------
schedule.scheduleJob('0 9 1 */2 *', async () => { // Runs at 9:00 AM on the 1st day of every other month
    console.log('[QUESTS]: Scheduled task running to post quests.');
    await postQuests();
});

// ------------------- Discord Bot Test Command -------------------
client.on('messageCreate', async (message) => {
    if (message.content === '!testQuests' && message.channelId === QUEST_CHANNEL_ID) {
        console.log('[TEST]: Triggering quest posting manually.');
        await postQuests();
        message.reply('✅ Quests have been posted for testing!');
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
