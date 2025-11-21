import { checkUserAuthStatus, isAuthenticated as authState, isAdminUser } from './auth.js';

const inventoryState = {
  loading: false,
  filters: {
    search: '',
    category: 'all',
    character: 'all'
  },
  characters: [],
  aggregates: {
    totalQuantity: 0,
    uniqueItems: 0,
    items: []
  },
  aggregatedView: {
    page: 1,
    pageSize: 25,
    collapsed: false
  },
  itemCatalogLoaded: false,
  itemCatalog: new Map()
};

const GEAR_SLOT_CONFIG = [
  { slot: 'weapon', label: 'Weapon', path: ['weapon'] },
  { slot: 'shield', label: 'Shield', path: ['shield'] },
  { slot: 'armor_head', label: 'Head Armor', path: ['armor', 'head'] },
  { slot: 'armor_chest', label: 'Chest Armor', path: ['armor', 'chest'] },
  { slot: 'armor_legs', label: 'Leg Armor', path: ['armor', 'legs'] }
];

let selectedItemContext = null;
let canManageInventory = false;
const EQUIPPED_RESERVE_PER_STACK = 1;
function getEquippedReservationCount(item) {
  if (!item || !item.isEquipped) {
    return 0;
  }
  const quantity = Number(item.quantity) || 0;
  if (quantity <= 0) {
    return 0;
  }
  return Math.min(EQUIPPED_RESERVE_PER_STACK, quantity);
}

function getTransferableQuantity(item) {
  if (!item) {
    return 0;
  }
  const quantity = Number(item.quantity) || 0;
  if (quantity <= 0) {
    return 0;
  }
  const reserve = getEquippedReservationCount(item);
  return Math.max(0, quantity - reserve);
}

function detectEquippedStatus(record = {}) {
  if (!record || typeof record !== 'object') {
    return false;
  }
  if (record.isEquipped !== undefined) {
    return Boolean(record.isEquipped);
  }
  const textFields = ['location', 'notes', 'obtain', 'perk', 'status', 'slot', 'job', 'type', 'category'];
  const hasEquippedKeyword = textFields.some((field) => {
    const value = record[field];
    return typeof value === 'string' && value.toLowerCase().includes('equip');
  });
  if (hasEquippedKeyword) {
    return true;
  }
  const subtypeValues = [];
  if (Array.isArray(record.subtype)) {
    subtypeValues.push(...record.subtype);
  } else if (typeof record.subtype === 'string' && record.subtype.trim()) {
    subtypeValues.push(record.subtype);
  }
  if (Array.isArray(record.subtypes)) {
    subtypeValues.push(...record.subtypes);
  }
  return subtypeValues.some((sub) => typeof sub === 'string' && sub.toLowerCase().includes('equip'));
}

function decorateAggregatesWithEquippedFlag(aggregates = { totalQuantity: 0, uniqueItems: 0, items: [] }) {
  return {
    ...aggregates,
    items: (aggregates.items || []).map((item) => ({
      ...item,
      instances: (item.instances || []).map((instance) => ({
        ...instance,
        isEquipped: detectEquippedStatus(instance)
      }))
    }))
  };
}

function normalizeGearSlot(slot) {
  if (!slot || !slot.name) {
    return null;
  }
  const stats = slot.stats && typeof slot.stats === 'object' ? slot.stats : {};
  return {
    name: slot.name,
    stats
  };
}

function normalizeGearPayload(gear = {}) {
  return {
    weapon: normalizeGearSlot(gear.weapon),
    shield: normalizeGearSlot(gear.shield),
    armor: {
      head: normalizeGearSlot(gear.armor?.head),
      chest: normalizeGearSlot(gear.armor?.chest),
      legs: normalizeGearSlot(gear.armor?.legs)
    }
  };
}

function getGearSlotValue(gear = {}, slotConfig) {
  if (!slotConfig) {
    return null;
  }
  return slotConfig.path.reduce((value, key) => (value ? value[key] : null), gear) || null;
}

function buildGearOptionsMarkup(character, slotKey) {
  const items = (character.inventory || [])
    .filter((item) => item && item.quantity > 0 && isItemEligibleForEquipSlot(item, slotKey))
    .slice()
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  if (!items.length) {
    return '<option value="" disabled>No eligible items</option>';
  }

  return items
    .map((item) => {
      const disabled = item.isEquipped && item.equippedSlot === slotKey;
      const labelSuffix = item.isEquipped ? ' • Equipped' : '';
      const craftingEmoji = hasCraftingObtain(item) ? `${CRAFTING_EMOJI} ` : '';
      const modifierLabel = formatItemModifierLabel(item);
      return `<option value="${item.id}" ${disabled ? 'disabled' : ''}>
        ${craftingEmoji}${item.itemName} (${formatNumber(item.quantity)})${modifierLabel}${labelSuffix}
      </option>`;
    })
    .join('');
}

const GEAR_SLOT_LABELS = {
  weapon: 'Weapon',
  shield: 'Shield',
  armor_head: 'Head Armor',
  armor_chest: 'Torso Armor',
  armor_legs: 'Leg Armor'
};

const ARMOR_SLOT_KEYWORDS = {
  armor_head: ['head', 'helmet', 'helm', 'mask', 'cap'],
  armor_chest: ['chest', 'torso', 'armor', 'shirt', 'plate'],
  armor_legs: ['legs', 'pants', 'boots', 'greaves']
};

const WEAPON_STYLE_KEYWORDS = {
  bow: ['bow', 'longbow', 'shortbow'],
  oneHanded: ['1h', 'one-handed', 'onehanded', 'single-hand', 'sword', 'dagger', 'mace', 'axe'],
  twoHanded: ['2h', 'two-handed', 'twohanded', 'greatsword', 'claymore', 'halberd', 'polearm', 'battleaxe']
};

const SHIELD_KEYWORDS = ['shield', 'buckler', 'guard'];
const STAT_KEY_LABELS = {
  modifierHearts: 'Modifier',
  attack: 'Attack',
  defense: 'Defense',
  staminaRecovered: 'Stamina Recovered',
  staminaToCraft: 'Stamina To Craft',
  rarity: 'Rarity'
};
const CRAFTING_EMOJI = '🛠️';

function collectItemTags(item = {}) {
  const toArray = (value) => {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }
    return [value];
  };

  const normalize = (value) => String(value).toLowerCase();

  const categories = new Set([
    ...toArray(item.category),
    ...toArray(item.categories),
    ...toArray(item.categoryGear)
  ].map(normalize));

  const types = new Set([
    ...toArray(item.type),
    ...toArray(item.types)
  ].map(normalize));

  const subtypes = new Set([
    ...toArray(item.subtype),
    ...toArray(item.subtypes)
  ].map(normalize));

  return { categories, types, subtypes };
}

function detectGearTypeFromTags(tags = {}, item = {}) {
  if (!tags) {
    return null;
  }
  if (tags.categories.has('armor') || item.categoryGear?.toLowerCase() === 'armor') {
    return 'armor';
  }
  if (tags.categories.has('weapon') || item.categoryGear?.toLowerCase() === 'weapon') {
    return 'weapon';
  }
  if (tags.categories.has('shield') || tags.subtypes.has('shield')) {
    return 'shield';
  }
  return null;
}

