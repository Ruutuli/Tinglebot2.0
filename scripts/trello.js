// ------------------- Standard Libraries -------------------
const axios = require('axios');
const path = require('path');

// ------------------- Utilities -------------------
const { handleError } = require('../utils/globalErrorHandler');

// ------------------- Environment Variables -------------------
const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID;
const TRELLO_LOG = process.env.TRELLO_LOG || '67fe7cc498f7d8f31520c1af';
const TRELLO_BOARD_ID = process.env.TRELLO_BOARD_ID;

// ------------------- Utility: Enhanced Similarity -------------------
function similarity(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();

  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.9;

  const aWords = a.split(/[^a-z0-9]/gi);
  const bWords = b.split(/[^a-z0-9]/gi);

  let matches = 0;
  for (const word of aWords) {
    if (bWords.includes(word)) matches++;
  }

  return matches / Math.max(aWords.length, 1);
}

// ------------------- Fetch All Trello Labels for the Board -------------------
async function fetchLabels() {
  const response = await axios.get(`https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels`, {
    params: {
      key: TRELLO_API_KEY,
      token: TRELLO_TOKEN
    }
  });
  return response.data;
}

// ------------------- Create a Trello Card -------------------
// ------------------- Create a Trello Card -------------------
async function createTrelloCard({ threadName, username, content, images, createdAt, overrideListId }) {
  const dueDate = new Date(createdAt);
  dueDate.setHours(dueDate.getHours() + 48);

  const labels = await fetchLabels();

  // 🔧 Keep the extension for label matching (e.g., pet.js, mount.js)
  let baseName = path.basename(username).toLowerCase();

  // 🛠️ Optional: handle command-style names like "/mount"
  if (baseName.startsWith('/')) baseName = `${baseName.slice(1)}.js`;

  let bestMatch = null;
  let bestScore = 0;

  for (const label of labels) {
    const labelName = label.name.toLowerCase();
    const score = similarity(baseName, labelName);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = label;
    }
  }

  const cardData = {
    name: `${threadName}`,
    desc: content,
    idList: overrideListId || TRELLO_LIST_ID,
    start: new Date(createdAt).toISOString(),
    due: dueDate.toISOString(),
    idLabels: bestMatch ? [bestMatch.id] : [],
    key: TRELLO_API_KEY,
    token: TRELLO_TOKEN,
  };

  try {
    const response = await axios.post('https://api.trello.com/1/cards', cardData);
    const cardId = response.data.id;

    for (const imageUrl of images) {
      await axios.post(`https://api.trello.com/1/cards/${cardId}/attachments`, null, {
        params: {
          url: imageUrl,
          key: TRELLO_API_KEY,
          token: TRELLO_TOKEN,
          setCover: false,
        },
      });
    }

    console.log(`[trello.js]: Trello card created: ${response.data.shortUrl}`);
    return response.data.shortUrl;

  } catch (error) {
    handleError(error, 'trello.js');
    const errorMsg = `[trello.js]: Failed to create Trello card: ${error.message}`;
    console.error(errorMsg);
    await logErrorToTrello(errorMsg, 'createTrelloCard');
    return null;
  }
}

// ------------------- Log Error to Trello -------------------
async function logErrorToTrello(errorMessage, source = 'Unknown Source') {
  const now = new Date().toISOString();
  const baseFile = path.basename(source);

  const errorCard = {
    threadName: `${baseFile} - Console Log Report`,
    username: baseFile,
    content: `**Error Message:**\n\`\`\`${errorMessage}\`\`\`\n\n**Timestamp:** ${now}`,
    images: [],
    createdAt: now,
    overrideListId: TRELLO_LOG
  };

  try {
    await createTrelloCard(errorCard);
  } catch (e) {
    handleError(e, 'trello.js');
    console.error(`[trello.js]: Failed to log error to Trello: ${e.message}`);
  }
}

// ------------------- Exports -------------------
module.exports = {
  createTrelloCard,
  logErrorToTrello
};
