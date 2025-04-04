// =================== STANDARD LIBRARIES ===================
const fs = require('fs');
const path = require('path');

// =================== DATABASE CONNECTION ===================
const { connectToTinglebot } = require('../database/connection');
const RelicModel = require('../models/RelicModel');

// =================== Load Parsed JSON ===================
const jsonPath = path.join(__dirname, 'parsedRelics.json');
const parsedRelics = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// =================== Main Seed Function ===================
const seedRelics = async () => {
  try {
    console.log('[seedRelics]: 🔌 Connecting to database...');
    await connectToTinglebot();

    console.log('[seedRelics]: 🧹 Clearing existing relics from the database...');
    await RelicModel.deleteMany({});

    console.log(`[seedRelics]: 💾 Seeding ${parsedRelics.length} relics...`);

    for (const relic of parsedRelics) {
      // Clean up description to remove appraisal banner if still present
      const cleanDescription = relic.description?.replace(
        /^The relic has been appraised! You found a\(n\).....```/i,
        ''
      ).trim();

      await RelicModel.create({
        name: relic.name || 'Unnamed Relic',
        description: cleanDescription || '',
        functionality: relic.functionality || '',
        origins: relic.origins || '',
        uses: relic.uses || '',
        discoveredBy: '',           // Not yet discovered
        discoveredDate: null,       // Not yet discovered
        locationFound: '',          // Not yet found
        appraised: false,
        appraisedBy: null,
        appraisalDate: null,
        artSubmitted: false,
        imageUrl: '',
        archived: false,
        unique: relic.unique || false,
        duplicateOf: null,
        deteriorated: false,
        emoji: relic.emoji || '🔸',
      });
    }

    console.log(`[seedRelics]: ✅ Successfully seeded ${parsedRelics.length} relics.`);
    process.exit(0);
  } catch (error) {
    console.error('[seedRelics]: ❌ Failed to seed relics -', error);
    process.exit(1);
  }
};

seedRelics();
