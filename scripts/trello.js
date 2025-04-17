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
const TRELLO_WISHLIST = process.env.TRELLO_WISHLIST;

// ============================================================================
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

// ============================================================================
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

// ============================================================================
// ------------------- Create a Trello Card -------------------
async function createTrelloCard({ threadName, username, content, images, createdAt, overrideListId }) {
  const dueDate = new Date(createdAt);
  dueDate.setHours(dueDate.getHours() + 48);

  const labels = await fetchLabels();

  // ------------------- Derive Label Match From Thread Name -------------------
  let baseName = threadName.trim().toLowerCase();

  // Handle cases like "/loot", "loot command", etc.
  if (baseName.startsWith('/')) {
    baseName = baseName.split(/\s+/)[0]; // Extract just "/loot"
    baseName = `${baseName.slice(1)}.js`; // "/loot" → "loot.js"
  } else if (!baseName.endsWith('.js')) {
    baseName = `${baseName.split(/\s+/)[0]}.js`; // "loot" → "loot.js"
  }

  let matchedLabels = [];
  let bestScore = 0;
  let bestMatch = null;

  for (const label of labels) {
    const labelName = label.name.toLowerCase();
    const score = similarity(baseName, labelName);

    // Match anything reasonably close
    if (score >= 0.6) {
      matchedLabels.push(label.id);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = label;
    }
  }

  // If nothing clears the threshold, fallback to the best close match
  if (matchedLabels.length === 0 && bestScore >= 0.3 && bestMatch) {
    matchedLabels.push(bestMatch.id);
  }

  const cardData = {
    name: `${threadName}`,
    desc: content,
    idList: overrideListId || TRELLO_LIST_ID,
    start: new Date(createdAt).toISOString(),
    due: dueDate.toISOString(),
    idLabels: matchedLabels,
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



// ============================================================================
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

// ============================================================================
// ------------------- Log Wishlist Entry to Trello -------------------
async function logWishlistToTrello(content, author = 'WishlistBot') {
  const now = new Date().toISOString();

  // Extract feature name from content using regex
  const match = content.match(/\*\*Feature Name:\*\*\s*(.+)/i);
  const featureName = match ? match[1].trim() : 'Wishlist Request';

  const wishlistCard = {
    threadName: featureName,
    username: author,
    content: content,
    images: [],
    createdAt: now,
    overrideListId: TRELLO_WISHLIST
  };

  try {
    await createTrelloCard(wishlistCard);
  } catch (e) {
    handleError(e, 'trello.js');
    console.error(`[trello.js]: Failed to log wishlist to Trello: ${e.message}`);
  }
}

// ============================================================================
// ------------------- Exports -------------------
module.exports = {
  createTrelloCard,
  logErrorToTrello,
  logWishlistToTrello
};