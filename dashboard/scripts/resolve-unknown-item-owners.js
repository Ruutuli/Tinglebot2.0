// ============================================================================
// Resolve "Unknown" character names for item ownership
// ============================================================================
// The dashboard ownership API shows "Unknown" when a characterId in the
// inventories DB has no matching Character or ModCharacter document.
// This script finds those characterIds and infers the character name from
// the inventory collection name (collections are named by character name).
//
// Usage: node scripts/resolve-unknown-item-owners.js [itemName]
//        (default itemName: Wood)
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

const ITEM_NAME = (process.argv[2] || "Wood").trim();
if (!ITEM_NAME) {
  console.error("Usage: node scripts/resolve-unknown-item-owners.js [itemName]");
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

  const allInventoryData = [];

  for (const collectionName of collectionNames) {
    try {
      const collection = inventoriesDb.collection(collectionName);
      const collectionData = await collection
        .aggregate([
          { $match: { itemName: { $regex: regex } } },
          { $group: { _id: "$characterId", totalQuantity: { $sum: "$quantity" } } },
        ])
        .toArray();

      for (const item of collectionData) {
        const id = item._id;
        if (!id) continue;
        const idStr = id.toString();
        const existing = allInventoryData.find((d) => d._id.toString() === idStr);
        if (existing) {
          existing.totalQuantity += item.totalQuantity;
        } else {
          allInventoryData.push({
            _id: id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(idStr),
            totalQuantity: item.totalQuantity,
          });
        }
      }
    } catch (err) {
      // skip failed collections
    }
  }

  const characterIds = allInventoryData.map((item) =>
    item._id instanceof mongoose.Types.ObjectId ? item._id : new mongoose.Types.ObjectId(item._id.toString())
  );

  const [characters, modCharacters] = await Promise.all([
    Character.find({ _id: { $in: characterIds } }).select("_id name").lean(),
    ModCharacter.find({ _id: { $in: characterIds } }).select("_id name").lean(),
  ]);

  const characterMap = new Map();
  for (const c of characters) {
    characterMap.set(c._id.toString(), c.name);
  }
  for (const c of modCharacters) {
    if (!characterMap.has(c._id.toString())) {
      characterMap.set(c._id.toString(), c.name);
    }
  }

  const unknownIds = [];
  for (const item of allInventoryData) {
    const charId = item._id.toString();
    const name = characterMap.get(charId);
    if (!name || name === "Unknown") {
      unknownIds.push({ characterId: charId, totalQuantity: item.totalQuantity });
    }
  }

  if (unknownIds.length === 0) {
    console.log(`\nNo "Unknown" owners for "${ITEM_NAME}". All characterIds resolve to Character or ModCharacter.\n`);
    await mongoose.disconnect();
    return;
  }

  console.log(`\n"${ITEM_NAME}" — ${unknownIds.length} owner(s) show as Unknown (characterId not in Character/ModCharacter):\n`);

  for (const { characterId, totalQuantity } of unknownIds) {
    const objId = new mongoose.Types.ObjectId(characterId);
    let inferredName = null;

    for (const collName of collectionNames) {
      const collection = inventoriesDb.collection(collName);
      const doc = await collection.findOne({
        characterId: objId,
        itemName: { $regex: regex },
        quantity: { $gt: 0 },
      });
      if (doc) {
        inferredName = collName;
        break;
      }
    }

    if (inferredName) {
      console.log(`  characterId: ${characterId}`);
      console.log(`  quantity:    x${totalQuantity.toLocaleString()}`);
      console.log(`  inferred name (from inventory collection): "${inferredName}"`);
      console.log("");
    } else {
      console.log(`  characterId: ${characterId}  quantity: x${totalQuantity.toLocaleString()}  (no collection found with this characterId + ${ITEM_NAME})`);
      console.log("");
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
