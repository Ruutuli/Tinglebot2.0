// ============================================================================
// Seed Mod Duties as Repeating Tasks
// Run once from bot directory: node scripts/seedModDuties.js
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

// Mod Discord IDs for assignees
const MODS = {
    Ruu: { discordId: '211219306137124865', username: 'Ruu', avatar: null },
    Toki: { discordId: '126088204016156672', username: 'Toki', avatar: null },
    Bo: { discordId: '125636093897998336', username: 'Bo', avatar: null },
    Mata: { discordId: '271107732289880064', username: 'Mata', avatar: null },
    Fern: { discordId: '635948726686580747', username: 'Fern', avatar: null },
    Reaver: { discordId: '308795936530759680', username: 'Reaver', avatar: null }
};

const CREATOR = {
    discordId: 'system',
    username: 'System'
};

// Map frequency strings to schema values
const FREQUENCY_MAP = {
    'Daily': 'daily',
    'Daily/As Submitted': 'daily',
    'Weekly': 'weekly',
    'Monthly': 'monthly',
    'Monthly/As Submitted': 'monthly',
    'Bimonthly': 'monthly', // Every 2 months, use monthly as closest
    'Trimonthly': 'quarterly', // Every 3 months
    'As Needed': null // Not repeating on schedule
};

// All mod duties from the spreadsheet
const MOD_DUTIES = [
    {
        title: 'Accepting Applications',
        description: `Review applications submitted to the Admin Discord account. Post them in the Application Discussion thread for mod review. Confirm accuracy and lore compliance, then notify the applicant if they're approved to submit or if edits are required.

**Requirements:**
- 5/7 ✔️ votes needed for approval`,
        frequency: 'Daily/As Submitted',
        responsible: 'Mata',
        backup: 'Toki',
        priority: 'high'
    },
    {
        title: 'Accepting Intros',
        description: `Monitor new member introductions. Ensure correct formatting, confirm age (18+), and check that intros are updated when Travelers become full members.`,
        frequency: 'Monthly/As Submitted',
        responsible: 'Ruu',
        backup: 'Mata',
        priority: 'medium'
    },
    {
        title: 'Accepting Reservations',
        description: `Review reservations in the Roster channel. Approve with a ✔️ once confirmed. Ensure jobs, villages, and races are valid, and that locked races aren't submitted.`,
        frequency: 'As Needed',
        responsible: 'Mata',
        backup: 'Reaver',
        priority: 'medium'
    },
    {
        title: 'Activity Check',
        description: `Review the member list for inactivity (3+ months). Use discretion if activity is minimal but recent. Draft and send messages to inactive members before marking them inactive.`,
        frequency: 'Trimonthly',
        responsible: 'Bo',
        backup: 'Ruu',
        priority: 'high'
    },
    {
        title: 'Admin Discord',
        description: `Monitor the Admin Discord account for incoming messages, issues, or applications. Post relevant items in the appropriate mod channels.`,
        frequency: 'Daily',
        responsible: 'Fern',
        backup: 'Bo',
        priority: 'high'
    },
    {
        title: 'Bot Management',
        description: `Handle bot issues, push updates, monitor logs, and oversee new mechanics/features.`,
        frequency: 'As Needed',
        responsible: 'Ruu',
        backup: 'Ruu',
        priority: 'medium'
    },
    {
        title: 'Discord Management',
        description: `Maintain Discord server organization. Update channels, check pins, and revise descriptions as needed.`,
        frequency: 'Monthly',
        responsible: 'Toki',
        backup: 'Ruu',
        priority: 'medium'
    },
    {
        title: 'FAQs Management',
        description: `Track and answer member questions. Mark questions with ⏳ if pending discussion and ✔️ when resolved. Add important FAQs to the website once approved.`,
        frequency: 'Daily',
        responsible: 'Toki',
        backup: 'Mata',
        priority: 'medium'
    },
    {
        title: 'Graphics Creation',
        description: `Design graphics for quests, events, NPCs, items, and promotional materials.`,
        frequency: 'As Needed',
        responsible: 'Bo',
        backup: 'Toki',
        priority: 'low'
    },
    {
        title: 'Lore Management',
        description: `Track and archive important lore events, quests, and decisions for server continuity.`,
        frequency: 'Monthly',
        responsible: 'Reaver',
        backup: 'Ruu',
        priority: 'medium'
    },
    {
        title: 'Mechanic Management & Balancing',
        description: `Oversee all server mechanics to ensure they function correctly and stay balanced. Includes monitoring looting, gathering, raids, and weather systems. Adjust drop rates and item/monster balance as needed, and track recurring issues (e.g., incorrect weather postings) for fixes.`,
        frequency: 'Monthly',
        responsible: 'Toki',
        backup: 'Reaver',
        priority: 'high'
    },
    {
        title: 'Member Lore',
        description: `Check the Member Submitted Lore form. Post suggestions to the Member Lore thread for discussion. Update the website once approved.

**Requirements:**
- 5/7 ✔️ votes required for approval`,
        frequency: 'Monthly',
        responsible: 'Bo',
        backup: 'Reaver',
        priority: 'medium'
    },
    {
        title: 'Member Quests Review',
        description: `Check the Member Submitted Quests/Events form. Post in the Member Quests/Events thread for review. Notify members of approval/denial.

**Requirements:**
- 4/6 ✔️ votes required`,
        frequency: 'Monthly',
        responsible: 'Ruu',
        backup: 'Fern',
        priority: 'medium'
    },
    {
        title: 'Mod Meeting Minutes',
        description: `Take notes during mod meetings and post summaries afterward.`,
        frequency: 'Monthly',
        responsible: 'Mata',
        backup: 'Bo',
        priority: 'medium'
    },
    {
        title: 'Monthly Updates',
        description: `Draft monthly announcements. Include vending, quests, and other relevant updates for members.`,
        frequency: 'Monthly',
        responsible: 'Bo',
        backup: 'Fern',
        priority: 'high'
    },
    {
        title: 'New Member Management',
        description: `Monitor new members after joining. Ensure they post their intro and submit a character within 2 weeks.`,
        frequency: 'As Needed',
        responsible: 'Fern',
        backup: 'Toki',
        priority: 'medium'
    },
    {
        title: 'NPC Management',
        description: `Manage NPCs across the server, including Help Wanted Quest NPCs, Mod NPCs, and event/quest NPCs. Ensure personalities and storylines remain consistent, update claims/records, and archive major NPC developments for continuity.`,
        frequency: 'As Needed',
        responsible: 'Fern',
        backup: 'Reaver',
        priority: 'medium'
    },
    {
        title: 'Quests',
        description: `Create and post bi-monthly quests.`,
        frequency: 'Bimonthly',
        responsible: 'Reaver',
        backup: 'Mata',
        priority: 'high'
    },
    {
        title: 'Suggestion Box',
        description: `Monitor the Discord Suggestion Box channel. Ensure all suggestions are acknowledged and answered.`,
        frequency: 'Monthly',
        responsible: 'Fern',
        backup: 'Mata',
        priority: 'low'
    },
    {
        title: 'Trello Management',
        description: `Keep Trello updated with tasks, deadlines, and progress. Ensure mods remain on schedule.`,
        frequency: 'Weekly',
        responsible: 'Toki',
        backup: 'Bo',
        priority: 'medium'
    },
    {
        title: 'Website Management',
        description: `Update and maintain the Roots of the Wild website.`,
        frequency: 'As Needed',
        responsible: 'Reaver',
        backup: 'Fern',
        priority: 'medium'
    }
];

