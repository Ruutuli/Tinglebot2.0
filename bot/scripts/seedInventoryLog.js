// ============================================================================
// ------------------- seedInventoryLog.js -------------------
// Script to seed InventoryLog entries from all characters' Google Sheets
// loggedInventory pages. Reads all characters, checks their Google Sheet
// inventory links, and creates InventoryLog entries from the loggedInventory sheet.
// Usage: node bot/scripts/seedInventoryLog.js [--dry-run] [--character=CHARACTER_NAME]
// ============================================================================

const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');

const { connectToTinglebot } = require('@app/shared/database/db');
const Character = require('@app/shared/models/CharacterModel');
const InventoryLog = require('@app/shared/models/InventoryLogModel');
const ItemModel = require('@app/shared/models/ItemModel');

const {
  authorizeSheets,
  extractSpreadsheetId,
  getSheetIdByTitle,
  readSheetData,
  isValidGoogleSheetsUrl
} = require('@app/shared/utils/googleSheetsUtils');

// ============================================================================
// ------------------- Configuration -------------------
// ============================================================================

const ARG_DRY_RUN = process.argv.includes('--dry-run');
const ARG_CHARACTER = (() => {
  const charArg = process.argv.find(arg => arg.startsWith('--character='));
  if (!charArg) return null;
  return charArg.split('=')[1].trim();
})();

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

function escapeRegExp(string) {
  return string.replace(/[.*?^${}()|[\]\\]/g, '\\$&');
}

// ------------------- Parse date from Google Sheets -------------------
function parseSheetDate(dateValue) {
  if (!dateValue) return new Date();
  
  // Try parsing as Date object first
  if (dateValue instanceof Date) {
    return dateValue;
  }
  
  // Try parsing as string
  const dateStr = String(dateValue).trim();
  if (!dateStr || dateStr === '') return new Date();
  
  // Try parsing various date formats
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // Fallback to current date
  return new Date();
}

// ------------------- Find Item ID by name -------------------
async function findItemId(itemName) {
  if (!itemName) return null;
  
  try {
    let item;
    if (itemName.includes('+')) {
      item = await ItemModel.findOne({ itemName: itemName }).select('_id').lean();
    } else {
      item = await ItemModel.findOne({
        itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') }
      }).select('_id').lean();
    }
    return item?._id || null;
  } catch (error) {
    console.error(`[seedInventoryLog.js]: ⚠️ Error finding item ID for "${itemName}":`, error.message);
    return null;
  }
}

// ------------------- Process Character's loggedInventory Sheet -------------------
async function processCharacterInventoryLog(character, auth) {
  const results = {
    characterName: character.name,
    spreadsheetId: null,
    totalRows: 0,
    processedRows: 0,
    skippedRows: 0,
    errors: [],
    logs: []
  };
  
  try {
    // Validate Google Sheets URL
    const inventoryUrl = character.inventory;
    if (!inventoryUrl || !isValidGoogleSheetsUrl(inventoryUrl)) {
      results.errors.push(`Invalid or missing Google Sheets URL: ${inventoryUrl}`);
      return results;
    }
    
    // Extract spreadsheet ID
    const spreadsheetId = extractSpreadsheetId(inventoryUrl);
    if (!spreadsheetId) {
      results.errors.push(`Could not extract spreadsheet ID from URL: ${inventoryUrl}`);
      return results;
    }
    results.spreadsheetId = spreadsheetId;
    
    // Get loggedInventory sheet
    const sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'loggedInventory');
    if (!sheetId) {
      results.errors.push(`Sheet 'loggedInventory' not found in spreadsheet`);
      return results;
    }
    
    // Read sheet data (columns A-M, starting from row 2)
    const sheetData = await readSheetData(auth, spreadsheetId, 'loggedInventory!A2:M');
    if (!sheetData || sheetData.length === 0) {
      results.errors.push(`No data found in loggedInventory sheet`);
      return results;
    }
    
    results.totalRows = sheetData.length;
    
    // Process each row
    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      const rowNumber = i + 2; // +2 because we start from row 2
      
      try {
        // Parse row data: [characterName, itemName, quantity, category, type, subtype, obtain, job, perk, location, link, date, synced]
        const [
          sheetCharacterName,
          itemName,
          quantity,
          category,
          type,
          subtype,
          obtain,
          job,
          perk,
          location,
          link,
          date,
          synced
        ] = row;
        
        // Skip if character name doesn't match
        if (!sheetCharacterName || sheetCharacterName.trim().toLowerCase() !== character.name.toLowerCase()) {
          results.skippedRows++;
          continue;
        }
        
        // Skip if missing required fields
        if (!itemName || !quantity) {
          results.skippedRows++;
          continue;
        }
        
        // Parse quantity (positive = addition, negative = removal)
        const cleanQuantity = String(quantity).replace(/,/g, '').trim();
        const parsedQuantity = parseInt(cleanQuantity);
        if (isNaN(parsedQuantity) || parsedQuantity === 0) {
          results.skippedRows++;
          continue;
        }
        
        // Find item ID
        const itemId = await findItemId(itemName.trim());
        
        // Parse date
        const dateTime = parseSheetDate(date);
        
        // Determine obtain method (default to 'Manual Sync' if not provided)
        const obtainMethod = (obtain && obtain.trim()) ? obtain.trim() : 'Manual Sync';
        
        // Check if this log entry already exists (to avoid duplicates)
        const existingLog = await InventoryLog.findOne({
          characterId: character._id,
          itemName: itemName.trim(),
          quantity: parsedQuantity,
          dateTime: dateTime,
          obtain: obtainMethod
        }).lean();
        
        if (existingLog) {
          results.skippedRows++;
          results.logs.push({
            row: rowNumber,
            itemName: itemName.trim(),
            action: 'skipped (duplicate)'
          });
          continue;
        }
        
        // Create InventoryLog entry
        const inventoryLogData = {
          characterName: character.name,
          characterId: character._id,
          itemName: itemName.trim(),
          itemId: itemId,
          quantity: parsedQuantity,
          category: (category && category.trim()) || '',
          type: (type && type.trim()) || '',
          subtype: (subtype && subtype.trim()) || '',
          obtain: obtainMethod,
          job: (job && job.trim()) || '',
          perk: (perk && perk.trim()) || '',
          location: (location && location.trim()) || '',
          link: (link && link.trim()) || '',
          dateTime: dateTime,
          confirmedSync: (synced && synced.trim()) || ''
        };
        
        if (ARG_DRY_RUN) {
          results.processedRows++;
          results.logs.push({
            row: rowNumber,
            itemName: itemName.trim(),
            quantity: parsedQuantity,
            obtain: obtainMethod,
            action: 'would create'
          });
        } else {
          // Save to database
          const inventoryLog = new InventoryLog(inventoryLogData);
          await inventoryLog.save();
          
          results.processedRows++;
          results.logs.push({
            row: rowNumber,
            itemName: itemName.trim(),
            quantity: parsedQuantity,
            obtain: obtainMethod,
            action: 'created'
          });
        }
      } catch (rowError) {
        results.errors.push(`Row ${rowNumber}: ${rowError.message}`);
        results.skippedRows++;
        console.error(`[seedInventoryLog.js]: ❌ Error processing row ${rowNumber} for ${character.name}:`, rowError.message);
      }
    }
  } catch (error) {
    results.errors.push(`Character processing error: ${error.message}`);
    console.error(`[seedInventoryLog.js]: ❌ Error processing ${character.name}:`, error.message);
  }
  
  return results;
}

