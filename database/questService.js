const Quest = require('../models/QuestModel');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');

async function createQuest(questData) {
  const quest = new Quest(questData);
  await quest.save();
  return quest;
}

async function joinQuest(userId, questId) {
  const quest = await Quest.findById(questId);
  if (!quest || quest.status !== 'open') throw new Error('Quest is not available.');
  quest.participants.push(userId);
  await quest.save();
}

async function completeQuest(userId, questId) {
  const quest = await Quest.findById(questId);
  if (!quest) throw new Error('Quest not found.');

  const auth = await authorizeSheets();
  await appendSheetData(auth, quest.spreadsheetId, 'Quests!A1', [[userId, questId, quest.rewards]]);
  return quest.rewards;
}

module.exports = { createQuest, joinQuest, completeQuest };
