// ============================================================================
// ------------------- Topic Filter Module -------------------
// Tinglebot trigger & greylist enforcement for Roots of the Wild
// Helps protect members who have experienced trauma from re-exposure
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const logger = require('@/utils/logger');

const FILE = 'TOPIC_FILTER';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MOD_CHANNEL_ID = process.env.TOPIC_FILTER_LOG_CHANNEL_ID || process.env.MOD_LOG_CHANNEL_ID || '855628652389335040';

/**
 * @typedef {Object} TopicDefinition
 * @property {string} name - Display name for the topic
 * @property {string[]} keywords - Keywords/phrases to detect
 * @property {boolean} isBlacklist - true = enforced trigger (red), false = grey list
 */

/**
 * Trigger List (Blacklist) - Serious triggers only.
 * These affect emotional state significantly: extreme overwhelm, panic attacks, or PTSD.
 * Applies to all instances, real and fictional.
 */
const BLACKLIST_TOPICS = [
  // 1. Car Wrecks & Accidents
  {
    name: 'Car Wrecks & Accidents',
    keywords: [
      'car', 'car wreck', 'carwreck', 'car crash', 'carcrash', 'vehicle wreck', 'vehiclewreck',
      'vehicle crash', 'vehiclecrash', 'car accident', 'caraccident', 'vehicle accident', 'vehicleaccident',
      'auto accident', 'autoaccident', 'traffic accident', 'trafficaccident', 'car collision', 'carcollision',
      'vehicle collision', 'vehiclecollision', 'car wrecked', 'crashed car', 'wrecked car', 'car totaled',
      'totaled car', 'drunk driving', 'drunkdriving', 'driving drunk', 'drivingdrunk', 'impaired driving',
      'impaireddriving', 'driving impaired', 'drivingimpaired', 'reckless driving', 'recklessdriving',
      'driving recklessly', 'drivingrecklessly', 'dwi', 'dui', 'driving under influence', 'drivingunderinfluence',
      'driving while intoxicated', 'drivingwhileintoxicated', 'texting while driving', 'textingwhiledriving',
      'distracted driving', 'distracteddriving', 'fatal crash', 'fatalcrash', 'fatal accident', 'fatalaccident',
      'deadly crash', 'deadlycrash', 'car pileup', 'carpileup', 'head on collision', 'headoncollision',
      'parking lot', 'parkinglot', 'parking ticket', 'parkingticket', 'parking violation', 'parkingviolation',
      'merge', 'merging', 'merge into', 'mergeinto', 'lane change', 'lanechange', 'changing lanes', 'changinglanes',
      'road rage', 'roadrage', 'aggressive driving', 'aggressivedriving', 'cut off', 'cutoff', 'cut me off', 'cutmeoff',
      'traffic incident', 'trafficincident', 'driving incident', 'drivingincident', 'car stuff', 'carstuff',
      'fender bender', 'fenderbender', 'hit and run', 'hitandrun', 'car broke', 'carbroke', 'car broke down',
    ],
    isBlacklist: true,
  },
  // 2. 45th President of the United States
  {
    name: '45th President / Trump',
    keywords: ['trump', 'donald trump', 'donaldtrump', '45th president', '45thpresident', 'potus 45'],
    isBlacklist: true,
  },
  // 3. Vore & Being Swallowed
  {
    name: 'Vore & Being Swallowed',
    keywords: [
      'being swallowed', 'beingswallowed', 'swallowed whole', 'swallowedwhole', 'swallow whole',
      'swallowed by', 'swallowedby', 'being eaten', 'beingeaten', 'inside a stomach', 'inside stomach',
      'inside another\'s body', 'inside anothers body', 'inside their stomach',
      'vore', 'mid-swallow', 'midswallow', 'stomach interior', 'being consumed', 'beingconsumed',
      'consumed whole', 'consumedwhole', 'eaten alive', 'eatenalive', 'inside a mouth', 'insidemouth',
      'shrinking to be eaten', 'size manipulation eaten', 'swallowed by monster', 'swallowed by creature',
    ],
    isBlacklist: true,
  },
];