function matchKeyword(set = new Set(), keywords = []) {
  return keywords.some((keyword) => set.has(keyword));
}

function determineWeaponStyle(tags = {}) {
  if (!tags) {
    return null;
  }
  if (matchKeyword(tags.types, WEAPON_STYLE_KEYWORDS.bow)
    || matchKeyword(tags.categories, WEAPON_STYLE_KEYWORDS.bow)
    || matchKeyword(tags.subtypes, WEAPON_STYLE_KEYWORDS.bow)) {
    return 'bow';
  }
  if (matchKeyword(tags.types, WEAPON_STYLE_KEYWORDS.twoHanded)
    || matchKeyword(tags.subtypes, WEAPON_STYLE_KEYWORDS.twoHanded)) {
    return '2h';
  }
  if (matchKeyword(tags.types, WEAPON_STYLE_KEYWORDS.oneHanded)
    || matchKeyword(tags.subtypes, WEAPON_STYLE_KEYWORDS.oneHanded)) {
    return '1h';
  }
  if (tags.categories?.has('bow')) {
    return 'bow';
  }
  if (tags.categories?.has('weapon')) {
    return '1h';
  }
  return null;
}

function isShieldItem(tags = {}) {
  if (!tags) {
    return false;
  }
  return matchKeyword(tags.categories, SHIELD_KEYWORDS)
    || matchKeyword(tags.types, SHIELD_KEYWORDS)
    || matchKeyword(tags.subtypes, SHIELD_KEYWORDS);
}

function isArmorItemForSlot(tags = {}, slotKey = '') {
  if (!tags || !slotKey.startsWith('armor_')) {
    return false;
  }
  if (!tags.categories?.has('armor') && !tags.categories?.has('gear')) {
    return false;
  }
  const slotKeywords = ARMOR_SLOT_KEYWORDS[slotKey] || [];
  return matchKeyword(tags.types, slotKeywords)
    || matchKeyword(tags.subtypes, slotKeywords);
}

function findInventoryItemByName(character, itemName) {
  if (!character || !itemName) {
    return null;
  }
  return character.inventory.find((item) => item.itemName?.toLowerCase() === itemName.toLowerCase()) || null;
}

function getEquippedInventoryItem(character, slotKey) {
  if (!character || !character.gear) {
    return null;
  }
  let equippedName = null;
  if (slotKey === 'weapon') {
    equippedName = character.gear.weapon?.name;
  } else if (slotKey === 'shield') {
    equippedName = character.gear.shield?.name;
  } else if (slotKey.startsWith('armor_')) {
    const armorPart = slotKey.split('_')[1];
    equippedName = character.gear.armor?.[armorPart]?.name;
  }
  if (!equippedName) {
    return null;
  }
  return findInventoryItemByName(character, equippedName);
}

function getWeaponStyleForCharacter(character) {
  const equippedWeapon = getEquippedInventoryItem(character, 'weapon');
  if (!equippedWeapon) {
    return null;
  }
  return determineWeaponStyle(collectItemTags(equippedWeapon));
}

function getWeaponStyleLabel(item = {}) {
  const catalogItem = getCatalogItem(item.itemName) || {};
  const tags = collectItemTags({ ...catalogItem, ...item });
  const style = determineWeaponStyle(tags) || getWeaponStyleFromItem(catalogItem);
  if (!style) {
    return null;
  }
  if (style === '1h') {
    return '1H';
  }
  if (style === '2h') {
    return '2H';
  }
  return style === 'bow' ? 'Bow' : null;
}

function getWeaponStyleFromItem(item = {}) {
  const typeArray = Array.isArray(item.type) ? item.type : [item.type].filter(Boolean);
  const types = typeArray.map((entry) => String(entry).toLowerCase());
  if (types.includes('bow')) {
    return 'bow';
  }
  if (types.includes('2h') || types.includes('two-handed')) {
    return '2h';
  }
  if (types.includes('1h') || types.includes('one-handed')) {
    return '1h';
  }
  return null;
}

function validateGearEquipAction(character, slotKey, inventoryItem) {
  if (!character || !inventoryItem) {
    return { valid: false, message: 'Unable to find that gear in the selected character inventory.' };
  }

  const tags = collectItemTags(inventoryItem);
  const slotLabel = GEAR_SLOT_LABELS[slotKey] || 'Gear';

  if (slotKey === 'weapon') {
    const weaponStyle = determineWeaponStyle(tags);
    if (!weaponStyle) {
      return {
        valid: false,
        message: `${inventoryItem.itemName} is not recognized as a weapon that can be equipped in the Weapon slot.`
      };
    }

    const currentShield = getEquippedInventoryItem(character, 'shield');
    const currentWeapon = getEquippedInventoryItem(character, 'weapon');
    const currentWeaponStyle = determineWeaponStyle(collectItemTags(currentWeapon || {}));
    const replacingCurrentWeapon = currentWeapon?.id === inventoryItem.id;

    if (weaponStyle === 'bow') {
      if (currentShield) {
        return {
          valid: false,
          message: `You can't equip a bow while ${currentShield.itemName} is equipped as a shield. Unequip the shield first.`
        };
      }
      if (currentWeapon && !replacingCurrentWeapon && currentWeaponStyle && currentWeaponStyle !== 'bow') {
        return {
          valid: false,
          message: `Bows replace all melee weapons. Unequip ${currentWeapon.itemName} before swapping to a bow.`
        };
      }
      return {
        valid: true,
        notice: 'Bows include unlimited standard arrows. Specialty arrows must still be crafted.'
      };
    }

    if (weaponStyle === '2h') {
      if (currentShield) {
        return {
          valid: false,
          message: `Two-handed weapons cannot be used with shields. Unequip ${currentShield.itemName} first.`
        };
      }
      if (currentWeapon && !replacingCurrentWeapon && currentWeaponStyle === 'bow') {
        return {
          valid: false,
          message: `Swapping from a bow to a two-handed weapon requires unequipping the bow first.`
        };
      }
      return { valid: true };
    }

    if (weaponStyle === '1h') {
      if (currentWeapon && !replacingCurrentWeapon && currentWeaponStyle === '2h') {
        return {
          valid: false,
          message: `Unequip your two-handed weapon before switching to a one-handed weapon.`
        };
      }
      if (currentWeapon && !replacingCurrentWeapon && currentWeaponStyle === 'bow') {
        return {
          valid: false,
          message: `You can't dual-wield a bow and a melee weapon. Unequip the bow first.`
        };
      }
      return { valid: true };
    }

    return {
      valid: false,
      message: `${inventoryItem.itemName} can't be matched to a valid melee or ranged weapon style.`
    };
  }

  if (slotKey === 'shield') {
    if (!isShieldItem(tags)) {
      return {
        valid: false,
        message: `${inventoryItem.itemName} is not recognized as a shield.`
      };
    }
    const currentWeaponStyle = getWeaponStyleForCharacter(character);
    if (currentWeaponStyle === '2h') {
      return {
        valid: false,
        message: 'Two-handed weapons already occupy both hands. Unequip the two-handed weapon before adding a shield.'
      };
    }
    if (currentWeaponStyle === 'bow') {
      return {
        valid: false,
        message: 'Bows require both hands and cannot be paired with shields.'
      };
    }
    return { valid: true };
  }

  if (slotKey.startsWith('armor_')) {
    if (isArmorItemForSlot(tags, slotKey)) {
      return { valid: true };
    }
    return {
      valid: false,
      message: `${inventoryItem.itemName} is not classified as ${slotLabel}.`
    };
  }

  return { valid: true };
}

