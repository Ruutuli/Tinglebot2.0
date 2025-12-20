// ============================================================================
// Script to create test characters for mods with funny Link name variations
// ============================================================================

const { connectToTinglebot, fetchAllItems, createCharacter, createCharacterInventory, getCharacterInventoryCollection, deleteCharacterInventoryCollection } = require('../database/db-bot');
const Character = require('../models/CharacterModel');

// ============================================================================
// Configuration
// ============================================================================

// Mod IDs and their character configurations
const MOD_CHARACTERS = [
  {
    userId: '635948726686580747',
    name: 'Lonk',
    job: 'Shopkeeper',
    icon: 'https://i.pinimg.com/474x/b2/db/8d/b2db8d6235c79f8f27ff511806f2dccb.jpg'
  },
  {
    userId: '125636093897998336',
    name: 'Linc',
    job: 'Merchant',
    icon: 'https://i.pinimg.com/736x/f2/d0/98/f2d09897cc87b6afc54875d4eb392b2a.jpg'
  },
  {
    userId: '308795936530759680',
    name: 'Lynk',
    job: 'Shopkeeper',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ18NHNUXDAv7XmBZntbpfXifStvV4almyQ2A&s'
  },
  {
    userId: '126088204016156672',
    name: 'Lank',
    job: 'Merchant',
    icon: 'https://i.pinimg.com/736x/6f/af/4e/6faf4e280949f92157290da91f38a928.jpg'
  },
  {
    userId: '271107732289880064',
    name: 'Leenk',
    job: 'Shopkeeper',
    icon: 'https://gifdb.com/images/thumbnail/funny-chibi-zelda-link-533nlgb0wc7yzpmi.gif'
  }
];

// Base character data template
const BASE_CHARACTER_DATA = {
  age: 20,
  height: 170,
  pronouns: 'he/him',
  race: 'hylian',
  homeVillage: 'rudania',
  currentVillage: 'rudania',
  maxHearts: 999,
  currentHearts: 999,
  maxStamina: 999,
  currentStamina: 999,
  inventory: 'https://docs.google.com/spreadsheets/d/17XE0IOXSjVx47HVQ4FdcvEXm7yeg51KVkoiamD5dmKs/edit?gid=1571005582#gid=1571005582',
  appLink: 'https://docs.google.com/spreadsheets/d/17XE0IOXSjVx47HVQ4FdcvEXm7yeg51KVkoiamD5dmKs/edit?gid=1571005582#gid=1571005582',
  blighted: false,
  spiritOrbs: 0,
  birthday: '',
  inventorySynced: false
};

// ============================================================================
// Helper Functions
// ============================================================================

