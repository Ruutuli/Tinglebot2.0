// ============================================================================
// Blupee minigame: spawns, /tableroll roll name:blupee, weighted outcomes
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const TableRoll = require('@/models/TableRollModel');
const TempData = require('@/models/TempDataModel');
const { addItemInventoryDatabase } = require('@/utils/inventoryUtils');
const { handleInteractionError } = require('@/utils/globalErrorHandler');

const BLUPEE_TABLE_NAME = 'blupee';
const TEST_CHANNEL_ID = '1391812848099004578';
const SYSTEM_CREATOR = 'blupee-system';

const BLUPEE_IMAGES = [
  'https://64.media.tumblr.com/e0644def9e3c93975b8f8de49b42d366/d494ff443666a7d7-67/s540x810/2b403639169328c797fbf9e2a2783a3647079448.gif',
  'https://i.pinimg.com/originals/78/e1/d8/78e1d874b06b19f489f2523cd83f4592.gif',
  'https://64.media.tumblr.com/828cdb665990cdb4cda2c4f362eec1b1/0b9e671beb2a906d-f2/s540x810/d26fe1a63bedcb4c9add204130c35a946d07cc1b.gifv',
  'https://64.media.tumblr.com/2369b14602317eaf5456c9b529f4c1df/e3bf8acc8fca22af-4/s1280x1920/ff049de2f77ed2f4e7fd63045714446a108579da.jpg',
  'https://64.media.tumblr.com/78454595799c875b107225fad59fb315/00c87817d9aa4503-99/s540x810/43343e7ec06d213cf6d5487c4b58fe47fee9f07f.gif',
  'https://64.media.tumblr.com/1e3643683dc05caa10df5ed6ead9f47b/e3bf8acc8fca22af-33/s640x960/f3f6f20581030ef92b70dfce760ae5ffaff61cbb.gifv',
  'https://64.media.tumblr.com/738ffe6bcfe27982ef590e5b8e432e21/e4b84011d03f4327-b/s540x810/9e4d8ff9543e052880165ca2bf39f0870f139a9a.gif'
];

function getTownHallIdSet() {
  const ids = new Set(
    [process.env.RUDANIA_TOWNHALL, process.env.INARIKO_TOWNHALL, process.env.VHINTL_TOWNHALL].filter(Boolean)
  );
  return ids;
}

function isBlupeeGloballyEnabled() {
  return String(process.env.BLUPEE_ENABLED || '').toLowerCase() === 'true';
}

function testChannelRequiresSpawn() {
  return String(process.env.BLUPEE_TEST_REQUIRE_SPAWN || '').toLowerCase() === 'true';
}

function getRewardItemName() {
  return (process.env.BLUPEE_REWARD_ITEM || 'Green Rupee').trim();
}

/** Consolidate threads with their town hall / test channel parent for one shared round. */
function getBlupeeStateKeyFromIds(channelId, parentId) {
  const halls = getTownHallIdSet();
  if (parentId && halls.has(parentId)) return parentId;
  if (halls.has(channelId)) return channelId;
  if (channelId === TEST_CHANNEL_ID) return channelId;
  if (parentId === TEST_CHANNEL_ID) return TEST_CHANNEL_ID;
  return channelId;
}

function getBlupeeStateKey(interaction) {
  return getBlupeeStateKeyFromIds(interaction.channelId, interaction.channel?.parentId ?? null);
}

function isTestContext(interaction) {
  const cid = interaction.channelId;
  const pid = interaction.channel?.parentId;
  return cid === TEST_CHANNEL_ID || pid === TEST_CHANNEL_ID;
}

function isTownHallContext(interaction) {
  const cid = interaction.channelId;
  const pid = interaction.channel?.parentId;
  const halls = getTownHallIdSet();
  return halls.has(cid) || (pid && halls.has(pid));
}

function canUseBlupeeHere(interaction) {
  if (isTestContext(interaction)) return true;
  if (isTownHallContext(interaction)) return isBlupeeGloballyEnabled();
  return false;
}

function needsActiveModSpawn(interaction) {
  if (isTestContext(interaction)) {
    return testChannelRequiresSpawn();
  }
  return true;
}