/**
 * Grey List - Heavy or distressing topics.
 * Generally not discussed; members may be asked to stop. Not warned for simple mention unless graphic.
 */
const GREYLIST_TOPICS = [
  { name: 'Suicide', keywords: ['suicide', 'suicidal', 'kill myself', 'killing myself', 'end my life', 'ending my life', 'self harm', 'self-harm', 'selfharm'], isBlacklist: false },
  { name: 'Cancer', keywords: ['cancer', 'tumor', 'chemotherapy', 'chemo'], isBlacklist: false },
  { name: 'Terrorism', keywords: ['terrorism', 'terrorist', 'terror attack', 'terrorist attack'], isBlacklist: false },
  { name: 'Real-world Politics', keywords: ['election', 'president', 'congress', 'senate', 'democrat', 'republican', 'liberal', 'conservative', 'impeachment', 'political party'], isBlacklist: false },
  { name: 'Holocaust', keywords: ['holocaust', 'nazi', 'hitler', 'concentration camp'], isBlacklist: false },
  { name: 'Mass Shootings', keywords: ['mass shooting', 'massshooting', 'school shooting', 'schoolshooting', 'shooting spree'], isBlacklist: false },
  { name: 'Rape / Sexual Assault', keywords: ['rape', 'raped', 'sexual assault', 'sexualassault', 'sexual violence', 'sexualviolence'], isBlacklist: false },
  { name: 'Animal Abuse / Harm / Death', keywords: ['animal abuse', 'animalabuse', 'animal harm', 'animalharm', 'animal death', 'animaldeath', 'abuse animals', 'harm animals', 'kill animals'], isBlacklist: false },
  { name: 'Rabies', keywords: ['rabies', 'rabid'], isBlacklist: false },
];

const TOPIC_DEFINITIONS = [...BLACKLIST_TOPICS, ...GREYLIST_TOPICS];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detects if message content matches any topic.
 * @param {string} messageContent - Raw message content
 * @returns {TopicDefinition|null} Matched topic or null
 */
