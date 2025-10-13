// ============================================================================
// ------------------- Standard Libraries -------------------
const axios = require('axios');

// ============================================================================
// ------------------- Utilities -------------------
const { handleError } = require('../utils/globalErrorHandler');
const logger = require('../utils/logger');

// ============================================================================
// ------------------- Environment Variables -------------------
const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID;
const CONSOLE_LOG_CHANNEL = process.env.CONSOLE_LOG_CHANNEL;
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
// Implements exponential backoff with jitter for resilient label fetching.
// ============================================================================
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;

async function fetchLabels() {
  if (!TRELLO_BOARD_ID) {
    console.error("[trello.js]: ❌ Missing TRELLO_BOARD_ID in environment variables.");
    return [];
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(`https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels`, {
        params: {
          key: TRELLO_API_KEY,
          token: TRELLO_TOKEN
        }
      });

      return response.data;

    } catch (error) {
      const status = error.response?.status;

      if (status === 503 || status === 429) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100);
        console.warn(`[trello.js]: ⚠️ Attempt ${attempt} failed with status ${status}. Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }

      const context = {
        options: { TRELLO_BOARD_ID },
        commandName: "fetchLabels"
      };

      handleError(error, "trello.js", context);
      console.error("[trello.js]: ❌ Failed to fetch labels from Trello API", error.message);
      return [];
    }
  }

  console.error("[trello.js]: ❌ All retry attempts failed. Returning empty label list.");
  return [];
}

// ============================================================================
// ------------------- Create a Trello Card -------------------
async function createTrelloCard({ threadName, username, content, images, createdAt, overrideListId, isErrorLog = false }) {
  // Validate required environment variables
  if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
    throw new Error('Missing required Trello credentials (API_KEY or TOKEN)');
  }

  const dueDate = new Date(createdAt);
  dueDate.setHours(dueDate.getHours() + 48);

  let matchedLabels = [];
  const labels = await fetchLabels();

  // ------------------- Label Matching by Card Type -------------------
  if (overrideListId === CONSOLE_LOG_CHANNEL) {
    // Match exact file name from "file.js - Console Log Report"
    const fileBase = threadName.split(' - ')[0].toLowerCase().trim();
    for (const label of labels) {
      if (label.name.toLowerCase() === fileBase) {
        matchedLabels.push(label.id);
        break;
      }
    }
  } else if (overrideListId === TRELLO_WISHLIST) {
    // Match label from **Feature Name:**
    const match = content.match(/\*\*Feature Name:\*\*\s*(.+)/i);
    const featureLabel = match ? match[1].toLowerCase().trim() : null;
    if (featureLabel) {
      for (const label of labels) {
        if (label.name.toLowerCase() === featureLabel) {
          matchedLabels.push(label.id);
          break;
        }
      }
    }
  } else {
    // Match command-style names like /loot => loot.js
    let baseName = threadName.trim().toLowerCase();
    if (baseName.startsWith('/')) {
      baseName = baseName.split(/\s+/)[0];
      baseName = `${baseName.slice(1)}.js`;
    } else if (!baseName.endsWith('.js')) {
      baseName = `${baseName.split(/\s+/)[0]}.js`;
    }

    let bestScore = 0;
    let bestMatch = null;

    for (const label of labels) {
      const labelName = label.name.toLowerCase();
      const score = similarity(baseName, labelName);
      if (score >= 0.6) matchedLabels.push(label.id);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = label;
      }
    }

    if (matchedLabels.length === 0 && bestScore >= 0.3 && bestMatch) {
      matchedLabels.push(bestMatch.id);
    }
  }

  // ------------------- Format Name and Description -------------------
  let formattedName = threadName;
  let formattedDesc = content;

  if (overrideListId === TRELLO_LIST_ID) {
    formattedName = `${threadName} - ${username}`;
    formattedDesc = `**Submitted By:** ${username}\n\n${content}`;
  }

  // ------------------- Build Card Payload -------------------
  const cardData = {
    name: formattedName || 'Untitled Card',  // Ensure name is never empty
    desc: formattedDesc || '',  // Ensure description is never undefined
    idList: overrideListId || TRELLO_LIST_ID,
    start: new Date(createdAt).toISOString(), // Ensure proper ISO string format
    idLabels: matchedLabels || [],  // Ensure labels is never undefined
    pos: 'bottom'  // Add position to ensure card is added at bottom of list
  };

  if (overrideListId !== TRELLO_WISHLIST) {
    cardData.due = dueDate.toISOString();
  }

  // Validate required fields before making request
  if (!cardData.idList || typeof cardData.idList !== 'string' || cardData.idList.length < 8) {
    throw new Error('Invalid or missing Trello list ID. Please check your environment variables.');
  }
  if (!cardData.name) {
    throw new Error('Missing required field: name');
  }

  // ------------------- Post Card and Attachments -------------------
  try {
    const response = await axios.post('https://api.trello.com/1/cards', cardData, {
      params: {
        key: TRELLO_API_KEY,
        token: TRELLO_TOKEN
      }
    });
    const cardId = response.data.id;

    // Process attachments sequentially to avoid rate limits
    for (const imageUrl of images) {
      try {
        await axios.post(`https://api.trello.com/1/cards/${cardId}/attachments`, null, {
          params: {
            url: imageUrl,
            key: TRELLO_API_KEY,
            token: TRELLO_TOKEN,
            setCover: false,
          },
        });
      } catch (attachmentError) {
        console.warn(`[trello.js]: Failed to attach image ${imageUrl}: ${attachmentError.message}`);
      }
    }

    logger.debug('SYSTEM', `Trello card created: ${response.data.shortUrl}`);
    return response.data.shortUrl;

  } catch (error) {
    // Enhanced error logging
    const errorDetails = {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      cardData: { ...cardData, desc: cardData.desc?.substring(0, 100) + '...' } // Truncate description for logging
    };
    
    console.error('[trello.js]: Failed to create Trello card:', JSON.stringify(errorDetails, null, 2));
    
    // Only log to Trello if this isn't already an error logging attempt
    if (!isErrorLog) {
      await logErrorToTrello(`Failed to create Trello card: ${error.message}\nDetails: ${JSON.stringify(errorDetails)}`, 'createTrelloCard');
    }
    return null;
  }
}

