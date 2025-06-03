// /*
// viewMap.js
// This module implements the "viewmap" slash command that allows users to view the status of a specific map square or a specific quadrant.
// It downloads or crops an image using axios and sharp, constructs a detailed embed with map information, and sends the result back to the user.
// */

// // ------------------- Standard Libraries -------------------
// // Third-party libraries for HTTP requests and image processing.
// const axios = require('axios');
// const { handleError } = require('../../utils/globalErrorHandler');
// const sharp = require('sharp');


// // ------------------- Discord.js Components -------------------
// // Components for building slash commands and constructing rich embed messages.
// const { SlashCommandBuilder } = require('@discordjs/builders');
// const { EmbedBuilder, AttachmentBuilder } = require('discord.js');


// // ------------------- Modules -------------------
// // Custom modules for additional map functionality such as movement rules.
// const MapModule = require('../../modules/mapModule');


// // ------------------- Database Models -------------------
// // Database model representing a map square.
// const Square = require('../../models/mapModel');


// // ------------------- Initialize Map Module -------------------
// // Instantiate the MapModule to access its functions (e.g., for fetching adjacent squares).
// const mapModule = new MapModule();


// // ------------------- Map Region Colors -------------------
// // Defines the color codes for different map regions to be used in the embed messages.
// const regionColors = {
//   'Eldin': '#FF0000',          // Red
//   'Lanayru': '#0000FF',        // Blue
//   'Faron': '#008000',          // Green
//   'Central Hyrule': '#00FFFF', // Teal/Cyan
//   'Gerudo': '#FFA500',         // Orange
//   'Hebra': '#800080',          // Purple
// };

  
// // ------------------- Helper Function: Download Full Square Image -------------------
// // Downloads the full square image from the provided URL, saves it locally, and returns the output path.
// async function downloadSquareImage(imageUrl) {
//   try {
//     const response = await axios({ url: imageUrl, responseType: 'arraybuffer' });
//     const buffer = Buffer.from(response.data);
//     const outputPath = './full_square.png';
//     await sharp(buffer).toFile(outputPath);
//     return outputPath;
//   } catch (error) {
//     handleError(error, 'viewMap.js');

//     console.error(`[viewMap.js:error] downloadSquareImage failed: ${error}`);
//     throw error;
//   }
// }


// // ------------------- Helper Function: Crop Quadrant Image -------------------
// // Crops a specific quadrant from the full square image based on the quadrant identifier (Q1, Q2, Q3, Q4)
// // and returns the output path of the cropped image.
// async function cropQuadrant(imageUrl, quadrant) {
//   try {
//     const response = await axios({ url: imageUrl, responseType: 'arraybuffer' });
//     const buffer = Buffer.from(response.data);

//     let cropRegion;
//     switch (quadrant) {
//       case 'Q1': 
//         cropRegion = { left: 0, top: 0, width: 498, height: 488 }; 
//         break;
//       case 'Q2': 
//         cropRegion = { left: 502, top: 0, width: 498, height: 488 }; 
//         break;
//       case 'Q3': 
//         cropRegion = { left: 0, top: 514, width: 498, height: 488 }; 
//         break;
//       case 'Q4': 
//         cropRegion = { left: 502, top: 514, width: 498, height: 488 }; 
//         break;
//       default: 
//         throw new Error('Invalid quadrant specified');
//     }

//     const outputPath = `./cropped_${quadrant}.png`;
//     await sharp(buffer).extract(cropRegion).toFile(outputPath);
//     return outputPath;
//   } catch (error) {
//     handleError(error, 'viewMap.js');

//     console.error(`[viewMap.js:error] cropQuadrant failed: ${error}`);
//     throw error;
//   }
// }


// // ------------------- Slash Command Definition and Execution -------------------
// // Defines the "viewmap" command and implements its execution logic.
// // Users can view a full square image or a specific quadrant along with detailed map data.
// module.exports = {
//   data: new SlashCommandBuilder()
//     .setName('viewmap')
//     .setDescription('View the status of a specific quadrant or full square.')
//     .addStringOption(option => 
//       option.setName('square')
//         .setDescription('Square ID (e.g., A1, B2)')
//         .setRequired(true))
//     .addStringOption(option => 
//       option.setName('quadrant')
//         .setDescription('Quadrant ID (e.g., Q1, Q2)')),
  