async function createCharacterWithInventory(characterConfig, allItems) {
  const { userId, name, job, icon } = characterConfig;
  
  console.log(`\n👤 Creating character "${name}" for user ${userId}...`);
  
  // Check if character already exists
  const existingCharacter = await Character.findOne({ 
    name: name,
    userId: userId
  });

  if (existingCharacter) {
    console.log(`⚠️  Character "${name}" already exists. Deleting existing character...`);
    // Delete inventory collection first
    try {
      await deleteCharacterInventoryCollection(name);
      console.log(`✅ Deleted existing inventory collection for ${name}`);
    } catch (error) {
      console.log(`⚠️  Could not delete inventory collection (may not exist):`, error.message);
    }
    await Character.findByIdAndDelete(existingCharacter._id);
    console.log(`✅ Deleted existing character ${name}`);
  }

  // Create character data
  const characterData = {
    ...BASE_CHARACTER_DATA,
    userId: userId,
    name: name,
    job: job,
    icon: icon
  };

  // Create character
  const character = await createCharacter(characterData);
  console.log(`✅ Created character: ${character.name} (ID: ${character._id})`);

  // Create inventory collection
  console.log(`📋 Creating inventory collection for ${name}...`);
  await createCharacterInventory(name, character._id, job);
  console.log(`✅ Inventory collection created for ${name}`);

  // Get inventory collection
  const inventoryCollection = await getCharacterInventoryCollection(name);

  // Add all items to inventory
  console.log(`📦 Adding items to inventory for ${name}...`);
  let itemsAdded = 0;
  let itemsSkipped = 0;

  for (const item of allItems) {
    try {
      // Check if item already exists in inventory
      const existingItem = await inventoryCollection.findOne({
        characterId: character._id,
        itemName: item.itemName
      });

      if (existingItem) {
        // Update quantity to 999
        await inventoryCollection.updateOne(
          { _id: existingItem._id },
          { $set: { quantity: 999 } }
        );
      } else {
        // Insert new item
        await inventoryCollection.insertOne({
          characterId: character._id,
          characterName: character.name,
          itemName: item.itemName,
          itemId: item._id,
          quantity: 999,
          category: Array.isArray(item.category) ? item.category : [item.category || 'Misc'],
          type: Array.isArray(item.type) ? item.type : [item.type || 'Unknown'],
          subtype: Array.isArray(item.subtype) ? item.subtype : [item.subtype || 'None'],
          job: character.job,
          perk: '',
          location: character.currentVillage,
          link: '',
          date: new Date(),
          obtain: 'Test Character Setup',
          synced: ''
        });
      }
      itemsAdded++;
      
      if (itemsAdded % 100 === 0) {
        console.log(`  📦 Added ${itemsAdded} items for ${name}...`);
      }
    } catch (error) {
      console.error(`  ❌ Error adding item "${item.itemName}" for ${name}:`, error.message);
      itemsSkipped++;
    }
  }

  console.log(`✅ Inventory setup complete for ${name}!`);
  console.log(`   - Items added: ${itemsAdded}`);
  console.log(`   - Items skipped: ${itemsSkipped}`);

  // Verify character stats
  const createdCharacter = await Character.findById(character._id);
  console.log(`\n📊 ${name} Stats:`);
  console.log(`   - Name: ${createdCharacter.name}`);
  console.log(`   - Hearts: ${createdCharacter.currentHearts}/${createdCharacter.maxHearts}`);
  console.log(`   - Stamina: ${createdCharacter.currentStamina}/${createdCharacter.maxStamina}`);
  console.log(`   - Job: ${createdCharacter.job}`);
  console.log(`   - Village: ${createdCharacter.currentVillage}`);

  // Verify inventory count
  const inventoryItems = await inventoryCollection.find({ characterId: character._id }).toArray();
  console.log(`   - Inventory: ${inventoryItems.length} unique items`);

  return character;
}

// ============================================================================
// Main function
// ============================================================================
async function createTestCharacters() {
  try {
    console.log('🚀 Starting test character creation for mods...');
    console.log(`📋 Creating ${MOD_CHARACTERS.length} test characters\n`);

    // Connect to databases
    console.log('📡 Connecting to databases...');
    await connectToTinglebot();
    console.log('✅ Connected to Tinglebot database');

    // Fetch all items from database (once for all characters)
    console.log('\n📦 Fetching all items from database...');
    const allItems = await fetchAllItems();
    console.log(`✅ Found ${allItems.length} items in database`);

    // Create all characters
    const createdCharacters = [];
    for (const characterConfig of MOD_CHARACTERS) {
      try {
        const character = await createCharacterWithInventory(characterConfig, allItems);
        createdCharacters.push(character);
      } catch (error) {
        console.error(`❌ Error creating character ${characterConfig.name}:`, error);
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test character creation complete!');
    console.log('='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   - Characters created: ${createdCharacters.length}/${MOD_CHARACTERS.length}`);
    console.log(`   - Total items per character: ${allItems.length}`);
    console.log(`\n📝 Created characters:`);
    createdCharacters.forEach(char => {
      console.log(`   - ${char.name} (User: ${char.userId}, Job: ${char.job})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test characters:', error);
    process.exit(1);
  }
}

// Run the script
createTestCharacters();

