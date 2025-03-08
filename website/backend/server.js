require('dotenv').config({ path: 'C:/Users/Ruu/Desktop/Tinglebot 2.0/.env' });

// ------------------- Import Dependencies -------------------
const express = require('express'); // Web framework for Node.js
const cors = require('cors'); // Enable Cross-Origin Resource Sharing
const fs = require('fs'); // File system module for reading files
const path = require('path'); // Path module for handling file paths
const { Client, GatewayIntentBits } = require('discord.js'); // Discord.js library

// ------------------- Initialize Express App -------------------
const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());

// ------------------- Initialize Discord Client -------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

client.login(process.env.DISCORD_TOKEN);

// ------------------- Function: Fetch Last Messages -------------------
/**
 * Fetches the last message date for each user in the guild.
 * @param {Object} guild - The Discord guild (server) object.
 * @returns {Object} - A mapping of user IDs to their latest message timestamp.
 */
async function getLastMessages(guild) {
    let lastMessages = {};

    try {
        const channels = guild.channels.cache.filter(channel => channel.isTextBased());
        
        console.log(`[DISCORD]: Fetching messages from ${channels.size} channels...`);

        const fetchMessagesPromises = channels.map(async (channel) => {
            try {
                if (!channel.viewable) return; // Skip channels without permission
                const messages = await channel.messages.fetch({ limit: 50 });
                messages.forEach(msg => {
                    const userId = msg.author.id;
                    const messageDate = msg.createdAt;
                    if (!lastMessages[userId] || lastMessages[userId] < messageDate) {
                        lastMessages[userId] = messageDate;
                    }
                });
            } catch (error) {
                console.error(`[DISCORD]: Error fetching messages from ${channel.name}:`, error);
            }
        });

        await Promise.all(fetchMessagesPromises);
    } catch (error) {
        console.error("[DISCORD]: Error fetching messages:", error);
    }

    return lastMessages;
}

// ------------------- API Route: Fetch Discord Members -------------------
app.get("/api/discord-members", async (req, res) => {
    try {
        const guildId = "603960955839447050";
        const guild = client.guilds.cache.get(guildId);

        if (!guild) {
            return res.status(404).json({ error: "❌ Guild not found" });
        }

        const [members, lastMessages] = await Promise.all([
            guild.members.fetch(),
            getLastMessages(guild)
        ]);

        const roleColors = {};
        guild.roles.cache.forEach(role => {
            roleColors[role.name] = `#${role.color.toString(16).padStart(6, "0")}`;
        });

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const membersData = members.map(member => {
            const lastMessageDate = lastMessages[member.id] ? new Date(lastMessages[member.id]) : null;
            const isInactive = lastMessageDate ? lastMessageDate < threeMonthsAgo : true;

            return {
                username: member.user.username,
                avatar: member.user.displayAvatarURL(),
                status: member.presence ? member.presence.status : "offline",
                roles: member.roles.cache.map(role => ({
                    name: role.name,
                    color: roleColors[role.name] || "#ffffff"
                })),
                lastMessage: lastMessageDate ? lastMessageDate.toISOString() : "No messages",
                inactive: isInactive
            };
        });

        res.json({ members: membersData });
    } catch (error) {
        console.error("[DISCORD]: Error fetching Discord members:", error);
        res.status(500).json({ error: "❌ Internal Server Error" });
    }
});

// ------------------- API Route: List JSON Files -------------------
const dataFolder = 'C:/Users/Ruu/Desktop/Tinglebot 2.0/data';

app.get('/api/json-files', (req, res) => {
    fs.readdir(dataFolder, (err, files) => {
        if (err) {
            console.error("[SERVER]: Error reading data folder:", err);
            return res.status(500).json({ error: "❌ Unable to scan directory" });
        }
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        res.json(jsonFiles);
    });
});

// ------------------- API Route: Fetch JSON File Content -------------------
app.get('/api/json-files/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(dataFolder, filename);

    if (!filename.endsWith('.json')) {
        return res.status(400).json({ error: "❌ Invalid file type" });
    }

    // Ensure the file exists before attempting to read
    if (!fs.existsSync(filePath)) {
        console.error(`[SERVER]: File not found: ${filename}`);
        return res.status(404).json({ error: `❌ File not found: ${filename}` });
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(`[SERVER]: Error reading file ${filename}:`, err);
            return res.status(500).json({ 
                error: `❌ Unable to read file: ${filename}`, 
                details: err.message 
            });
        }
    
        try {
            const jsonData = JSON.parse(data);
            res.json(jsonData);
        } catch (parseError) {
            console.error(`[SERVER]: Invalid JSON format in ${filename}:`, parseError);
            res.status(500).json({ 
                error: `❌ Invalid JSON format in ${filename}`, 
                details: parseError.message 
            });
        }
    });
});

    

app.use(express.json());

// API to update an entry
app.put("/api/json-files/:fileName/:itemId", (req, res) => {
    let filePath = path.join(__dirname, "data", req.params.fileName);
    let itemId = req.params.itemId;

    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read file." });

        let jsonData = JSON.parse(data);
        if (!jsonData[itemId]) return res.status(404).json({ error: "Entry not found." });

        jsonData[itemId] = req.body;

        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (err) => {
            if (err) return res.status(500).json({ error: "Failed to update entry." });
            res.json({ success: true });
        });
    });
});

// API to delete an entry
app.delete("/api/json-files/:fileName/:itemId", (req, res) => {
    let fileName = req.params.fileName;
    let itemId = req.params.itemId;

    if (!fileName || !itemId) {
        return res.status(400).json({ error: "Invalid request. Missing file name or item ID." });
    }

    let filePath = path.join(dataFolder, fileName);

    // Ensure the file exists before attempting to read
    if (!fs.existsSync(filePath)) {
        console.error(`[SERVER]: File not found: ${fileName}`);
        return res.status(404).json({ error: `❌ File not found: ${fileName}` });
    }

    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
            console.error(`[SERVER]: Error reading file ${fileName}:`, err);
            return res.status(500).json({ error: "❌ Failed to read file." });
        }

        let jsonData;
        try {
            jsonData = JSON.parse(data);
        } catch (parseError) {
            console.error(`[SERVER]: Invalid JSON format in ${fileName}:`, parseError);
            return res.status(500).json({ error: "❌ Invalid JSON format." });
        }

        if (!jsonData[itemId]) {
            return res.status(404).json({ error: "Entry not found." });
        }

        delete jsonData[itemId];

        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (err) => {
            if (err) {
                console.error(`[SERVER]: Error writing file ${fileName}:`, err);
                return res.status(500).json({ error: "❌ Failed to delete entry." });
            }
            res.json({ success: true });
        });
    });
});



// ------------------- Start Express Server -------------------
app.listen(PORT, () => console.log(`[SERVER]: 🚀 Server running on port ${PORT}`));