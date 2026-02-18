// ============================================================================
// Seed ROTW Relic Form Responses (2024)
// ============================================================================
// Purpose: Seed relics from ROTW_relic_turn_in_form_2024_responses CSV.
//          These relics were found and appraised before the bot existed.
//          - Matches characters by name (Character + ModCharacter collections)
//          - Skips relics if finder character not found (LEFT)
//          - Converts OLD location system to NEW:
//            OLD: A1=top-left, A12=top-right, J1=bottom-left, J12=bottom-right
//            NEW: A1=top-left, A12=bottom-left, J1=top-right, J12=bottom-right
//          - Uses RELIC_IMAGE_MAP below for imageUrl (not CSV "Relic Image" column).
//
// Usage: node scripts/seed-rotw-relics.js
//        node scripts/seed-rotw-relics.js --list-characters  (show DB character names)
//        (run from dashboard directory, or project root)
// ============================================================================

// Relic name (exact match from CSV "Relic" column) → image URL to seed with.
// Uses GCS relic images; CSV "Relic Image" is ignored.
const GCS_RELIC_BASE = 'https://storage.googleapis.com/tinglebot/relics/';
const RELIC_IMAGE_MAP = {
  'Ancient Sheikah Orb': GCS_RELIC_BASE + 'orbbbbbbbb_m2627.png',
  'Ancient Zonai Dragon Idol': GCS_RELIC_BASE + 'zonai_dragon_idol_icon_morganini.png',
  'Blight Geodes': GCS_RELIC_BASE + 'its_a_geode_trans_midge.png',
  'Blighted Dragon Parts': GCS_RELIC_BASE + 'blighted_dragon_parts_icon_morganini.png',
  'Carmine Pearl': GCS_RELIC_BASE + '2025_carmine_pearl_relic_mille_feuille.png',
  'Demon Fossil': GCS_RELIC_BASE + 'demon_fossil_paula_bronstonwoods.png',
  "Dinraal's Scale": GCS_RELIC_BASE + 'Dinraals_Scale.png',
  "Farosh's Claw": GCS_RELIC_BASE + 'faroshs_claw_ashley_thomas.png',
  'Freezard Water': GCS_RELIC_BASE + 'freezardwaterfinal_fredkj.png',
  'Goddess Plume': GCS_RELIC_BASE + 'goddessplume_ephemeral_elysium.png',
  'Ice Rose': GCS_RELIC_BASE + 'iceroserelicfinali_fredkj.png',
  'Naydra scale': GCS_RELIC_BASE + 'naydrascale_ra_mo.png',
  "Naydra's Claw": GCS_RELIC_BASE + 'naydras_claw_jay_a..png',
  'Old Key': GCS_RELIC_BASE + 'oldkeyrelic_ryan.png',
  'Rainbow Coral': GCS_RELIC_BASE + 'ferns_rainbow_coral_color_morganini.png',
  "Shard of Dinraal's Horn": GCS_RELIC_BASE + 'relicshard_of_dinraals_horn_v01_chumani_b.png',
  "Shard of Farosh's Fang": GCS_RELIC_BASE + 'farfang_trans_ryan.png',
  "Shard of Farosh's Horn": GCS_RELIC_BASE + 'shard_of_farosh_horn_jay_a..png',
  "Shard of Nayru's Horn": GCS_RELIC_BASE + 'shardornayrushorn_fredkj.png',
  'Talisman': GCS_RELIC_BASE + 'talisman_relic_take_2_paula_bronstonwoods.png',
  'The Tainted Idol': GCS_RELIC_BASE + 'tainted_idol_alifer_artist.png',
  'Translation Scroll Volume 26: Scroll of Celestial Transcription': GCS_RELIC_BASE + 'translation_scroll_volume_26_scroll_of_celestial_transcription_alifer_artist.png',
  'Wooden Totem': GCS_RELIC_BASE + 'kokiri_totem_relic_morganini.png'
};

// CSV character name → DB character name (exact). Use when flexible matching fails.
const CHARACTER_NAME_OVERRIDES = {
  'Mineko (Kyo)': 'Kyo Nagano'
};

const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..', '..');
// Use mongoose from bot (same instance as Character/Relic) - dashboard has its own mongoose, causing buffering timeout
const mongoose = require(require.resolve('mongoose', { paths: [path.join(projectRoot, 'bot')] }));

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // dotenv not available
}

const MONGODB_URI = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ Set MONGODB_TINGLEBOT_URI or MONGODB_URI in dashboard/.env');
  process.exit(1);
}

