// ------------------- Standard Libraries -------------------
const axios = require('axios');

// ------------------- Utilities -------------------
const { handleError } = require('../utils/globalErrorHandler');

// ------------------- Environment Variables -------------------
const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID; // Default list for normal cards
const TRELLO_LOG = process.env.TRELLO_LOG || '67fe7cc498f7d8f31520c1af'; // Dedicated error log list
const TRELLO_BOARD_ID = process.env.TRELLO_BOARD_ID; // Required for label fetching

// ------------------- Utility: String Similarity -------------------
function similarity(a, b) {
  const regex = /[^a-z0-9]/gi;
  a = a.toLowerCase().replace(regex, '');
  b = b.toLowerCase().replace(regex, '');

  let matches = 0;
  for (let char of a) {
    if (b.includes(char)) matches++;
  }
  return matches / a.length;
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
async function createTrelloCard({ threadName, username, content, images, createdAt, overrideListId }) {
  const dueDate = new Date(createdAt);
  dueDate.setHours(dueDate.getHours() + 48);

  const labels = await fetchLabels();
  let bestMatch = null;
  let bestScore = 0;

  // Match label based only on source/filename
  for (const label of labels) {
    const score = similarity(username, label.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = label;
    }
  }

  const cardData = {
    name: `${threadName}`, // Do NOT append issueText (we want clean title!)
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

  const errorCard = {
    threadName: `${source} - Console Log Report`,
    username: source,
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
