const axios = require('axios');

const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID;
const TRELLO_BOARD_ID = process.env.TRELLO_BOARD_ID; // Add this to your .env

// String similarity for closest match
function similarity(a, b) {
  const regex = /[^a-z0-9]/gi;
  a = a.toLowerCase().replace(regex, '');
  b = b.toLowerCase().replace(regex, '');

  let matches = 0;
  for (let char of a) if (b.includes(char)) matches++;
  return matches / a.length;
}

async function fetchLabels() {
  const response = await axios.get(`https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels`, {
    params: {
      key: TRELLO_API_KEY,
      token: TRELLO_TOKEN
    }
  });
  return response.data;
}

async function createTrelloCard({ threadName, username, content, images, createdAt }) {
  const dueDate = new Date(createdAt);
  dueDate.setHours(dueDate.getHours() + 48);

  const labels = await fetchLabels();

  let bestMatch = null;
  let bestScore = 0;

  for (const label of labels) {
    const score = similarity(threadName, label.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = label;
    }
  }

// Attempt to extract Issue line for cleaner title
const issueLine = content.split('\n').find(line => line.toLowerCase().startsWith('issue:'));
const issueText = issueLine ? issueLine.replace(/issue:/i, '').trim().slice(0, 50) : 'Bug Report';

const cardData = {
  name: `${threadName} - ${username} - ${issueText}`,
  desc: content,
  idList: TRELLO_LIST_ID,
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
            setCover: false, // Prevent it from becoming the card cover
          },
        });
      }
      
    console.log(`[trello.js]: Trello card created: ${response.data.shortUrl}`);
    return response.data.shortUrl;

  } catch (error) {
    console.error(`[trello.js]: Failed to create Trello card: ${error}`);
    return null;
  }
}

module.exports = { createTrelloCard };