function isItemEligibleForEquipSlot(item, slotKey) {
  if (!item || !slotKey) {
    return false;
  }
  const tags = collectItemTags(item);
  const gearType = detectGearTypeFromTags(tags, item);
  if (slotKey === 'weapon') {
    if (isShieldItem(tags)) {
      return false;
    }
    return Boolean(determineWeaponStyle(tags));
  }
  if (slotKey === 'shield') {
    return isShieldItem(tags) || gearType === 'shield';
  }
  if (slotKey.startsWith('armor_')) {
    return gearType === 'armor' && isArmorItemForSlot(tags, slotKey);
  }
  return true;
}

function hasCraftingObtain(item = {}) {
  const values = [];
  if (Array.isArray(item.obtain)) {
    values.push(...item.obtain);
  } else if (typeof item.obtain === 'string') {
    values.push(item.obtain);
  }
  if (Array.isArray(item.obtainTags)) {
    values.push(...item.obtainTags);
  }
  return values
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .some((value) => value === 'crafting' || value.includes('crafted'));
}

function getItemStatsObject(item = {}) {
  if (!item) {
    return {};
  }
  if (item.stats && typeof item.stats === 'object') {
    if (typeof item.stats.toObject === 'function') {
      return item.stats.toObject();
    }
    if (item.stats instanceof Map) {
      return Object.fromEntries(item.stats.entries());
    }
    if (Array.isArray(item.stats)) {
      return item.stats.reduce((acc, entry) => {
        if (entry && entry.key) {
          acc[entry.key] = entry.value;
        }
        return acc;
      }, {});
    }
    return { ...item.stats };
  }
  const stats = {};
  Object.keys(STAT_KEY_LABELS).forEach((key) => {
    const value = Number(item[key]);
    if (Number.isFinite(value)) {
      stats[key] = value;
    }
  });
  return stats;
}

function getPrimaryModifierValue(item = {}) {
  const stats = getItemStatsObject(item);
  const catalogItem = getCatalogItem(item.itemName) || {};
  const catalogStats = getItemStatsObject(catalogItem);
  const raw = Number(
    stats.modifierHearts
    ?? item.modifierHearts
    ?? catalogStats.modifierHearts
    ?? catalogItem.modifierHearts
    ?? item.stats?.modifierHearts
    ?? (typeof item.stats?.get === 'function' ? item.stats.get('modifierHearts') : undefined)
  );
  return Number.isFinite(raw) ? raw : 0;
}

function formatItemModifierLabel(item) {
  const value = getPrimaryModifierValue(item);
  const displayValue = Number.isFinite(value) ? value : 0;
  const style = getWeaponStyleLabel(item);
  const parts = [`Modifier ${formatNumber(displayValue)}`];
  if (style) {
    parts.push(style);
  }
  return ` | ${parts.join(' • ')}`;
}

function markInventoryEquippedFromGear(normalizedInventory = [], gear = {}) {
  if (!Array.isArray(normalizedInventory) || !normalizedInventory.length || !gear) {
    return;
  }

  const markSlot = (slotKey, gearEntry) => {
    if (!gearEntry || !gearEntry.name) {
      return;
    }
    const match = normalizedInventory.find(
      (item) => item.itemName?.toLowerCase() === gearEntry.name.toLowerCase()
    );
    if (match) {
      match.isEquipped = true;
      match.equippedSlot = slotKey;
    }
  };

  markSlot('weapon', gear.weapon);
  markSlot('shield', gear.shield);
  markSlot('armor_head', gear.armor?.head);
  markSlot('armor_chest', gear.armor?.chest);
  markSlot('armor_legs', gear.armor?.legs);
}

document.addEventListener('DOMContentLoaded', async () => {
  await checkUserAuthStatus();
  canManageInventory = Boolean(isAdminUser);

  if (!authState) {
    window.location.href = '/login?returnTo=/inventories.html';
    return;
  }

  await ensureItemCatalog();
  initializeEventListeners();
  await loadInventories();
});

async function ensureItemCatalog() {
  if (inventoryState.itemCatalogLoaded) {
    return;
  }
  try {
    const response = await fetch('/api/items', { credentials: 'include' });
    if (!response.ok) {
      throw new Error('Failed to load item catalog');
    }
    const items = await response.json();
    const catalog = new Map();
    (items || []).forEach((item) => {
      if (item?.itemName) {
        catalog.set(item.itemName.toLowerCase(), item);
      }
    });
    inventoryState.itemCatalog = catalog;
    inventoryState.itemCatalogLoaded = true;
  } catch (error) {
    console.error('[inventories.js]: Unable to load item catalog', error);
    showToast('Some item metadata could not be loaded. Modifiers may be unavailable.', 'error');
  }
}

function getCatalogItem(itemName) {
  if (!itemName || !inventoryState.itemCatalog?.size) {
    return null;
  }
  return inventoryState.itemCatalog.get(itemName.toLowerCase()) || null;
}

function initializeEventListeners() {
  const searchInput = document.getElementById('inventory-search-input');
  const categoryFilter = document.getElementById('inventory-category-filter');
  const characterFilter = document.getElementById('inventory-character-filter');
  const refreshButton = document.getElementById('refresh-inventory-button');
  const transferForm = document.getElementById('transfer-form');
  const transferSourceSelect = document.getElementById('transfer-source-select');
  const transferItemSelect = document.getElementById('transfer-item-select');
  const managementForm = document.getElementById('item-management-form');
  const closeDrawerButton = document.getElementById('close-management-drawer');
  const deleteItemButton = document.getElementById('delete-item-button');

  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      inventoryState.filters.search = event.target.value.trim().toLowerCase();
      inventoryState.aggregatedView.page = 1;
      renderAggregatedTable();
    });
  }

  if (categoryFilter) {
    categoryFilter.addEventListener('change', (event) => {
      inventoryState.filters.category = event.target.value;
      inventoryState.aggregatedView.page = 1;
      renderAggregatedTable();
    });
  }

  if (characterFilter) {
    characterFilter.addEventListener('change', (event) => {
      inventoryState.filters.character = event.target.value;
      inventoryState.aggregatedView.page = 1;
      renderAggregatedTable();
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => loadInventories());
  }

  if (transferForm) {
    transferForm.addEventListener('submit', handleTransferSubmit);
  }

  if (transferSourceSelect) {
    transferSourceSelect.addEventListener('change', (event) => {
      populateTransferItemsForCharacter(event.target.value);
    });
  }

  if (transferItemSelect) {
    transferItemSelect.addEventListener('change', handleTransferItemChange);
  }

  if (canManageInventory) {
    if (managementForm) {
      managementForm.addEventListener('submit', handleManagementSave);
    }

    if (closeDrawerButton) {
      closeDrawerButton.addEventListener('click', closeManagementDrawer);
    }

    if (deleteItemButton) {
      deleteItemButton.addEventListener('click', handleDeleteItem);
    }
  } else {
    const drawer = document.getElementById('item-management-drawer');
    if (drawer) {
      drawer.remove();
    }
  }

  const collapseToggle = document.getElementById('aggregated-collapse-toggle');
  if (collapseToggle) {
    collapseToggle.addEventListener('click', () => {
      inventoryState.aggregatedView.collapsed = !inventoryState.aggregatedView.collapsed;
      updateAggregatedCollapseUI();
      renderAggregatedTable();
    });
  }

  const prevButton = document.getElementById('aggregated-prev');
  if (prevButton) {
    prevButton.addEventListener('click', () => changeAggregatedPage(-1));
  }

  const nextButton = document.getElementById('aggregated-next');
  if (nextButton) {
    nextButton.addEventListener('click', () => changeAggregatedPage(1));
  }
}