// ============================================================================
// ------------------- Log Error to Trello -------------------
async function logErrorToTrello(errorMessage, source = 'Unknown Source') {
  try {
    const now = new Date();
    
    // Create the card data
    const cardData = {
      name: `${source} - Console Log Report`,
      desc: `**Error Message:**\n\`\`\`${errorMessage}\`\`\``,
      idList: TRELLO_LIST_ID, // Use the default Trello list ID instead of Discord channel ID
      start: now.toISOString(),
      idLabels: [],
      pos: 'bottom',
      due: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
    };

    // Validate Trello credentials before attempting to create card
    if (!TRELLO_API_KEY || !TRELLO_TOKEN || !TRELLO_LIST_ID) {
      console.error('[trello.js]: Missing required Trello credentials or list ID');
      return null;
    }

    // Create the Trello card
    const response = await axios.post('https://api.trello.com/1/cards', cardData, {
      params: {
        key: TRELLO_API_KEY,
        token: TRELLO_TOKEN
      }
    });

    return response.data.url;
  } catch (error) {
    console.error('[trello.js]: Failed to create Trello card:', error.message);
    return null;
  }
}

// ============================================================================
// ------------------- Log Wishlist Entry to Trello -------------------
async function logWishlistToTrello(content, author = 'WishlistBot', listId = TRELLO_WISHLIST) {
  const now = new Date().toISOString();

  // Extract feature name and format content
  const featureNameMatch = content.match(/\*\*Feature Name:\*\*\s*([^\n]+)/i);
  const descriptionMatch = content.match(/\*\*Description:\*\*\s*([^\n]+)/i);
  const whyItMattersMatch = content.match(/\*\*Why It Matters:\*\*\s*([^\n]+)/i);

  const featureName = featureNameMatch ? featureNameMatch[1].trim() : 'Untitled Request';
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';
  const whyItMatters = whyItMattersMatch ? whyItMattersMatch[1].trim() : '';

  // Format the description with all sections
  const formattedContent = `**Submitted By:** ${author}\n\n` +
    `**Feature Name:** ${featureName}\n` +
    `**Description:** ${description}\n` +
    `**Why It Matters:** ${whyItMatters}`;

  const wishlistCard = {
    threadName: featureName,
    username: author,
    content: formattedContent,
    images: [],
    createdAt: now,
    overrideListId: listId
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