const Relic = require(path.join(projectRoot, 'bot', 'models', 'RelicModel.js'));
const Character = require(path.join(projectRoot, 'bot', 'models', 'CharacterModel.js'));
const ModCharacter = require(path.join(projectRoot, 'bot', 'models', 'ModCharacterModel.js'));
const { generateUniqueId } = require(path.join(projectRoot, 'bot', 'utils', 'uniqueIdUtils.js'));

// ------------------- OLD → NEW Square Conversion -------------------
// OLD: Letter = row (vertical, A=top, J=bottom), Number = col (horizontal, 1=left, 12=right)
//      A1=top-left, A12=top-right, J1=bottom-left, J12=bottom-right
// NEW: Letter = col (horizontal, A=left, J=right), Number = row (vertical, 1=top, 12=bottom)
//      A1=top-left, A12=bottom-left, J1=top-right, J12=bottom-right
// Conversion: transpose (OLD col → NEW letter, OLD row → NEW number)
function convertOldSquareToNew(oldSquare) {
  if (!oldSquare || typeof oldSquare !== 'string') return oldSquare || '';
  const trimmed = oldSquare.trim().toUpperCase();
  const m = trimmed.match(/^([A-J])(\d+)$/);
  if (!m) return trimmed; // invalid or N/A, return as-is
  const oldRowLetter = m[1];
  const oldColNum = parseInt(m[2], 10);
  if (oldColNum < 1 || oldColNum > 12) return trimmed;
  const oldRowIdx = 'ABCDEFGHIJ'.indexOf(oldRowLetter);
  if (oldRowIdx === -1) return trimmed;
  // NEW col letter: OLD col 1-12 → A-J (linear)
  const newColIdx = Math.min(9, Math.floor((oldColNum - 1) * 10 / 12));
  const newColLetter = 'ABCDEFGHIJ'[newColIdx];
  // NEW row num: OLD row A-J (0-9) → 1-12
  const newRowNum = Math.min(12, Math.max(1, Math.round((oldRowIdx * 12) / 10) + 1));
  return newColLetter + newRowNum;
}

// ------------------- Normalize name (strip accents, special chars) -------------------
function normalizeName(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics (é→e, etc)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------- Build search candidates from CSV character name -------------------
function buildNameCandidates(characterName) {
  if (!characterName || typeof characterName !== 'string') return [];
  const raw = characterName.split('|')[0].trim();
  if (!raw) return [];

  const candidates = [];

  // Part in parentheses first (e.g. "Mineko (Kyo)" → "Kyo") — DB uses canonical name
  const parenMatch = raw.match(/\(([^)]+)\)/);
  if (parenMatch) {
    candidates.push(parenMatch[1].trim());
  }

  candidates.push(raw);

  // Part before parentheses (e.g. "Mineko (Kyo)" → "Mineko")
  const beforeParen = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (beforeParen && beforeParen !== raw) candidates.push(beforeParen);

  // Normalized (no accents, no special chars): "Pommé" → "Pomme"
  const normalized = normalizeName(raw);
  if (normalized && !candidates.includes(normalized)) candidates.push(normalized);

  return [...new Set(candidates)];
}

// ------------------- Find character by name -------------------
function getOverrideDbName(csvName) {
  const raw = (csvName || '').split('|')[0].trim().replace(/\s+/g, ' ');
  const key = Object.keys(CHARACTER_NAME_OVERRIDES).find(
    (k) => k.trim().replace(/\s+/g, ' ').toLowerCase() === raw.toLowerCase()
  );
  return key ? CHARACTER_NAME_OVERRIDES[key] : null;
}

async function findCharacterByName(characterName) {
  if (!characterName || typeof characterName !== 'string') return null;
  const raw = characterName.split('|')[0].trim();
  const candidates = [];
  const override = getOverrideDbName(characterName);
  if (override) candidates.push(override);
  candidates.push(...buildNameCandidates(characterName));
  for (const name of [...new Set(candidates)]) {
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Allow optional surrounding whitespace in DB (^\s*Name\s*$)
    const regex = new RegExp(`^\\s*${escaped}\\s*$`, 'i');
    let char = await Character.findOne({ name: regex }).lean();
    if (char) return { ...char, isModCharacter: false };
    char = await ModCharacter.findOne({ name: regex }).lean();
    if (char) return { ...char, isModCharacter: true };
  }
  return null;
}

// ------------------- Parse CSV line (handles quoted fields) -------------------
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