async function seedModDuties() {
    try {
        console.log('Connecting to database...');
        await connectToTinglebot();
        
        // Get starting order in repeating column
        let order = await ModTask.getNextOrderInColumn('repeating');
        
        console.log(`\nCreating ${MOD_DUTIES.length} mod duty tasks...\n`);
        
        for (const duty of MOD_DUTIES) {
            // Check if task already exists
            const existing = await ModTask.findOne({ title: duty.title, column: 'repeating' });
            if (existing) {
                console.log(`⏭️  Skipping "${duty.title}" (already exists)`);
                continue;
            }
            
            // Build assignees array
            const assignees = [];
            if (duty.responsible && MODS[duty.responsible]) {
                assignees.push(MODS[duty.responsible]);
            }
            if (duty.backup && MODS[duty.backup] && duty.backup !== duty.responsible) {
                assignees.push(MODS[duty.backup]);
            }
            
            // Determine frequency
            const frequency = FREQUENCY_MAP[duty.frequency];
            const isRepeating = frequency !== null;
            
            const task = new ModTask({
                title: duty.title,
                description: duty.description,
                column: 'repeating',
                priority: duty.priority,
                dueDate: null,
                assignees: assignees,
                createdBy: CREATOR,
                isRepeating: isRepeating,
                repeatConfig: isRepeating ? {
                    frequency: frequency,
                    lastCompleted: null,
                    nextDue: null
                } : null,
                order: order++,
                checklist: [],
                comments: []
            });
            
            await task.save();
            console.log(`✅ Created "${duty.title}" (${duty.frequency}) - Assigned: ${duty.responsible}${duty.backup !== duty.responsible ? `, Backup: ${duty.backup}` : ''}`);
        }
        
        console.log('\n✅ Done! All mod duties have been added to the repeating column.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding mod duties:', error);
        process.exit(1);
    }
}

seedModDuties();
