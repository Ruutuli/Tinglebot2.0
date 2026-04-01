// April 1 only: uses America/New_York *local calendar date* (US Eastern — EST in winter, EDT after DST).
// Active the full civil day: from 12:00:00.000am through 11:59:59.999pm Eastern on April 1; off on March 31 and April 2+.

const MOCK_FAIRY_NAME = 'Mock Fairy';

const FLAVOR_LINES = [
  'The fairies called in sick. This stand-in is *very* committed.',
  'Hyrule HR approved this substitution. Please direct complaints to the void.',
  'The real fairy is on union break. Enjoy this sparkly understudy.',
  "It's not a bug—it's a *feature* with wings and attitude.",
  'Inventory policy, April 1st edition: Mock Fairy or bust.',
  'A mysterious decree: all drops are legally distinct Mock Fairies today.',
];

/** Sync fallback if items DB is unavailable (matches items catalog Mock Fairy). Never throws. */
function getMockFairyStaticPayload() {
  return {
    itemName: MOCK_FAIRY_NAME,
    emoji: '<:mockfairy:1253832815137783839>',
    image: 'https://storage.googleapis.com/tinglebot/Items/mockfairy_redraw_500x.png',
    type: ['Creature'],
    category: ['Material'],
    subtype: ['None'],
    itemRarity: 6,
  };
}

/**
 * True only when the civil date in America/New_York is April 1 (any year).
 * Invalid dates or parsing failures → false (no joke, normal loot).
 */
function isAprilFoolsEastern(date = new Date()) {
  try {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return false;
    }
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'numeric',
      day: 'numeric',
    });
    const parts = fmt.formatToParts(date);
    const monthPart = parts.find((p) => p.type === 'month');
    const dayPart = parts.find((p) => p.type === 'day');
    if (!monthPart || !dayPart) {
      return false;
    }
    const month = parseInt(monthPart.value, 10);
    const day = parseInt(dayPart.value, 10);
    if (!Number.isFinite(month) || !Number.isFinite(day)) {
      return false;
    }
    return month === 4 && day === 1;
  } catch {
    return false;
  }
}

function getAprilFoolsFlavorLine() {
  if (!FLAVOR_LINES.length) {
    return 'April 1st inventory protocols are in effect.';
  }
  return FLAVOR_LINES[Math.floor(Math.random() * FLAVOR_LINES.length)];
}

function aprilFoolsMessageSuffix() {
  return `\n\n🎭 *${getAprilFoolsFlavorLine()}*`;
}

function normalizeArr(v, fallback) {
  if (Array.isArray(v) && v.length) return v;
  if (v != null && v !== '') return [v];
  return fallback;
}

async function fetchMockFairyRollPayload() {
  try {
    const { fetchItemByName } = require('@/database/db.js');
    const doc = await fetchItemByName(MOCK_FAIRY_NAME, { source: 'april_fools' });
    if (!doc) {
      return getMockFairyStaticPayload();
    }
    return {
      itemName: doc.itemName || MOCK_FAIRY_NAME,
      emoji: doc.emoji || '',
      image: doc.image || '',
      type: normalizeArr(doc.type, ['Material']),
      category: normalizeArr(doc.category, ['Creature']),
      itemRarity: doc.itemRarity ?? 6,
      subtype: doc.subtype,
    };
  } catch {
    return getMockFairyStaticPayload();
  }
}

async function toAprilFoolsLootArray(lootedItems) {
  if (!isAprilFoolsEastern() || !lootedItems || lootedItems.length === 0) {
    return lootedItems;
  }
  let p;
  try {
    p = await fetchMockFairyRollPayload();
  } catch {
    p = getMockFairyStaticPayload();
  }
  const base = lootedItems[0] || {};
  return [
    {
      ...base,
      itemName: p.itemName,
      emoji: p.emoji,
      image: p.image || base.image,
      quantity: 1,
      itemRarity: p.itemRarity,
    },
  ];
}

async function toAprilFoolsTravelSyncItem(formattedItem) {
  if (!isAprilFoolsEastern() || !formattedItem) return formattedItem;
  let p;
  try {
    p = await fetchMockFairyRollPayload();
  } catch {
    p = getMockFairyStaticPayload();
  }
  return {
    ...formattedItem,
    itemName: p.itemName,
    emoji: p.emoji,
    image: p.image || formattedItem.image,
    quantity: 1,
    category: Array.isArray(p.category) ? p.category : formattedItem.category,
    type: Array.isArray(p.type) ? p.type : formattedItem.type,
    itemRarity: p.itemRarity,
  };
}

async function toAprilFoolsGatherItem(randomItem) {
  if (!isAprilFoolsEastern() || !randomItem) return randomItem;
  let p;
  try {
    p = await fetchMockFairyRollPayload();
  } catch {
    p = getMockFairyStaticPayload();
  }
  return {
    ...randomItem,
    itemName: p.itemName,
    emoji: p.emoji,
    image: p.image || randomItem.image,
    type: p.type?.length ? p.type : randomItem.type,
    category: p.category?.length ? p.category : randomItem.category,
    itemRarity: p.itemRarity ?? randomItem.itemRarity,
  };
}

async function toAprilFoolsLootObject(lootedItem) {
  if (!isAprilFoolsEastern() || !lootedItem) return lootedItem;
  const arr = await toAprilFoolsLootArray([lootedItem]);
  return arr[0];
}

module.exports = {
  MOCK_FAIRY_NAME,
  isAprilFoolsEastern,
  getAprilFoolsFlavorLine,
  aprilFoolsMessageSuffix,
  fetchMockFairyRollPayload,
  getMockFairyStaticPayload,
  toAprilFoolsLootArray,
  toAprilFoolsTravelSyncItem,
  toAprilFoolsGatherItem,
  toAprilFoolsLootObject,
};