function buildTableEntries() {
  const thumbs = BLUPEE_IMAGES;
  return [
    {
      weight: 1,
      item: 'BLUPEE_OUTCOME:mud',
      flavor:
        'You slipped in mud,_ At least you hope it is..._ you have to go home and wash up, no more rolling from you!! 🛑',
      thumbnailImage: thumbs[0]
    },
    {
      weight: 25,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        "... You don't even get close! The blupee runs off!<:blupee:679149916077031424> ",
      thumbnailImage: thumbs[1]
    },
    {
      weight: 25,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'Sneak attack! You tiptoe towards the glowing creature...but -SNAP- you step on a branch...it runs. <:blupee:679149916077031424> ',
      thumbnailImage: thumbs[2]
    },
    {
      weight: 24,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'CHARGE! You rush in, arms stretched out to catch the strange rabbit shaped animal! You lunge! But - oof... you miss... <:blupee:679149916077031424> ',
      thumbnailImage: thumbs[3]
    },
    {
      weight: 24,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        "You don't know how, but you felt its fur on your fingertips this time! Sadly it still got away....<:blupee:679149916077031424> ",
      thumbnailImage: thumbs[4]
    },
    {
      weight: 1,
      item: 'BLUPEE_OUTCOME:catch',
      flavor:
        "YOU GOT IT! You wrap your arms around it's tiny glowing body before...POOF -  It's gone. It left something behind though! <:rupee:605910444267536385>",
      thumbnailImage: thumbs[5]
    }
  ];
}

async function ensureBlupeeTable() {
  const entries = buildTableEntries();
  let table = await TableRoll.findOne({ name: BLUPEE_TABLE_NAME });
  if (!table) {
    table = new TableRoll({
      name: BLUPEE_TABLE_NAME,
      entries,
      createdBy: SYSTEM_CREATOR,
      isActive: true,
      maxRollsPerDay: 0
    });
  } else {
    table.entries = entries;
    table.isActive = true;
    table.maxRollsPerDay = 0;
    table.markModified('entries');
  }
  await table.save();
}

function parseOutcome(item) {
  if (!item || typeof item !== 'string') return null;
  const m = item.match(/^BLUPEE_OUTCOME:(mud|miss|catch)$/);
  return m ? m[1] : null;
}

function buildBlupeeEmbed({ outcome, flavorBody, thumbnailUrl, extraFooter, inventoryNote }) {
  const header = 'You attempt to catch a Blupee!';
  const codeBlock = '```\n' + flavorBody.trim() + '\n```';
  let description = `${header}\n${codeBlock}`;
  if (extraFooter) description += `\n${extraFooter}`;
  if (inventoryNote) description += `\n${inventoryNote}`;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription(description)
    .setTimestamp();

  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  embed.setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
  embed.setFooter({ text: 'Blupee' });
  return embed;
}

async function getOrCreateVirtualSpawn(stateKey) {
  let doc = await TempData.findByTypeAndKey('blupeeSpawn', stateKey);
  if (doc) return doc;

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await TempData.create({
    type: 'blupeeSpawn',
    key: stateKey,
    expiresAt,
    data: {
      messageId: null,
      virtual: true,
      participantState: {}
    }
  });
  return TempData.findByTypeAndKey('blupeeSpawn', stateKey);
}

