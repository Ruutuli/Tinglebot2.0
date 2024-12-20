const express = require('express');
const path = require('path');
const bucket = require('./config/gcsService');
const upload = require('./scripts/upload');
const { v4: uuidv4 } = require('uuid');
const { start, stop, client } = require('./index.js');
const { connectToTinglebot } = require('./database/connection'); // Import the Tinglebot connection function

const Character = require('./models/CharacterModel');
const Inventory = require('./models/InventoryModel');
const Item = require('./models/ItemModel');
const Monster = require('./models/MonsterModel');
const Settings = require('./models/SettingsModel');
const User = require('./models/UserModel');
const Vending = require('./models/VendingModel');

const app = express();
const port = 3000;

let hasLoggedStatus = false; // Track if the status has been logged

// ======================================
// SECTION: Static Files and HTML Serving
// ======================================

// Serve static files from the 'dashboard/public' directory
app.use(express.static(path.join(__dirname, 'dashboard', 'public')));

// Serve the index.html file at the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'public', 'index.html'));
});

// =============================
// SECTION: API Endpoints
// =============================

// API endpoint to handle file upload
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        const blob = bucket.file(uuidv4() + path.extname(req.file.originalname));
        const blobStream = blob.createWriteStream({
            resumable: false,
        });

        blobStream.on('finish', () => {
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            res.status(200).send(`File uploaded successfully. Access it at ${publicUrl}`);
        });

        blobStream.end(req.file.buffer);
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// API endpoint to start the bot
app.post('/api/start-bot', (req, res) => {
    try {
        console.log('Starting bot via API...');
        start(); // This should start the entire bot as defined in index.js
        res.status(200).send({ message: 'Bot started successfully' });
    } catch (error) {
        console.error('Error starting bot:', error);
        res.status(500).send({ error: error.message });
    }
});

// API endpoint to stop the bot
app.post('/api/stop-bot', (req, res) => {
    try {
        stop();
        res.status(200).send({ message: 'Bot stopped successfully' });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});


// API endpoint to retrieve data from MongoDB
app.get('/api/data', async (req, res) => {
    try {
        // Ensure we're connected to the Tinglebot database
        await connectToTinglebot();

        // Fetch data from each collection
        const characters = await Character.find().lean().exec();
        const inventories = await Inventory.find().lean().exec();
        const items = await Item.find().lean().exec();
        const monsters = await Monster.find().lean().exec();
        const settings = await Settings.find().lean().exec();
        const tokens = await Token.find().lean().exec();
        const users = await User.find().lean().exec();
        const vending = await Vending.find().lean().exec();

        // Respond with the data
        res.json({
            characters,
            inventories,
            items,
            monsters,
            settings,
            tokens,
            users,
            vending,
        });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// API endpoint to fetch character data
app.get('/api/characters', async (req, res) => {
    try {
        const characters = await Character.find(); // Fetch all characters from the database
        res.json(characters); // Send the data as JSON to the client
    } catch (error) {
        console.error('Error fetching characters:', error);
        res.status(500).send('Internal Server Error'); // Handle errors
    }
});

// =============================
// SECTION: Server Start
// =============================

app.listen(port, async () => {
    try {
        await connectToTinglebot();
        console.log(`Server is running on port ${port}`);
    } catch (error) {
        console.error('Failed to connect to the database:', error);
    }
});
