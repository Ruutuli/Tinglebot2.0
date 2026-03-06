// ============================================================================
// List characters that have a given item in their inventory
// ============================================================================
// Scans all inventory collections for the item (case-insensitive) and prints
// character names and quantities.
//
// Usage: node scripts/who-has-item.js [itemName]
//        (default itemName: Fairy)
//        Run from dashboard directory. Requires .env with MONGODB_URI or MONGODB_TINGLEBOT_URI.
// ============================================================================

const path = require("path");

try {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
} catch (e) {
  // dotenv not available
}

const projectRoot = path.resolve(__dirname, "..", "..");
const mongoose = require(require.resolve("mongoose", { paths: [path.join(projectRoot, "bot")] }));

const MONGODB_URI = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ Set MONGODB_TINGLEBOT_URI or MONGODB_URI in dashboard/.env");
  process.exit(1);
}

const Character = require(path.join(projectRoot, "bot", "models", "CharacterModel.js"));
const ModCharacter = require(path.join(projectRoot, "bot", "models", "ModCharacterModel.js"));

const ITEM_NAME = (process.argv[2] || "Fairy").trim();
if (!ITEM_NAME) {
  console.error("Usage: node scripts/who-has-item.js [itemName]");
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const conn = mongoose.connection;
  const inventoriesDb = conn.useDb("inventories").db;

  const collections = await inventoriesDb.listCollections().toArray();
  const collectionNames = collections.map((c) => c.name);

  const escapedItemName = ITEM_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escapedItemName}$`, "i");

  // { characterIdStr -> totalQuantity } (one collection = one character, but we key by characterId for lookup)
  const byCharacterId = new Map();

  for (const collectionName of collectionNames) {
    try {
      const collection = inventoriesDb.collection(collectionName);
      const result = await collection
        .aggregate([
          { $match: { itemName: { $regex: regex }, quantity: { $gt: 0 } } },
          { $group: { _id: "$characterId", totalQuantity: { $sum: "$quantity" } } },
        ])
        .toArray();

      for (const item of result) {
        const id = item._id;
        if (!id) continue;
        const idStr = id.toString();
        const qty = Number(item.totalQuantity) || 0;
        if (qty <= 0) continue;
        const existing = byCharacterId.get(idStr);
        byCharacterId.set(idStr, (existing || 0) + qty);
      }
    } catch (err) {
      // skip failed collections
    }
  }

  const characterIds = Array.from(byCharacterId.entries()).map(([idStr, totalQuantity]) => ({
    _id: new mongoose.Types.ObjectId(idStr),
    totalQuantity,
  }));

  if (characterIds.length === 0) {
    console.log(`\nNo characters have "${ITEM_NAME}" in their inventory.\n`);
    await mongoose.disconnect();
    return;
  }

  const idsOnly = characterIds.map((c) => c._id);
  const [characters, modCharacters] = await Promise.all([
    Character.find({ _id: { $in: idsOnly } }).select("_id name").lean(),
    ModCharacter.find({ _id: { $in: idsOnly } }).select("_id name").lean(),
  ]);

  const nameById = new Map();
  for (const c of characters) {
    nameById.set(c._id.toString(), c.name);
  }
  for (const c of modCharacters) {
    if (!nameById.has(c._id.toString())) {
      nameById.set(c._id.toString(), c.name);
    }
  }

  const rows = characterIds.map(({ _id, totalQuantity }) => {
    const name = nameById.get(_id.toString()) || `(unknown ${_id})`;
    return { name, totalQuantity };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  console.log(`\nCharacters with "${ITEM_NAME}" in their inventory (${rows.length}):\n`);
  for (const { name, totalQuantity } of rows) {
    console.log(`  ${name}: x${totalQuantity.toLocaleString()}`);
  }
  console.log("");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
