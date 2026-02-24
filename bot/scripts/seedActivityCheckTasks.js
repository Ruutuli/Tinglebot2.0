// ============================================================================
// Seed Quarterly Activity Check Task (Single task with checklist)
// Run once from bot directory: node scripts/seedActivityCheckTasks.js
// ============================================================================

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables - try root .env first, then bot/.env as fallback
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const botEnvPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
    console.log('Loaded env from root:', rootEnvPath);
} else if (fs.existsSync(botEnvPath)) {
    dotenv.config({ path: botEnvPath });
    console.log('Loaded env from bot:', botEnvPath);
} else {
    console.log('No .env file found, using system environment variables');
}

// Connect to MongoDB
async function connectToTinglebot() {
    const uri = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_TINGLEBOT_URI or MONGODB_URI not set in environment');
    }
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
    }
}

const ModTask = require('../models/ModTaskModel');

const ACTIVITY_CHECK_TITLE = 'Quarterly Activity Check (2026)';
const ACTIVITY_CHECK_DESCRIPTION = `Every 3 months, conduct a community-wide activity check to identify inactive members.

**For each quarter:**
1. Send out reminders to everyone ahead of time
2. Review activity logs and participation
3. Remove members who do not meet the minimum activity threshold`;

const ACTIVITY_CHECK_CHECKLIST = [
    { text: 'Q1 - March 2026 (Due: March 1)', checked: false },
    { text: 'Q2 - June 2026 (Due: June 1)', checked: false },
    { text: 'Q3 - September 2026 (Due: September 1)', checked: false },
    { text: 'Q4 - December 2026 (Due: December 1)', checked: false }
];

const CREATOR = {
    discordId: 'system',
    username: 'System'
};

async function seedActivityCheckTask() {
    try {
        console.log('Connecting to database...');
        await connectToTinglebot();
        
        // First, delete any existing quarterly activity check tasks
        console.log('Removing old individual quarterly tasks...');
        const deleteResult = await ModTask.deleteMany({
            title: { $regex: /Quarterly Activity Check/i }
        });
        console.log(`Deleted ${deleteResult.deletedCount} existing task(s)`);
        
        // Get next order in repeating column
        const order = await ModTask.getNextOrderInColumn('repeating');
        
        // Create single consolidated task
        console.log('Creating consolidated quarterly activity check task...');
        
        const task = new ModTask({
            title: ACTIVITY_CHECK_TITLE,
            description: ACTIVITY_CHECK_DESCRIPTION,
            column: 'repeating',
            priority: 'high',
            dueDate: new Date('2026-03-01T00:00:00Z'), // Q1 due date - March 1
            assignees: [],
            createdBy: CREATOR,
            isRepeating: true,
            repeatConfig: {
                frequency: 'quarterly',
                lastCompleted: null,
                nextDue: new Date('2026-03-01T00:00:00Z')
            },
            order: order,
            checklist: ACTIVITY_CHECK_CHECKLIST,
            comments: []
        });
        
        await task.save();
        console.log('Created consolidated quarterly activity check task!');
        
        console.log('\nDone!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding tasks:', error);
        process.exit(1);
    }
}

seedActivityCheckTask();
