// scripts/questAnnouncements.js

require('dotenv').config();
const { google } = require('googleapis');
const { createQuest } = require('../database/questService');
const { authorizeSheets, fetchSheetData } = require('../utils/googleSheetsUtils');
const Quest = require('../models/QuestModel');

// Spreadsheet details
const SPREADSHEET_ID = process.env.QUEST_SPREADSHEET_ID;
const SHEET_NAME = 'questList';

async function fetchQuestsFromSheet(client) {
  try {
    const auth = await authorizeSheets();
    const range = `${SHEET_NAME}!A2:Q`; // Assumes headers are in the first row
    const rows = await fetchSheetData(auth, SPREADSHEET_ID, range);

    if (!rows || rows.length === 0) {
      console.log('No data found in the spreadsheet.');
      return;
    }

    // Process each row as a quest
    for (const row of rows) {
      const [month, year, title, description, questType, location, timeLimit, minRequirement, rewards, rewardCap, signupDeadline, participantCap, postRequirement, specialNote, roles, participants, status, image] = row;

      const questData = {
        title,
        description,
        questType,
        location,
        timeLimit,
        minRequirements: parseInt(minRequirement, 10) || 0,
        rewards: parseInt(rewards, 10) || 0,
        rewardsCap: parseInt(rewardCap, 10) || null,
        signupDeadline: signupDeadline || null,
        participantCap: parseInt(participantCap, 10) || null,
        postRequirement: parseInt(postRequirement, 10) || null,
        specialNote: specialNote || null,
        roles: roles ? roles.split(',') : [],
        participants: participants ? participants.split(',') : [],
        status: status || 'open',
        image: image || null,
      };

      // Check if a quest for this month and year already exists
      const existingQuest = await Quest.findOne({ title, year: parseInt(year, 10), month: parseInt(month, 10) });
      if (!existingQuest) {
        const quest = await createQuest(questData); // Create a new quest in the database
        await announceQuest(client, quest, 'your-channel-id'); // Replace 'your-channel-id' with the actual channel ID
        console.log(`✅ Announced quest: ${title}`);
      } else {
        console.log(`Quest "${title}" already exists for ${month}/${year}. Skipping.`);
      }
    }
  } catch (error) {
    console.error('Error fetching or announcing quests:', error);
  }
}

module.exports = { fetchQuestsFromSheet };