function detectTopic(messageContent) {
  const normalized = messageContent.toLowerCase().trim();
  if (!normalized) return null;

  // Check blacklist first (stricter enforcement)
  for (const topic of TOPIC_DEFINITIONS) {
    for (const keyword of topic.keywords) {
      const escaped = keyword.toLowerCase().replace(/\s+/g, '\\s+').replace(/[']/g, "'?");
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(normalized)) return topic;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------

/**
 * Creates the topic reminder embed for DMs.
 * @param {TopicDefinition} topic
 * @returns {EmbedBuilder}
 */
function createTopicReminderEmbed(topic) {
  const isBlacklist = topic.isBlacklist;
  const color = isBlacklist ? 0xff4444 : 0xffaa00;
  const listType = isBlacklist ? 'Trigger' : 'Grey';
  const listEmoji = isBlacklist ? '❌' : '⚪';

  return new EmbedBuilder()
    .setTitle(`${listEmoji} Topic Reminder`)
    .setDescription(
      `Hey! I noticed you mentioned something related to **${topic.name}**, which is on our ${listType} list.`
    )
    .setColor(color)
    .addFields(
      { name: '📋 Detected Topic', value: `**${topic.name}**\n${listType} Topic`, inline: false },
      { name: '⚠️ Detection System Note', value: 'Our detection system isn\'t perfect and may sometimes flag things incorrectly.', inline: false },
      { name: '✅ What To Do', value: 'If you weren\'t actually discussing a blacklisted/greylisted topic, please disregard this message. If you were, please be mindful of how you discuss it in the server.', inline: false }
    )
    .setFooter({ text: 'Tinglebot - Keeping the server safe and comfortable for everyone' })
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

async function sendLog(client, embed, channelId = MOD_CHANNEL_ID) {
  if (!channelId) {
    logger.warn(FILE, 'No mod channel configured (TOPIC_FILTER_LOG_CHANNEL_ID or MOD_LOG_CHANNEL_ID)');
    return;
  }
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch?.isTextBased()) {
      await ch.send({ embeds: [embed] });
    }
  } catch (err) {
    logger.warn(FILE, `Could not send log to mod channel: ${err.message}`);
  }
}

async function logSuccessfulDM(client, user, topic, message) {
  const listType = topic.isBlacklist ? 'Trigger' : 'Grey';
  const embed = new EmbedBuilder()
    .setTitle('✅ Topic Reminder DM Sent')
    .setDescription(`A topic reminder DM was sent to a user for a ${listType.toLowerCase()} topic.`)
    .setColor(0x00ff00)
    .addFields(
      { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
      { name: '📋 Topic', value: `**${topic.name}**\n${listType}`, inline: true },
      { name: '💬 Original Message', value: (message.content ?? '').substring(0, 500) || '*No content*', inline: false },
      { name: '🔗 Message Link', value: message.url ?? 'N/A', inline: false }
    )
    .setTimestamp();
  await sendLog(client, embed);
}

async function logFailedDM(client, user, topic, message, reason) {
  const listType = topic.isBlacklist ? 'Trigger' : 'Grey';
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Topic Reminder Needed - DM Failed')
    .setDescription(`**Action Required:** A user mentioned a ${listType.toLowerCase()} topic, but the bot couldn't send them a DM. Please reach out if needed.`)
    .setColor(0xffaa00)
    .addFields(
      { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
      { name: '📋 Topic', value: `**${topic.name}**\n${listType}`, inline: true },
      { name: '❌ Why DM Failed', value: reason, inline: false },
      { name: '💬 Original Message', value: (message.content ?? '').substring(0, 500) || '*No content*', inline: false },
      { name: '🔗 Message Link', value: message.url ?? 'N/A', inline: false }
    )
    .setTimestamp();
  await sendLog(client, embed);
}

// ---------------------------------------------------------------------------
// DM Sending
// ---------------------------------------------------------------------------

async function sendTopicReminderDM(client, user, topic, originalMessage) {
  try {
    const userObj = await client.users.fetch(user.id);
    const embed = createTopicReminderEmbed(topic);
    await userObj.send({ embeds: [embed] });
    logger.success(FILE, `Sent topic reminder DM to ${user.tag} for: ${topic.name}`);
    await logSuccessfulDM(client, user, topic, originalMessage);
  } catch (err) {
    const code = err?.code;
    const msg = err?.message ?? 'Unknown error';
    if (code === 50007) {
      logger.warn(FILE, `Cannot send DM to ${user.tag}: DMs disabled`);
      await logFailedDM(client, user, topic, originalMessage, 'User has DMs disabled');
    } else {
      logger.error(FILE, `Error sending DM to ${user.tag}`, err);
      await logFailedDM(client, user, topic, originalMessage, msg);
    }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handles a message for topic filter detection.
 * Call this from messageCreate handler for guild messages.
 * @param {import('discord.js').Message} message
 * @param {import('discord.js').Client} client
 */
async function handleTopicFilter(message, client) {
  if (message.author?.bot || !message.guild) return;

  const content = message.content ?? '';
  if (!content.trim()) return;

  const detectedTopic = detectTopic(content);
  if (detectedTopic) {
    await sendTopicReminderDM(
      client,
      { id: message.author.id, tag: message.author.tag },
      detectedTopic,
      message
    );
  }
}

/**
 * Initializes the topic filter. Attaches to client for use by index.js.
 * @param {import('discord.js').Client} client
 */
function initializeTopicFilter(client) {
  client.on('messageCreate', async (message) => {
    if (message.author?.bot || !message.guild) return;
    try {
      await handleTopicFilter(message, client);
    } catch (error) {
      logger.error(FILE, `Topic filter error: ${error.message}`, error);
    }
  });
  logger.info(FILE, `Topic filter initialized (${TOPIC_DEFINITIONS.length} topics)`);
}

module.exports = {
  detectTopic,
  handleTopicFilter,
  initializeTopicFilter,
  TOPIC_DEFINITIONS,
};