// ------------------- Parse CSV -------------------
function parseRelicCsv(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const colIdx = {};
  header.forEach((h, i) => { colIdx[h.trim()] = i; });
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const get = (key) => (cols[colIdx[key]] || '').trim();
    rows.push({
      timestamp: get('Timestamp'),
      email: get('Email Address'),
      isNewOrDuplicate: get('Is this a new Relic or Duplicate?'),
      memberName: get('Member Name'),
      characterName: get('Character Name'),
      appraiser: get('Appraiser'),
      region: get('Region'),
      square: get('Square'),
      quadrant: get('Quadrant'),
      relic: get('Relic'),
      flavorText: get('Flavor Text'),
      relicImage: get('Relic Image')
    });
  }
  return rows;
}

// ------------------- Parse timestamp to Date -------------------
function parseTimestamp(ts) {
  if (!ts) return new Date('2024-04-01');
  const d = new Date(ts);
  return isNaN(d.getTime()) ? new Date('2024-04-01') : d;
}

// ------------------- Main -------------------
async function main() {
  const listChars = process.argv.includes('--list-characters');
  const csvPath = path.join(projectRoot, 'ROTW_relic_turn_in_form_2024_responses - Form Responses 1.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV not found: ${csvPath}`);
    process.exit(1);
  }

  console.log('Parsing CSV...');
  const rows = parseRelicCsv(csvPath);
  const newRows = rows.filter((r) => r.isNewOrDuplicate.toLowerCase() === 'new');
  console.log(`Found ${rows.length} rows (${newRows.length} New, ${rows.length - newRows.length} Duplicate skipped).`);

  console.log('Connecting to MongoDB...');
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.error('   Check MONGODB_URI in dashboard/.env, network, and MongoDB Atlas IP whitelist.');
    process.exit(1);
  }

  if (listChars) {
    const chars = await Character.find({}, { name: 1 }).sort({ name: 1 }).lean();
    const mods = await ModCharacter.find({}, { name: 1 }).sort({ name: 1 }).lean();
    console.log('\n--- Characters in DB ---');
    chars.forEach((c) => console.log('  ' + c.name));
    console.log('\n--- ModCharacters in DB ---');
    mods.forEach((c) => console.log('  ' + c.name));
    console.log('\n(Run without --list-characters to seed.)');
    await mongoose.disconnect();
    return;
  }

  const created = [];
  const left = [];
  const errors = [];

  for (const row of newRows) {
    const charName = row.characterName;
    if (!charName) {
      errors.push({ row: row.relic, reason: 'Missing character name' });
      continue;
    }

    const character = await findCharacterByName(charName);
    if (!character) {
      left.push({ relic: row.relic, character: charName, member: row.memberName });
    }

    const discoveredDate = parseTimestamp(row.timestamp);
    const appraisalDate = discoveredDate; // pre-appraised at turn-in
    const artDeadline = new Date(appraisalDate.getTime() + 60 * 24 * 60 * 60 * 1000); // 2 months

    const newSquare = convertOldSquareToNew(row.square);
    const locationFound = [row.region, row.square, row.quadrant].filter(Boolean).join(', ') || '';

    const relicData = {
      relicId: generateUniqueId('R'),
      name: row.relic,
      discoveredBy: character ? character.name : 'NPC',
      characterId: character ? character._id : null,
      discoveredDate,
      locationFound,
      region: row.region || '',
      square: newSquare || row.square || '',
      quadrant: row.quadrant || '',
      appraised: true,
      appraisedBy: row.appraiser || 'Pre-bot',
      appraisalDate,
      appraisalDeadline: new Date(discoveredDate.getTime() + 7 * 24 * 60 * 60 * 1000),
      artDeadline,
      appraisalDescription: row.flavorText || '',
      imageUrl: (RELIC_IMAGE_MAP[row.relic] ?? '').trim(),
      artSubmitted: !!(RELIC_IMAGE_MAP[row.relic] && String(RELIC_IMAGE_MAP[row.relic]).trim()),
      archived: true
    };

    try {
      const relic = new Relic(relicData);
      await relic.save();
      created.push({ relic: row.relic, character: charName });
    } catch (err) {
      errors.push({ row: row.relic, reason: err.message });
    }
  }

  console.log('\n--- Summary ---');
  console.log(`✅ Created: ${created.length}`);
  created.forEach((c) => console.log(`   - ${c.relic} (${c.character})`));
  console.log(`\n⚠️ LEFT (character not found): ${left.length}`);
  left.forEach((l) => console.log(`   - ${l.relic} | Character: ${l.character} | Member: ${l.member}`));
  if (errors.length) {
    console.log(`\n❌ Errors: ${errors.length}`);
    errors.forEach((e) => console.log(`   - ${e.row}: ${e.reason}`));
  }

  const total = await Relic.countDocuments();
  console.log(`\n✅ Done. Total relics in DB: ${total}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
