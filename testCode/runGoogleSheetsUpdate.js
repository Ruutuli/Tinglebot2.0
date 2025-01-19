// ------------------- Import necessary modules -------------------
require('dotenv').config();
const { authorizeSheets, writeSheetData, clearSheetFormatting } = require('../utils/googleSheetsUtils');
const { getCurrentVendingStockList } = require('../database/vendingService');
const { google } = require('googleapis');

// ------------------- Manual Google Sheets Update Script -------------------
async function updateGoogleSheets() {
    try {
        console.log('[runGoogleSheetsUpdate]📊 Starting manual Google Sheets update...');
        
        // Authenticate with Google Sheets
        const auth = await authorizeSheets();

        // Spreadsheet ID
        const spreadsheetId = '163UPIMTyHLLCei598sP5Ezonpgl2W-DaSxn8JBSRRSw';
        const tabName = 'monthlyVending';

        // Clear only columns A:D
        const clearRange = `${tabName}!A1:D1000`;
        await clearSheetFormatting(auth, spreadsheetId, clearRange);
        console.log(`[runGoogleSheetsUpdate]🧹 Cleared columns A:D in tab "${tabName}".`);

        // Fetch the current month's vending stock
        const stockList = await getCurrentVendingStockList();
        if (!stockList) {
            console.error('[runGoogleSheetsUpdate]❌ No vending stock data available for the current month.');
            return;
        }

        // Determine the current month and year
        const now = new Date();
        const monthYear = `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`;

        // Write the header "Vending for Month Year" in A1
        const headerTitle = `Vending for ${monthYear}`;
        await writeSheetData(auth, spreadsheetId, `${tabName}!A1`, [[headerTitle]]);
        console.log(`[runGoogleSheetsUpdate]📝 Header written: "${headerTitle}"`);

        // Write column headers for village data in A2:D2
        const villageHeaders = ['Village Name', 'Item Name', 'Points Cost', 'Vending Type'];
        await writeSheetData(auth, spreadsheetId, `${tabName}!A2:D2`, [villageHeaders]);
        console.log(`[runGoogleSheetsUpdate]📝 Village column headers written: ${villageHeaders.join(', ')}`);

        // Format and write village data starting in A3
        const formattedVillageData = [];
        for (const [village, items] of Object.entries(stockList.stockList)) {
            for (const item of items) {
                formattedVillageData.push([
                    village,                       // Village name
                    item.itemName,                 // Item name
                    item.points,                   // Points cost
                    item.vendingType,              // Vending type (Shopkeeper/Merchant)
                ]);
            }
        }
        const villageDataRange = `${tabName}!A3:D`;
        await writeSheetData(auth, spreadsheetId, villageDataRange, formattedVillageData);
        console.log(`[runGoogleSheetsUpdate]✅ Village data successfully written to Google Sheets.`);

        // Handle limited items
        const limitedItems = stockList.limitedItems || [];
        if (limitedItems.length > 0) {
            // Calculate starting row for limited items
            const limitedItemsStartRow = formattedVillageData.length + 3; // Adjust for spacing
            const headersRange = `${tabName}!B${limitedItemsStartRow}:C${limitedItemsStartRow}`;
            const dataRange = `${tabName}!B${limitedItemsStartRow + 1}:C`;

            // Write headers for limited items
            const limitedItemsHeaders = ['Item Name', 'Points Cost'];
            await writeSheetData(auth, spreadsheetId, headersRange, [limitedItemsHeaders]);

            // Write limited items data
            const formattedLimitedItems = limitedItems.map(item => [
                item.itemName,
                item.points,
            ]);
            await writeSheetData(auth, spreadsheetId, dataRange, formattedLimitedItems);

            console.log(`[runGoogleSheetsUpdate]✅ Successfully appended ${limitedItems.length} limited items to Google Sheets.`);
        } else {
            console.log('[runGoogleSheetsUpdate]ℹ️ No limited items to append.');
        }

        console.log('[runGoogleSheetsUpdate]✅ Successfully updated Google Sheets with vending stock and limited items.');
    } catch (error) {
        // Log failure with details
        console.error('[runGoogleSheetsUpdate]❌ Error updating Google Sheets:', error.message);
        console.error(error.stack);
    }
}

// Run the script
updateGoogleSheets();