async function loadInventories(showLoader = true) {
  try {
    if (showLoader) {
      setLoading(true);
    }

    const response = await fetch('/api/inventories/me', { credentials: 'include' });

    if (response.status === 401) {
      window.location.href = '/login?returnTo=/inventories.html';
      return;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to load inventories');
    }

    const data = await response.json();
    inventoryState.characters = (data.characters || []).map(normalizeCharacter);
    inventoryState.aggregates = decorateAggregatesWithEquippedFlag(data.aggregates || inventoryState.aggregates);
    recomputeAggregatesFromState();
    inventoryState.aggregatedView.page = 1;

    renderSummary();
    populateFilters();
    renderAggregatedTable();
    renderCharacterGrid();
    populateTransferSelects();
    showToast('Inventories refreshed', 'success');
  } catch (error) {
    console.error('[inventories.js]: Error loading inventories:', error);
    showToast(error.message || 'Failed to load inventories', 'error');
  } finally {
    if (showLoader) {
      setLoading(false);
    }
  }
}

function normalizeCharacter(character) {
  const normalizedInventory = (character.inventory || []).map((item) => {
    const normalizedItem = {
      ...item,
      id: item.id
        || item._id
        || (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `inv-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      characterId: item.characterId || character.id,
      quantity: Number(item.quantity) || 0,
      subtype: Array.isArray(item.subtype)
        ? item.subtype
        : item.subtype
          ? [item.subtype]
          : []
    };
    normalizedItem.isEquipped = detectEquippedStatus(normalizedItem);
    return normalizedItem;
  });

  const normalizedGear = normalizeGearPayload(character.gear || {});
  markInventoryEquippedFromGear(normalizedInventory, normalizedGear);

  return {
    id: character.id || character._id?.toString?.() || '',
    name: character.name,
    icon: character.icon,
    job: character.job,
    race: character.race,
    homeVillage: character.homeVillage,
    currentVillage: character.currentVillage,
    totalQuantity: character.totalQuantity ?? normalizedInventory.reduce((sum, item) => sum + item.quantity, 0),
    uniqueItems: character.uniqueItems ?? normalizedInventory.length,
    categories: character.categories || [],
    inventory: normalizedInventory,
    gear: normalizedGear
  };
}

function renderSummary() {
  const totalItemsElement = document.getElementById('summary-total-items');
  const uniqueItemsElement = document.getElementById('summary-unique-items');
  const characterCountElement = document.getElementById('summary-character-count');

  if (totalItemsElement) {
    totalItemsElement.textContent = formatNumber(inventoryState.aggregates.totalQuantity || 0);
  }
  if (uniqueItemsElement) {
    uniqueItemsElement.textContent = formatNumber(inventoryState.aggregates.uniqueItems || 0);
  }
  if (characterCountElement) {
    characterCountElement.textContent = formatNumber(inventoryState.characters.length);
  }
}

function populateFilters() {
  const categoryFilter = document.getElementById('inventory-category-filter');
  const characterFilter = document.getElementById('inventory-character-filter');

  if (categoryFilter) {
    const categories = new Set();
    (inventoryState.aggregates.items || []).forEach((item) => {
      (item.categories || []).forEach((category) => categories.add(category));
    });

    const currentValue = inventoryState.filters.category;
    categoryFilter.innerHTML = '<option value="all">All categories</option>';
    Array.from(categories)
      .sort((a, b) => a.localeCompare(b))
      .forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
      });
    categoryFilter.value = categories.has(currentValue) ? currentValue : 'all';
    inventoryState.filters.category = categoryFilter.value;
  }

  if (characterFilter) {
    const currentValue = inventoryState.filters.character;
    characterFilter.innerHTML = '<option value="all">All characters</option>';
    inventoryState.characters
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((character) => {
        const option = document.createElement('option');
        option.value = character.id;
        option.textContent = character.name;
        characterFilter.appendChild(option);
      });

    const hasValue = inventoryState.characters.some((char) => char.id === currentValue);
    characterFilter.value = hasValue ? currentValue : 'all';
    inventoryState.filters.character = characterFilter.value;
  }
}

function renderAggregatedTable() {
  const tableBody = document.getElementById('aggregated-items-body');

  if (!tableBody) {
    return;
  }

  const filteredItems = (inventoryState.aggregates.items || []).filter((item) => {
    if (!item || (item.totalQuantity || 0) <= 0) {
      return false;
    }
    const matchesSearch = inventoryState.filters.search
      ? item.itemName.toLowerCase().includes(inventoryState.filters.search)
      : true;
    const matchesCategory = inventoryState.filters.category === 'all'
      ? true
      : (item.categories || []).includes(inventoryState.filters.category);
    const matchesCharacter = inventoryState.filters.character === 'all'
      ? true
      : (item.instances || []).some((instance) => instance.characterId === inventoryState.filters.character);
    return matchesSearch && matchesCategory && matchesCharacter;
  });

  inventoryState.aggregatedView.totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / inventoryState.aggregatedView.pageSize));
  inventoryState.aggregatedView.page = Math.min(inventoryState.aggregatedView.page, totalPages);
  inventoryState.aggregatedView.page = Math.max(inventoryState.aggregatedView.page, 1);

  if (!filteredItems.length) {
    tableBody.innerHTML = '<tr class="empty-row"><td colspan="6">No items match your filters.</td></tr>';
    updateAggregatedCollapseUI();
    updateAggregatedPaginationControls(totalPages);
    return;
  }

  if (inventoryState.aggregatedView.collapsed) {
    tableBody.innerHTML = '';
    updateAggregatedCollapseUI();
    updateAggregatedPaginationControls(totalPages);
    return;
  }

  const startIndex = (inventoryState.aggregatedView.page - 1) * inventoryState.aggregatedView.pageSize;
  const pageItems = filteredItems.slice(startIndex, startIndex + inventoryState.aggregatedView.pageSize);

  tableBody.innerHTML = '';

  pageItems.forEach((item) => {
    const instancesMarkup = (item.instances || [])
      .map((instance) => {
        const badgeColor = getCharacterColor(instance.characterId || instance.characterName || '');
        const equippedClass = instance.isEquipped ? ' equipped-instance' : '';
        const equippedTitle = instance.isEquipped ? ' title="Equipped items cannot be transferred"' : '';
        const lockMarkup = instance.isEquipped ? '<i class="fas fa-lock badge-lock" aria-hidden="true"></i>' : '';
        return `
          <li class="character-instance-badge${equippedClass}" style="--badge-color:${badgeColor}"${equippedTitle}>
            ${lockMarkup}
            <span class="instance-name">${instance.characterName}</span>
            <span class="instance-quantity">${formatNumber(instance.quantity)}</span>
          </li>
        `;
      })
      .join('');
    const hasTransferableInstance = (item.instances || []).some(
      (instance) => getTransferableQuantity(instance) > 0
    );
    const transferButtonAttributes = hasTransferableInstance
      ? ''
      : 'disabled aria-disabled="true" title="Equipped items cannot be transferred"';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="item-cell">
          ${item.image ? `<img src="${item.image}" alt="${item.itemName} icon" />` : '<div class="item-placeholder"></div>'}
          <div class="item-meta">
            <span>${item.itemName}</span>
            <span>${item.instances?.length || 0} holder(s)</span>
          </div>
        </div>
      </td>
      <td>${formatNumber(item.totalQuantity || 0)}</td>
      <td>
        <ul class="instance-list">
          ${instancesMarkup}
        </ul>
      </td>
      <td>${item.categories?.join(', ') || '—'}</td>
      <td>${item.types?.join(', ') || '—'}</td>
      <td>
        <button type="button" class="prefill-transfer-button" data-item-name="${item.itemName}" ${transferButtonAttributes}>
          <i class="fas fa-magic" aria-hidden="true"></i>
          Quick Transfer
        </button>
      </td>
    `;

    const prefillButton = row.querySelector('.prefill-transfer-button');
    if (prefillButton) {
      prefillButton.addEventListener('click', () => prefillTransferFromAggregate(item));
    }

    tableBody.appendChild(row);
  });

  updateAggregatedCollapseUI();
  updateAggregatedPaginationControls(totalPages);
}

function renderCharacterGrid() {
  const grid = document.getElementById('character-inventory-grid');

  if (!grid) {
    return;
  }

  if (!inventoryState.characters.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-box-open"></i>
        <p>No character inventories found. Refresh to load data.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = '';

  inventoryState.characters.forEach((character) => {
    const card = document.createElement('article');
    card.className = 'character-card';
    card.innerHTML = `
      <header>
        <img src="${character.icon || '/images/ankleicon.png'}" alt="${character.name} icon">
        <div>
          <h3>${character.name}</h3>
          <p>${character.job || 'No job'} • ${character.currentVillage || 'Unknown village'}</p>
        </div>
      </header>
      <div class="character-stats">
        <span><strong>${formatNumber(character.totalQuantity)}</strong>Total items</span>
        <span><strong>${formatNumber(character.uniqueItems)}</strong>Unique</span>
      </div>
      <div class="table-wrapper">
        <div class="table-scroll">
          <table class="character-items-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    const tableBody = card.querySelector('tbody');
    const sortedItems = character.inventory
      .filter((item) => (item.quantity || 0) > 0)
      .slice()
      .sort((a, b) => b.quantity - a.quantity);

    if (!sortedItems.length && tableBody) {
      tableBody.innerHTML = '<tr><td colspan="2">No items logged yet.</td></tr>';
    } else {
      sortedItems.forEach((item) => {
        const row = document.createElement('tr');
        const lockMarkup = item.isEquipped ? '<i class="fas fa-lock row-lock" aria-hidden="true"></i>' : '';
        const craftingEmoji = hasCraftingObtain(item)
          ? `<span class="crafting-emoji" title="Crafted item" aria-label="Crafted item">${CRAFTING_EMOJI}</span>`
          : '';
        row.innerHTML = `
          <td>
            <span class="item-name-with-lock">
              ${lockMarkup}
              ${craftingEmoji}
              ${item.itemName}
            </span>
          </td>
          <td>${formatNumber(item.quantity)}</td>
        `;
        tableBody?.appendChild(row);
      });
    }

    grid.appendChild(card);
  });

  renderEquippedGearSummary();
}

function renderEquippedGearSummary() {
  const container = document.getElementById('equipped-gear-content');
  if (!container) {
    return;
  }

  if (!inventoryState.characters.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-shield-alt"></i>
        <p>No characters found. Refresh to load inventory data.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  inventoryState.characters.forEach((character) => {
    const group = document.createElement('article');
    group.className = 'equipped-gear-group';

    const slotsMarkup = GEAR_SLOT_CONFIG.map((config) => {
      const gearValue = getGearSlotValue(character.gear, config);
      const statsMarkup = gearValue ? formatGearStatsMarkup(gearValue.stats) : '';
      const optionsMarkup = buildGearOptionsMarkup(character, config.slot);

      return `
        <li>
          <div class="gear-slot-details">
            <span class="gear-item-slot">${config.label}</span>
            <span class="gear-item-name">
              <i class="fas fa-lock" aria-hidden="true"></i>
              ${gearValue ? gearValue.name : 'None equipped'}
            </span>
            ${gearValue && statsMarkup ? statsMarkup : ''}
          </div>
          <div class="gear-equip-control">
            <select class="gear-equip-select" data-character="${character.id}" data-slot="${config.slot}">
              <option value="">Equip from inventory</option>
              ${optionsMarkup}
            </select>
            <button type="button" class="gear-equip-button" data-character="${character.id}" data-slot="${config.slot}" disabled>
              Equip
            </button>
            <button type="button" class="gear-unequip-button" data-character="${character.id}" data-slot="${config.slot}" ${gearValue ? '' : 'disabled'}>
              Unequip
            </button>
          </div>
        </li>
      `;
    }).join('');

    group.innerHTML = `
      <header>
        <img src="${character.icon || '/images/ankleicon.png'}" alt="${character.name} avatar">
        <div>
          <h3>${character.name}</h3>
          <p>${character.job || 'No job'} • ${character.currentVillage || 'Unknown village'}</p>
        </div>
      </header>
      <ul class="gear-item-list">
        ${slotsMarkup}
      </ul>
    `;

    container.appendChild(group);
  });

  initializeGearEquipControls(container);
}

function formatGearStatsMarkup(stats = {}) {
  const entries = Object.entries(stats || {}).filter(([, value]) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue !== 0;
  });

  if (!entries.length) {
    return '';
  }

  const formattedStats = entries
    .map(([key, value]) => {
      const label = STAT_KEY_LABELS[key] || formatGearStatKey(key);
      return `${label} ${Number(value)}`;
    })
    .join(' • ');

  return `<span class="gear-item-stats">${formattedStats}</span>`;
}

function formatGearStatKey(key = '') {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function initializeGearEquipControls(container) {
  container.querySelectorAll('.gear-equip-select').forEach((select) => {
    select.addEventListener('change', handleGearEquipSelectChange);
  });

  container.querySelectorAll('.gear-equip-button').forEach((button) => {
    button.addEventListener('click', handleGearEquipButtonClick);
  });

  container.querySelectorAll('.gear-unequip-button').forEach((button) => {
    button.addEventListener('click', handleGearUnequipButtonClick);
  });
}

function handleGearEquipSelectChange(event) {
  const select = event.target;
  const wrapper = select.closest('.gear-equip-control');
  const button = wrapper?.querySelector('.gear-equip-button');
  if (button) {
    button.disabled = !select.value;
  }
}

async function handleGearEquipButtonClick(event) {
  const button = event.currentTarget;
  const wrapper = button.closest('.gear-equip-control');
  const select = wrapper?.querySelector('.gear-equip-select');

  if (!select || !select.value) {
    return;
  }

  const characterId = button.dataset.character;
  const slot = button.dataset.slot;
  const inventoryId = select.value;
  const character = inventoryState.characters.find((char) => char.id === characterId);
  const inventoryItem = character?.inventory.find((item) => item.id === inventoryId);

  const originalLabel = button.innerHTML;
  button.disabled = true;

  if (!character || !inventoryItem) {
    showToast('Unable to locate that character or item. Refresh and try again.', 'error');
    button.disabled = false;
    return;
  }

  const validation = validateGearEquipAction(character, slot, inventoryItem);
  if (!validation.valid) {
    showToast(validation.message || 'That item cannot be equipped in this slot.', 'error');
    button.disabled = false;
    return;
  }

  if (validation.notice) {
    showToast(validation.notice, 'info');
  }

  button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';

  let equipSucceeded = false;
  try {
    const response = await fetch(`/api/characters/${characterId}/gear`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ slot, inventoryId })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to equip gear');
    }

    const data = await response.json();
    updateCharacterGearInState(characterId, data.gear);
    markInventoryEquippedState(characterId, data.equippedInventoryId, data.clearedInventoryIds, data.slot);
    recomputeAggregatesFromState();
    renderSummary();
    renderAggregatedTable();
    renderCharacterGrid();
    showToast('Gear equipped', 'success');
    equipSucceeded = true;
  } catch (error) {
    console.error('[inventories.js]: Equip error:', error);
    showToast(error.message || 'Failed to equip gear', 'error');
  } finally {
    button.innerHTML = originalLabel;
    button.disabled = true;
    if (equipSucceeded) {
      select.value = '';
    }
  }
}

async function handleGearUnequipButtonClick(event) {
  const button = event.currentTarget;
  const characterId = button.dataset.character;
  const slot = button.dataset.slot;

  const originalLabel = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';

  try {
    const response = await fetch(`/api/characters/${characterId}/gear`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ slot, inventoryId: null })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to unequip gear');
    }

    const data = await response.json();
    updateCharacterGearInState(characterId, data.gear);
    markInventoryEquippedState(characterId, data.equippedInventoryId, data.clearedInventoryIds, data.slot);
    recomputeAggregatesFromState();
    renderSummary();
    renderAggregatedTable();
    renderCharacterGrid();
    showToast('Gear unequipped', 'success');
  } catch (error) {
    console.error('[inventories.js]: Unequip error:', error);
    showToast(error.message || 'Failed to unequip gear', 'error');
  } finally {
    button.innerHTML = originalLabel;
  }
}

function populateTransferSelects() {
  const sourceSelect = document.getElementById('transfer-source-select');
  const destinationSelect = document.getElementById('transfer-destination-select');

  if (!sourceSelect || !destinationSelect) {
    return;
  }

  sourceSelect.innerHTML = '<option value="">Select character</option>';
  destinationSelect.innerHTML = '<option value="">Select character</option>';

  inventoryState.characters
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((character) => {
      const sourceOption = document.createElement('option');
      sourceOption.value = character.id;
      sourceOption.textContent = character.name;
      sourceSelect.appendChild(sourceOption);

      const destinationOption = sourceOption.cloneNode(true);
      destinationSelect.appendChild(destinationOption);
    });

  populateTransferItemsForCharacter(sourceSelect.value);
}

function populateTransferItemsForCharacter(characterId) {
  const itemSelect = document.getElementById('transfer-item-select');
  const quantityInput = document.getElementById('transfer-quantity');

  if (!itemSelect) {
    return;
  }

  if (!characterId) {
    itemSelect.innerHTML = '<option value="">Select a character first</option>';
    itemSelect.disabled = true;
    if (quantityInput) {
      quantityInput.value = '';
    }
    return;
  }

  const character = inventoryState.characters.find((char) => char.id === characterId);
  if (!character) {
    itemSelect.innerHTML = '<option value="">No items available</option>';
    itemSelect.disabled = true;
    return;
  }

  if (!character.inventory.length) {
    itemSelect.innerHTML = '<option value="">No items available</option>';
    itemSelect.disabled = true;
    return;
  }

  itemSelect.disabled = false;
  itemSelect.innerHTML = '';
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = 'Select item';
  itemSelect.appendChild(placeholderOption);

  let hasTransferableItem = false;
  character.inventory
    .filter((item) => (item.quantity || 0) > 0)
    .slice()
    .sort((a, b) => a.itemName.localeCompare(b.itemName))
    .forEach((item) => {
      const available = getTransferableQuantity(item);
      const option = document.createElement('option');
      option.value = item.id;
      option.dataset.available = String(available);
      option.dataset.total = String(item.quantity || 0);
      const equippedText = item.isEquipped ? ' • 1 equipped' : '';
      const craftingEmoji = hasCraftingObtain(item) ? `${CRAFTING_EMOJI} ` : '';
      option.textContent = `${craftingEmoji}${item.itemName} (${formatNumber(available)} free / ${formatNumber(item.quantity)} total)${equippedText}`;
      if (available <= 0) {
        option.disabled = true;
        option.dataset.equipped = 'true';
      } else {
        hasTransferableItem = true;
      }
      itemSelect.appendChild(option);
    });

  if (!hasTransferableItem) {
    placeholderOption.textContent = 'No transferable items (all equipped)';
  }

  itemSelect.value = '';
  if (quantityInput) {
    quantityInput.value = '';
    quantityInput.removeAttribute('max');
  }
}

function handleTransferItemChange(event) {
  const select = event.target;
  const quantityInput = document.getElementById('transfer-quantity');
  if (!quantityInput) {
    return;
  }
  const option = select.options[select.selectedIndex];
  if (!option) {
    quantityInput.removeAttribute('max');
    return;
  }
  const available = Number(option.dataset.available);
  if (Number.isFinite(available) && available > 0) {
    quantityInput.max = available;
    if (!quantityInput.value || Number(quantityInput.value) > available) {
      quantityInput.value = available;
    }
  } else {
    quantityInput.removeAttribute('max');
  }
}

async function handleTransferSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const sourceCharacterId = form.querySelector('#transfer-source-select')?.value;
  const itemId = form.querySelector('#transfer-item-select')?.value;
  const targetCharacterId = form.querySelector('#transfer-destination-select')?.value;
  const quantityValue = Number(form.querySelector('#transfer-quantity')?.value);

  if (!sourceCharacterId || !itemId || !targetCharacterId || !Number.isFinite(quantityValue) || quantityValue <= 0) {
    showToast('Complete all transfer fields.', 'error');
    return;
  }

  if (sourceCharacterId === targetCharacterId) {
    showToast('Choose a different destination character.', 'error');
    return;
  }

  const sourceCharacter = inventoryState.characters.find((char) => char.id === sourceCharacterId);
  const selectedItem = sourceCharacter?.inventory.find((item) => item.id === itemId);
  if (!selectedItem) {
    showToast('Selected item could not be found for this character.', 'error');
    return;
  }

  const transferableQuantity = getTransferableQuantity(selectedItem);
  if (transferableQuantity <= 0) {
    showToast('All copies of this item are currently locked by equipped gear.', 'error');
    return;
  }
  if (quantityValue > transferableQuantity) {
    showToast(`You can transfer at most ${transferableQuantity} (one is equipped).`, 'error');
    return;
  }

  try {
    form.querySelector('button[type="submit"]').disabled = true;
    const response = await fetch('/api/inventories/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        sourceCharacterId,
        targetCharacterId,
        itemId,
        quantity: quantityValue
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Transfer failed');
    }

    const data = await response.json();
    applyTransferToState(data.transfer);
    recomputeAggregatesFromState();
    renderSummary();
    renderAggregatedTable();
    renderCharacterGrid();
    populateTransferSelects();
    form.reset();
    showToast('Transfer completed!', 'success');
  } catch (error) {
    console.error('[inventories.js]: Transfer error:', error);
    showToast(error.message || 'Transfer failed', 'error');
  } finally {
    form.querySelector('button[type="submit"]').disabled = false;
  }
}

function applyTransferToState(transfer) {
  if (!transfer) {
    return;
  }

  const sourceCharacter = inventoryState.characters.find((char) => char.id === transfer.sourceCharacterId);
  if (sourceCharacter) {
    if (transfer.sourceItem) {
      const sourceItemIndex = sourceCharacter.inventory.findIndex((item) => item.id === transfer.sourceItem.id);
      if (sourceItemIndex >= 0) {
        sourceCharacter.inventory[sourceItemIndex] = {
          ...sourceCharacter.inventory[sourceItemIndex],
          ...transfer.sourceItem
        };
      }
    } else if (transfer.sourceInventoryId) {
      sourceCharacter.inventory = sourceCharacter.inventory.filter(
        (item) => item.id !== transfer.sourceInventoryId
      );
    }
  }

  const destinationCharacter = inventoryState.characters.find((char) => char.id === transfer.targetCharacterId);
  if (destinationCharacter && transfer.destinationItem) {
    const existingIndex = destinationCharacter.inventory.findIndex(
      (item) => item.id === transfer.destinationItem.id
    );
    if (existingIndex >= 0) {
      destinationCharacter.inventory[existingIndex] = {
        ...destinationCharacter.inventory[existingIndex],
        ...transfer.destinationItem
      };
    } else {
      destinationCharacter.inventory.push(transfer.destinationItem);
    }
  }
}

function updateCharacterGearInState(characterId, gearPayload) {
  const character = inventoryState.characters.find((char) => char.id === characterId);
  if (character) {
    character.gear = normalizeGearPayload(gearPayload || {});
  }
}

function markInventoryEquippedState(characterId, equippedInventoryId, clearedInventoryIds = [], slotKey) {
  const character = inventoryState.characters.find((char) => char.id === characterId);
  if (!character) {
    return;
  }

  const resetItem = (itemId) => {
    const inventoryItem = character.inventory.find((item) => item.id === itemId);
    if (inventoryItem) {
      inventoryItem.isEquipped = false;
      delete inventoryItem.equippedSlot;
    }
  };

  clearedInventoryIds.forEach((id) => resetItem(id));

  if (equippedInventoryId) {
    const equippedItem = character.inventory.find((item) => item.id === equippedInventoryId);
    if (equippedItem) {
      equippedItem.isEquipped = true;
      equippedItem.equippedSlot = slotKey;
    }
  }
}

function prefillTransferFromAggregate(item) {
  const sourceSelect = document.getElementById('transfer-source-select');
  const itemSelect = document.getElementById('transfer-item-select');

  if (!sourceSelect || !item.instances?.length) {
    return;
  }

  const transferableInstance = item.instances.find(
    (instance) => getTransferableQuantity(instance) > 0
  );
  if (!transferableInstance || !transferableInstance.inventoryId) {
    showToast('No transferable quantity available for this item.', 'error');
    return;
  }

  sourceSelect.value = transferableInstance.characterId;
  populateTransferItemsForCharacter(transferableInstance.characterId);
  if (itemSelect) {
    const matchingOption = Array.from(itemSelect.options || []).find(
      (option) => option.value === transferableInstance.inventoryId && !option.disabled
    );
    if (matchingOption) {
      itemSelect.value = matchingOption.value;
      handleTransferItemChange({ target: itemSelect });
    } else {
      itemSelect.value = '';
      showToast('Select a non-equipped item to transfer.', 'error');
      return;
    }
  }
  const quantityInput = document.getElementById('transfer-quantity');
  if (quantityInput) {
    quantityInput.value = getTransferableQuantity(transferableInstance) || 1;
  }
  showToast(`Prefilled transfer for ${item.itemName}`, 'success');
}

function openManagementDrawer(characterId, itemId) {
  if (!canManageInventory) {
    showToast('Inventory editing is limited to staff members.', 'error');
    return;
  }
  const drawer = document.getElementById('item-management-drawer');
  const character = inventoryState.characters.find((char) => char.id === characterId);
  if (!drawer || !character) {
    return;
  }

  const item = character.inventory.find((inv) => inv.id === itemId);
  if (!item) {
    showToast('Item not found for this character.', 'error');
    return;
  }

  selectedItemContext = { characterId, itemId };

  document.getElementById('management-character-id').value = characterId;
  document.getElementById('management-item-id').value = itemId;
  document.getElementById('management-item-name').textContent = item.itemName;
  document.getElementById('management-character-name').textContent = character.name;
  document.getElementById('management-quantity').value = item.quantity;
  document.getElementById('management-location').value = item.location || '';
  document.getElementById('management-job').value = item.job || '';
  document.getElementById('management-perk').value = item.perk || '';
  document.getElementById('management-obtain').value = item.obtain || '';
  document.getElementById('management-notes').value = item.notes || '';
  document.getElementById('management-fortune').checked = Boolean(item.fortuneTellerBoost);

  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
}

function closeManagementDrawer() {
  const drawer = document.getElementById('item-management-drawer');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  selectedItemContext = null;
}

async function handleManagementSave(event) {
  event.preventDefault();
  if (!canManageInventory) {
    showToast('Inventory editing is limited to staff members.', 'error');
    return;
  }
  if (!selectedItemContext) {
    return;
  }

  const characterId = selectedItemContext.characterId;
  const itemId = selectedItemContext.itemId;

  const payload = {
    quantity: Number(document.getElementById('management-quantity').value),
    location: document.getElementById('management-location').value.trim(),
    job: document.getElementById('management-job').value.trim(),
    perk: document.getElementById('management-perk').value.trim(),
    obtain: document.getElementById('management-obtain').value.trim(),
    fortuneTellerBoost: document.getElementById('management-fortune').checked,
    notes: document.getElementById('management-notes').value.trim()
  };

  try {
    const response = await fetch(`/api/inventories/${characterId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to update item');
    }

    const data = await response.json();
    updateItemInState(characterId, data.item);
    recomputeAggregatesFromState();
    renderSummary();
    renderAggregatedTable();
    renderCharacterGrid();
    populateTransferSelects();
    closeManagementDrawer();
    showToast('Item updated', 'success');
  } catch (error) {
    console.error('[inventories.js]: Update error:', error);
    showToast(error.message || 'Failed to update item', 'error');
  }
}

async function handleDeleteItem() {
  if (!canManageInventory) {
    showToast('Inventory editing is limited to staff members.', 'error');
    return;
  }
  if (!selectedItemContext) {
    return;
  }

  const characterId = selectedItemContext.characterId;
  const itemId = selectedItemContext.itemId;

  if (!confirm('Delete this item from the inventory? This cannot be undone.')) {
    return;
  }

  try {
    const response = await fetch(`/api/inventories/${characterId}/items/${itemId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to delete item');
    }

    removeItemFromState(characterId, itemId);
    recomputeAggregatesFromState();
    renderSummary();
    renderAggregatedTable();
    renderCharacterGrid();
    populateTransferSelects();
    closeManagementDrawer();
    showToast('Item deleted', 'success');
  } catch (error) {
    console.error('[inventories.js]: Delete error:', error);
    showToast(error.message || 'Failed to delete item', 'error');
  }
}

function updateItemInState(characterId, updatedItem) {
  const character = inventoryState.characters.find((char) => char.id === characterId);
  if (!character || !updatedItem) {
    return;
  }

  const index = character.inventory.findIndex((item) => item.id === updatedItem.id);
  if (index >= 0) {
    character.inventory[index] = {
      ...character.inventory[index],
      ...updatedItem,
      quantity: Number(updatedItem.quantity) || 0
    };
  }
}

function removeItemFromState(characterId, itemId) {
  const character = inventoryState.characters.find((char) => char.id === characterId);
  if (!character) {
    return;
  }
  character.inventory = character.inventory.filter((item) => item.id !== itemId);
}

function recomputeAggregatesFromState() {
  const aggregateMap = new Map();
  let totalQuantity = 0;
  const imageCache = new Map();
  (inventoryState.aggregates.items || []).forEach((item) => {
    if (item.itemName && item.image) {
      imageCache.set(item.itemName, item.image);
    }
  });

  inventoryState.characters.forEach((character) => {
    const characterTotal = character.inventory.reduce((sum, item) => sum + (item.quantity || 0), 0);
    character.totalQuantity = characterTotal;
    character.uniqueItems = character.inventory.length;
    totalQuantity += characterTotal;

    character.inventory.forEach((item) => {
      if (!item || (item.quantity || 0) <= 0) {
        return;
      }
      const key = item.itemName ? item.itemName.toLowerCase() : item.id;
      if (!aggregateMap.has(key)) {
        aggregateMap.set(key, {
          itemName: item.itemName,
          categories: new Set(),
          types: new Set(),
          subtypes: new Set(),
          totalQuantity: 0,
          instances: []
        });
      }
      const entry = aggregateMap.get(key);
      entry.totalQuantity += item.quantity || 0;
      if (item.category) {
        entry.categories.add(item.category);
      }
      if (item.type) {
        entry.types.add(item.type);
      }
      (item.subtype || []).forEach((sub) => entry.subtypes.add(sub));
      entry.instances.push({
        inventoryId: item.id,
        characterId: character.id,
        characterName: character.name,
        quantity: item.quantity || 0,
        location: item.location,
        notes: item.notes,
        obtain: item.obtain,
        subtype: item.subtype,
        isEquipped: Boolean(item.isEquipped)
      });
    });
  });

  inventoryState.aggregates = decorateAggregatesWithEquippedFlag({
    totalQuantity,
    uniqueItems: aggregateMap.size,
    items: Array.from(aggregateMap.values()).map((entry) => ({
      itemName: entry.itemName,
      totalQuantity: entry.totalQuantity,
      categories: Array.from(entry.categories),
      types: Array.from(entry.types),
      subtypes: Array.from(entry.subtypes),
      instances: entry.instances,
      image: imageCache.get(entry.itemName) || null
    }))
  });
}

function changeAggregatedPage(delta) {
  if (inventoryState.aggregatedView.collapsed) {
    return;
  }
  inventoryState.aggregatedView.page += delta;
  renderAggregatedTable();
}

function updateAggregatedCollapseUI() {
  const collapsed = inventoryState.aggregatedView.collapsed;
  const tableWrapper = document.getElementById('aggregated-table-wrapper');
  if (tableWrapper) {
    if (collapsed) {
      tableWrapper.setAttribute('hidden', '');
    } else {
      tableWrapper.removeAttribute('hidden');
    }
  }

  const collapseButton = document.getElementById('aggregated-collapse-toggle');
  if (collapseButton) {
    collapseButton.setAttribute('aria-expanded', (!collapsed).toString());
    const icon = collapseButton.querySelector('i');
    const label = collapseButton.querySelector('.collapse-label');
    if (icon) {
      icon.classList.toggle('fa-chevron-up', !collapsed);
      icon.classList.toggle('fa-chevron-down', collapsed);
    }
    if (label) {
      label.textContent = collapsed ? 'Expand' : 'Collapse';
    }
  }
}

function updateAggregatedPaginationControls(totalPages) {
  const pagination = document.getElementById('aggregated-pagination');
  if (!pagination) {
    return;
  }
  const shouldHide = inventoryState.aggregatedView.collapsed || totalPages <= 1;
  pagination.hidden = shouldHide;
  if (shouldHide) {
    return;
  }

  const prevButton = document.getElementById('aggregated-prev');
  const nextButton = document.getElementById('aggregated-next');
  const pageInfo = document.getElementById('aggregated-page-info');
  if (pageInfo) {
    pageInfo.textContent = `Page ${inventoryState.aggregatedView.page} of ${totalPages}`;
  }
  if (prevButton) {
    prevButton.disabled = inventoryState.aggregatedView.page <= 1;
  }
  if (nextButton) {
    nextButton.disabled = inventoryState.aggregatedView.page >= totalPages;
  }
}

function getCharacterColor(seed) {
  if (!seed) {
    return 'hsl(210, 65%, 60%)';
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 60%)`;
}

function setLoading(isLoading) {
  const overlay = document.getElementById('inventory-loading-state');
  inventoryState.loading = isLoading;
  if (!overlay) {
    return;
  }
  overlay.hidden = !isLoading;
}

function showToast(message, variant = 'info') {
  const toast = document.getElementById('inventory-toast');
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.className = `inventory-toast show ${variant}`;
  clearTimeout(toast.dataset.timeout);
  const timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
  toast.dataset.timeout = timeout;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