//   async execute(interaction) {
//     // ------------------- Retrieve and Normalize User Input -------------------
//     const squareId = interaction.options.getString('square').toUpperCase();
//     const quadrantId = interaction.options.getString('quadrant')?.toUpperCase();

//     console.log(`[viewMap.js:logs] Command invoked - Square: ${squareId}, Quadrant: ${quadrantId || 'None'}`);

//     try {
//       // ------------------- Fetch Map Square Data -------------------
//       const square = await Square.findOne({ squareId });
//       if (!square) {
//         return interaction.reply(`❌ **No square found with ID:** \`${squareId}\``);
//       }

//       const imageUrl = square.image;
//       const regionColor = regionColors[square.region] || '#6ba4ff'; // Use default color if region not found
//       let outputImagePath, embed;

//       // ------------------- Build Embed Message -------------------
//       // Set up the embed message with square information such as region and accessibility.
//       embed = new EmbedBuilder()
//         .setTitle(`Square ${squareId} ${quadrantId ? quadrantId : ''}`)
//         .addFields(
//           { name: 'Region', value: square.region, inline: true },
//           { name: 'Accessibility', value: square.status, inline: true }
//         )
//         .setColor(regionColor);

//       // ------------------- Process Image Based on Quadrant Option -------------------
//       if (quadrantId) {
//         // Validate if the requested quadrant exists.
//         const quadrant = square.quadrants.find(q => q.quadrantId === quadrantId);
//         if (!quadrant) {
//           return interaction.reply(`❌ **Quadrant** \`${quadrantId}\` **does not exist in square** \`${squareId}\`.`);
//         }

//         // If the square is accessible, include additional details about the quadrant.
//         if (square.status !== 'inaccessible') {
//           embed.addFields(
//             { name: 'Status', value: quadrant.status, inline: true },
//             { name: 'Blighted', value: quadrant.blighted ? 'Yes' : 'No', inline: true }
//           );
//           if (quadrant.discoveries && quadrant.discoveries.length > 0) {
//             const discoveriesList = quadrant.discoveries.map(d => d.type).join(', ');
//             embed.addFields({ name: 'Discoveries', value: discoveriesList });
//           }
//         }

//         // Crop the quadrant image from the full square image.
//         outputImagePath = await cropQuadrant(imageUrl, quadrantId);
//         embed.setImage('attachment://quadrant.png');

//         // ------------------- Retrieve Accessible Adjacent Squares -------------------
//         console.log(`[viewMap.js:logs] Fetching accessible squares for: ${squareId} ${quadrantId}`);
//         const accessibleSquares = mapModule.getAdjacentSquares(squareId, quadrantId);
//         console.log(`[viewMap.js:logs] Accessible Squares: ${JSON.stringify(accessibleSquares)}`);
//         const accessibleList = accessibleSquares.map(loc => `${loc.square} ${loc.quadrant}`).join(', ');
//         embed.addFields({ name: 'Accessible Squares', value: accessibleList || 'None', inline: false });
//       } else {
//         // Download the full square image if no quadrant is specified.
//         outputImagePath = await downloadSquareImage(imageUrl);
//         embed.setImage('attachment://full_square.png');
//       }

//       // ------------------- Send the Response -------------------
//       // Create an attachment from the processed image and reply with the embed and attachment.
//       const attachment = new AttachmentBuilder(outputImagePath, { name: quadrantId ? 'quadrant.png' : 'full_square.png' });
//       await interaction.reply({ embeds: [embed], files: [attachment] });
//     } catch (error) {
//     handleError(error, 'viewMap.js');

//       console.error(`[viewMap.js:error] Error processing viewmap command: ${error}`);
//       await interaction.reply('❌ **There was an error retrieving the map data. Please try again later.**');
//     }
//   }
// };