// ============================================================================
// ------------------- Main Function -------------------
// ============================================================================

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('InventoryLog Seeding Script');
    console.log('='.repeat(80));
    console.log(`Mode: ${ARG_DRY_RUN ? '🔍 DRY RUN (no changes will be saved)' : '✅ LIVE RUN (changes will be saved)'}`);
    console.log('');
    
    // Connect to database
    console.log('📡 Connecting to database...');
    await connectToTinglebot();
    console.log('✅ Database connected\n');
    
    // Authorize Google Sheets
    console.log('🔐 Authorizing Google Sheets...');
    const auth = await authorizeSheets();
    console.log('✅ Google Sheets authorized\n');
    
    // Find characters to process
    let query = { inventory: { $exists: true, $ne: null, $ne: '' } };
    if (ARG_CHARACTER) {
      query.name = { $regex: new RegExp(`^${escapeRegExp(ARG_CHARACTER)}$`, 'i') };
    }
    
    const characters = await Character.find(query)
      .select('_id name inventory')
      .lean();
    
    if (characters.length === 0) {
      console.log('❌ No characters found with Google Sheets inventory links');
      if (ARG_CHARACTER) {
        console.log(`   (filtered by character name: ${ARG_CHARACTER})`);
      }
      process.exit(0);
    }
    
    console.log(`📋 Found ${characters.length} character(s) with Google Sheets inventory links\n`);
    
    if (ARG_CHARACTER) {
      console.log(`   Filtered by character name: ${ARG_CHARACTER}\n`);
    }
    
    // Process each character
    const allResults = [];
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    for (let i = 0; i < characters.length; i++) {
      const character = characters[i];
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`Processing ${i + 1}/${characters.length}: ${character.name}`);
      console.log(`Spreadsheet: ${character.inventory}`);
      console.log('─'.repeat(80));
      
      const results = await processCharacterInventoryLog(character, auth);
      allResults.push(results);
      
      totalProcessed += results.processedRows;
      totalSkipped += results.skippedRows;
      totalErrors += results.errors.length;
      
      console.log(`📊 Results:`);
      console.log(`   Total rows in sheet: ${results.totalRows}`);
      console.log(`   ✅ Processed: ${results.processedRows}`);
      console.log(`   ⏭️  Skipped: ${results.skippedRows}`);
      console.log(`   ❌ Errors: ${results.errors.length}`);
      
      if (results.errors.length > 0) {
        console.log(`\n   Errors:`);
        results.errors.forEach(error => console.log(`      - ${error}`));
      }
      
      // Show sample of processed logs (first 5)
      if (results.logs.length > 0) {
        console.log(`\n   Sample entries:`);
        results.logs.slice(0, 5).forEach(log => {
          const sign = log.quantity > 0 ? '+' : '';
          console.log(`      Row ${log.row}: ${sign}${log.quantity}x ${log.itemName} (${log.obtain}) - ${log.action}`);
        });
        if (results.logs.length > 5) {
          console.log(`      ... and ${results.logs.length - 5} more`);
        }
      }
      
      // Small delay to avoid rate limiting
      if (i < characters.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total characters processed: ${characters.length}`);
    console.log(`Total entries ${ARG_DRY_RUN ? 'would be created' : 'created'}: ${totalProcessed}`);
    console.log(`Total rows skipped: ${totalSkipped}`);
    console.log(`Total errors: ${totalErrors}`);
    console.log('');
    
    if (ARG_DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No changes were saved to the database');
      console.log('   Run without --dry-run to actually save the changes');
    } else {
      console.log('✅ Changes have been saved to the database');
    }
    
    console.log('='.repeat(80));
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main };