async function rollBlupee(interaction, character) {
  const userId = interaction.user.id;
  const stateKey = getBlupeeStateKey(interaction);

  if (!canUseBlupeeHere(interaction)) {
    return interaction.editReply({
      content:
        '❌ **Blupee** can only be rolled in a village town hall (when the event is enabled) or in the designated test channel.'
    });
  }

  let spawnDoc = await TempData.findByTypeAndKey('blupeeSpawn', stateKey);

  if (needsActiveModSpawn(interaction)) {
    if (!spawnDoc || spawnDoc.data?.virtual) {
      return interaction.editReply({
        content:
          '❌ No Blupee is active here yet. Wait for a moderator to spawn one (or use the test channel without `BLUPEE_TEST_REQUIRE_SPAWN`).'
      });
    }
  } else {
    if (!spawnDoc) {
      spawnDoc = await getOrCreateVirtualSpawn(stateKey);
    }
  }

  const participantState = { ...(spawnDoc.data?.participantState || {}) };
  const prev = participantState[userId];
  if (prev === 'mud') {
    return interaction.editReply({
      content:
        '❌ You slipped in mud last time — **no more rolling for you this round**. Try again after the next Blupee spawn!'
    });
  }
  if (prev === 'caught') {
    return interaction.editReply({
      content: '❌ You already caught a Blupee this round — let others have a chance!'
    });
  }

  let rollResult;
  try {
    rollResult = await TableRoll.rollOnTable(BLUPEE_TABLE_NAME);
  } catch (err) {
    handleInteractionError(err, 'blupeeModule.js', {
      commandName: 'tableroll blupee',
      userId: interaction.user.id
    });
    return interaction.editReply({
      content: '❌ Could not roll the Blupee table. Try again shortly.'
    });
  }

  const entry = rollResult.result;
  const outcome = parseOutcome(entry.item);
  const flavorBody = entry.flavor || '';
  const thumb = entry.thumbnailImage || '';

  if (outcome === 'miss') {
    const embed = buildBlupeeEmbed({
      outcome: 'miss',
      flavorBody,
      thumbnailUrl: thumb,
      extraFooter: 'try again! `/tableroll roll name:blupee`',
      inventoryNote: null
    });
    return interaction.editReply({ embeds: [embed] });
  }

  if (outcome === 'mud') {
    participantState[userId] = 'mud';
    await TempData.findOneAndUpdate(
      { type: 'blupeeSpawn', key: stateKey },
      { $set: { 'data.participantState': participantState, 'data.messageId': spawnDoc.data?.messageId ?? null, 'data.virtual': !!spawnDoc.data?.virtual } },
      { upsert: false }
    );

    const embed = buildBlupeeEmbed({
      outcome: 'mud',
      flavorBody,
      thumbnailUrl: thumb,
      extraFooter:
        'No more rolling for you this round, try again next time!',
      inventoryNote: null
    });
    return interaction.editReply({ embeds: [embed] });
  }

  if (outcome === 'catch') {
    participantState[userId] = 'caught';
    await TempData.findOneAndUpdate(
      { type: 'blupeeSpawn', key: stateKey },
      { $set: { 'data.participantState': participantState, 'data.messageId': spawnDoc.data?.messageId ?? null, 'data.virtual': !!spawnDoc.data?.virtual } },
      { upsert: false }
    );

    const rewardName = getRewardItemName();
    let inventoryNote = '';
    try {
      await addItemInventoryDatabase(character._id, rewardName, 1, interaction, 'Blupee catch');
      inventoryNote = `✅ **${rewardName}** added to **${character.name}**'s inventory.`;
    } catch (invErr) {
      handleInteractionError(invErr, 'blupeeModule.js', {
        commandName: 'blupee catch reward',
        characterId: String(character._id),
        itemName: rewardName
      });
      inventoryNote = `⚠️ Could not add **${rewardName}** automatically — grant it manually if needed. (${invErr.message})`;
    }

    const embed = buildBlupeeEmbed({
      outcome: 'catch',
      flavorBody,
      thumbnailUrl: thumb,
      extraFooter:
        'You have caught a blupee for this round, let others have a chance as well! Please keep track of how many rupees you gather!',
      inventoryNote
    });
    return interaction.editReply({ embeds: [embed] });
  }

  return interaction.editReply({
    content: '❌ Unexpected Blupee outcome — notify a developer.'
  });
}

function getBlupeeStateKeyForDiscordChannel(channel) {
  return getBlupeeStateKeyFromIds(channel.id, channel.parentId);
}

async function postBlupeeSpawn(channel) {
  const imageUrl = BLUPEE_IMAGES[Math.floor(Math.random() * BLUPEE_IMAGES.length)];
  const stateKey = getBlupeeStateKeyForDiscordChannel(channel);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('✨ A Blupee appears!')
    .setDescription(
      'A glowing creature darts through the town hall… Quick — try to catch it!\n\nUse `/tableroll roll name:blupee` with your character name.'
    )
    .setImage(imageUrl)
    .setFooter({ text: 'Blupee event' })
    .setTimestamp();

  const msg = await channel.send({ embeds: [embed] });

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await TempData.findOneAndUpdate(
    { type: 'blupeeSpawn', key: stateKey },
    {
      $set: {
        type: 'blupeeSpawn',
        key: stateKey,
        expiresAt,
        data: {
          messageId: msg.id,
          virtual: false,
          participantState: {}
        }
      }
    },
    { upsert: true }
  );

  return { message: msg, stateKey };
}

async function getBlupeeStatusSnapshot(stateKey) {
  const doc = await TempData.findByTypeAndKey('blupeeSpawn', stateKey);
  if (!doc) {
    return { active: false, virtual: false, messageId: null };
  }
  return {
    active: true,
    virtual: !!doc.data?.virtual,
    messageId: doc.data?.messageId || null
  };
}

module.exports = {
  BLUPEE_TABLE_NAME,
  TEST_CHANNEL_ID,
  ensureBlupeeTable,
  rollBlupee,
  postBlupeeSpawn,
  getBlupeeStateKeyForDiscordChannel,
  getBlupeeStatusSnapshot,
  isBlupeeGloballyEnabled,
  testChannelRequiresSpawn,
  getRewardItemName,
  getBlupeeStateKey
};
