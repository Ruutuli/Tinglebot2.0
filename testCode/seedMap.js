// seedMap.js

// Import required modules and configurations
const path = require('path');
const { handleError } = require('../utils/globalErrorHandler');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Square = require('../models/mapModel'); // Ensure your map model is imported correctly
const { authorizeSheets, fetchSheetData, convertWixImageLinkForSheets } = require('../utils/googleSheetsUtils');

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI, {});
    console.log('🌐 Connected to MongoDB');
  } catch (error) {
    handleError(error, 'seedMap.js');

    console.error('❌ Could not connect to MongoDB...', error);
    throw error;
  }
}

// Function to initialize all four quadrants
function initializeQuadrants() {
  return [
    { quadrantId: 'Q1', status: 'unexplored', blighted: false, discoveries: [] },
    { quadrantId: 'Q2', status: 'unexplored', blighted: false, discoveries: [] },
    { quadrantId: 'Q3', status: 'unexplored', blighted: false, discoveries: [] },
    { quadrantId: 'Q4', status: 'unexplored', blighted: false, discoveries: [] }
  ];
}

// Parse Google Sheet data to match Square schema and update specific quadrant
function parseSquareData(row) {
  const [
    squareId, squareLetter, squareNumber, quadrantId, region, accessibility, status,
    blighted, grottos, monsterCamp, oldMapNumber, oldMapReward, ruins, campSpot, imageUrl
  ] = row;

  const quadrants = initializeQuadrants();
  const image = convertWixImageLinkForSheets(imageUrl); // Convert the image URL

  // Find and update the specific quadrant
  const targetQuadrant = quadrants.find(q => q.quadrantId === quadrantId);
  if (targetQuadrant) {
    targetQuadrant.status = status || (accessibility === 'Explorable' ? 'unexplored' : 'inaccessible');
    targetQuadrant.blighted = blighted === 'Y';
    targetQuadrant.discoveries = [
      ...(grottos === 'Y' ? [{ type: 'grotto' }] : []),
      ...(monsterCamp === 'Y' ? [{ type: 'monsterCamp' }] : []),
      ...(ruins === 'Y' ? [{ type: 'ruins' }] : []),
      ...(campSpot === 'Y' ? [{ type: 'campSpot' }] : []),
      ...(oldMapReward ? [{ type: oldMapReward, number: oldMapNumber }] : [])
    ];
  }

  return {
    squareId,
    region,
    status: accessibility === 'Explorable' ? 'explorable' : 'inaccessible',
    image, // Include the image URL in the return object
    quadrants
  };
}

// Seed map data into MongoDB from Google Sheets
async function seedMapData() {
  await connectToMongoDB();

  try {
    // Authorize and fetch data from Google Sheets
    const auth = await authorizeSheets();
    const spreadsheetId = '1BAVvXikGp_lQjLdOlD_VjOMkca-5aEXb-cbLxFpU-BY';
    const range = 'exploringMap!A2:O'; // Updated range to include the new Image URL column
    const sheetData = await fetchSheetData(auth, spreadsheetId, range);

    const squaresDataMap = {};

    sheetData.forEach((row) => {
      const squareData = parseSquareData(row);

      if (!squaresDataMap[squareData.squareId]) {
        squaresDataMap[squareData.squareId] = {
          squareId: squareData.squareId,
          region: squareData.region,
          status: squareData.status,
          image: squareData.image,
          quadrants: initializeQuadrants()
        };
      }

      // Merge the parsed quadrant data into the initialized quadrants
      const squareQuadrants = squaresDataMap[squareData.squareId].quadrants;
      squareData.quadrants.forEach((quad, index) => {
        if (quad.status !== 'unexplored' || quad.blighted || quad.discoveries.length) {
          squareQuadrants[index] = quad;
        }
      });
    });

    // Seed each square into the database
    for (const squareId in squaresDataMap) {
      const squareData = squaresDataMap[squareId];

      // Overwrite square data in the database
      await Square.findOneAndUpdate(
        { squareId: squareData.squareId },
        {
          region: squareData.region,
          status: squareData.status,
          quadrants: squareData.quadrants,
          image: squareData.image // Save the image URL
        },
        { upsert: true, new: true }
      );
    }

    console.log('✅ Map data successfully seeded to MongoDB');
  } catch (error) {
    handleError(error, 'seedMap.js');

    console.error('❌ Error seeding map data:', error);
    throw error;
  } finally {
    mongoose.disconnect();
  }
}

// Execute the seeding function
seedMapData().catch(error => {
  console.error('❌ Error during map seeding:', error);
  process.exit(1);
});
