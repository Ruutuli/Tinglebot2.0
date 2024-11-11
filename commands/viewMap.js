// viewMap.js

const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const sharp = require('sharp');
const axios = require('axios');
const Square = require('../models/mapModel');
const MapModule = require('../modules/mapModule'); // Corrected path for mapModule

// Initialize mapModule for access to movement rules
const mapModule = new MapModule();

// Map region colors
const regionColors = {
  'Eldin': '#FF0000', // Red
  'Lanayru': '#0000FF', // Blue
  'Faron': '#008000', // Green
  'Central Hyrule': '#00FFFF', // Teal/Cyan
  'Gerudo': '#FFA500', // Orange
  'Hebra': '#800080', // Purple
};

// Function to download the full square image using the image URL from MongoDB
async function downloadSquareImage(imageUrl) {
  const response = await axios({ url: imageUrl, responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  const outputPath = './full_square.png';

  await sharp(buffer).toFile(outputPath);
  return outputPath;
}

// Function to crop and return quadrant image based on the specified URL
async function cropQuadrant(imageUrl, quadrant) {
  const response = await axios({ url: imageUrl, responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);

  let cropRegion;
  switch (quadrant) {
    case 'Q1': cropRegion = { left: 0, top: 0, width: 498, height: 488 }; break;
    case 'Q2': cropRegion = { left: 502, top: 0, width: 498, height: 488 }; break;
    case 'Q3': cropRegion = { left: 0, top: 514, width: 498, height: 488 }; break;
    case 'Q4': cropRegion = { left: 502, top: 514, width: 498, height: 488 }; break;
    default: throw new Error('Invalid quadrant specified');
  }

  const outputPath = `./cropped_${quadrant}.png`;
  await sharp(buffer).extract(cropRegion).toFile(outputPath);

  return outputPath;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('viewmap')
    .setDescription('View the status of a specific quadrant or full square.')
    .addStringOption(option => 
      option.setName('square')
        .setDescription('Square ID (e.g., A1, B2)')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('quadrant')
        .setDescription('Quadrant ID (e.g., Q1, Q2)')),

  async execute(interaction) {
    const squareId = interaction.options.getString('square').toUpperCase();
    const quadrantId = interaction.options.getString('quadrant')?.toUpperCase();

    console.log(`ViewMap Command Invoked - Square: ${squareId}, Quadrant: ${quadrantId}`); // Log initial input

    try {
      const square = await Square.findOne({ squareId });
      if (!square) {
        return interaction.reply(`No square found with ID: ${squareId}`);
      }

      const imageUrl = square.image;
      const regionColor = regionColors[square.region] || '#6ba4ff'; // Default color if not found
      let outputImagePath, embed;

      // Set up the embed with Region and Accessibility
      embed = new EmbedBuilder()
      .setTitle(`Square ${squareId} ${quadrantId ? quadrantId : ''}`)
        .addFields(
          { name: 'Region', value: square.region, inline: true },
          { name: 'Accessibility', value: square.status, inline: true }
        )
        .setColor(regionColor);

      // Check if quadrant-specific data is requested and accessible
      if (quadrantId) {
        const quadrant = square.quadrants.find(q => q.quadrantId === quadrantId);
        if (!quadrant) {
          return interaction.reply(`Quadrant ${quadrantId} does not exist in square ${squareId}.`);
        }

        // Exclude Status and Blighted for inaccessible squares, otherwise include full details
        if (square.status !== 'inaccessible') {
          embed.addFields(
            { name: 'Status', value: quadrant.status, inline: true },
            { name: 'Blighted', value: quadrant.blighted ? 'Yes' : 'No', inline: true }
          );

          if (quadrant.discoveries && quadrant.discoveries.length > 0) {
            const discoveriesList = quadrant.discoveries.map(d => d.type).join(', ');
            embed.addFields({ name: 'Discoveries', value: discoveriesList });
          }
        }

        outputImagePath = await cropQuadrant(imageUrl, quadrantId);
        embed.setImage('attachment://quadrant.png');

        // Fetch accessible squares and quadrants
        console.log(`Fetching Accessible Squares from: ${squareId} ${quadrantId}`); // Log for accessible squares
        const accessibleSquares = mapModule.getAdjacentSquares(squareId, quadrantId);
        console.log('Accessible Squares:', accessibleSquares); // Log the result from getAdjacentSquares
        const accessibleList = accessibleSquares.map(loc => `${loc.square} ${loc.quadrant}`).join(', ');
        embed.addFields({ name: 'Accessible Squares', value: accessibleList || 'None', inline: false });

      } else {
        outputImagePath = await downloadSquareImage(imageUrl);
        embed.setImage('attachment://full_square.png');
      }

      const attachment = new AttachmentBuilder(outputImagePath, { name: quadrantId ? 'quadrant.png' : 'full_square.png' });
      await interaction.reply({ embeds: [embed], files: [attachment] });

    } catch (error) {
      console.error(`Error fetching square data: ${error}`);
      await interaction.reply('There was an error retrieving the map data. Please try again later.');
    }
  }
};
