// ============================================================================
// Standard Libraries
// ============================================================================
// ------------------- File system and path modules -------------------
const fs = require('fs');
const { handleError } = require('../../utils/globalErrorHandler.js');
const path = require('path');

// ============================================================================
// Discord.js Components
// ============================================================================
// ------------------- Import SlashCommandBuilder from discord.js -------------------
const { SlashCommandBuilder } = require('discord.js');

// ============================================================================
// Database Services
// ============================================================================
// ------------------- Import Relic Service functions -------------------
const { 
  fetchRelicById, 
  archiveRelic, 
  appraiseRelic,
  createRelic
} = require('../../database/relicService.js');
// ------------------- Import Character Service functions -------------------
const { fetchCharacterByNameAndUserId } = require('../../database/characterService.js');

// ============================================================================
// Modules
// ============================================================================
// ------------------- Import game location modules -------------------
const locationsModule = require('../../modules/locationsModule.js');
const MapModule = require('../../modules/mapModule.js');

// ============================================================================
// Utility Functions
// ============================================================================
// ------------------- Import unique ID generator -------------------
const { generateUniqueId } = require('../../utils/uniqueIdUtils.js');
// ------------------- Import submission storage operations -------------------
const { saveSubmissionToStorage, retrieveSubmissionFromStorage, deleteSubmissionFromStorage } = require('../../utils/storage.js');
// ------------------- Import inventory utility functions -------------------
const { addItemInventoryDatabase } = require('../../utils/inventoryUtils.js');

// ============================================================================
// Configuration and Paths
// ============================================================================
// ------------------- Define the path for relicStorage.json -------------------
const relicStoragePath = path.join(__dirname, '..', 'data', 'relicStorage.json');

// ============================================================================
// Command Definition for Relic Operations
// ============================================================================
// ------------------- Define the /relic command and its subcommands -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('relic')
    .setDescription('📜 Manage Relic Appraisals and Archival')

    // ------------------- /relic info: View info on an appraised relic -------------------
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('View info on an appraised relic')
        .addStringOption(opt =>
          opt
            .setName('relic_id')
            .setDescription('Relic ID')
            .setRequired(true)
        )
    )

    // ------------------- /relic submit: Submit an appraised relic to the archives -------------------
    .addSubcommand(sub =>
      sub
        .setName('submit')
        .setDescription('Submit an appraised relic to the archives')
        .addStringOption(opt =>
          opt
            .setName('relic_id')
            .setDescription('Appraised Relic ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('image_url')
            .setDescription('PNG image URL for the relic (must be 1:1 and at least 500x500)')
            .setRequired(true)
        )
    )

    // ------------------- /relic appraisalrequest: Request appraisal for a found relic -------------------
    .addSubcommand(sub =>
      sub
        .setName('appraisalrequest')
        .setDescription('Request appraisal for a found relic (Discovery is via /explore – integration pending)')
        .addStringOption(opt =>
          opt
            .setName('character')
            .setDescription('Name of the relic owner')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt
            .setName('relic_id')
            .setDescription('ID of the relic to be appraised')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('appraiser')
            .setDescription('Name of the intended appraiser')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt
            .setName('payment')
            .setDescription('Payment offered for appraisal')
            .setRequired(true)
        )
    )

    // ------------------- /relic appraisalaccept: Accept an appraisal request and process appraisal -------------------
    .addSubcommand(sub =>
      sub
        .setName('appraisalaccept')
        .setDescription('Accept an appraisal request and process appraisal (automatic table roll)')
        .addStringOption(opt =>
          opt
            .setName('appraiser')
            .setDescription('Name of the appraiser (must match request)')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt
            .setName('appraisal_id')
            .setDescription('ID of the appraisal request to accept')
            .setRequired(true)
        )
    )

    // ------------------- /relic test: Assign a random unappraised relic to a character for testing -------------------
    .addSubcommand(sub =>
      sub
        .setName('test')
        .setDescription('Test: Assign a random unappraised relic to a character')
        .addStringOption(opt =>
          opt
            .setName('character')
            .setDescription('Name of the character')
            .setRequired(true)
        )
    ),

  // ============================================================================ 
  // Command Execution Handler for Relic Operations
  // ============================================================================ 
  async execute(interaction) {
    // ------------------- Determine which subcommand was invoked -------------------
    const sub = interaction.options.getSubcommand();

    // ------------------- Check Interaction Age -------------------
    if (Date.now() - interaction.createdTimestamp > 2500) {
      console.warn(`[relic.js]: Interaction token is too old (${Date.now() - interaction.createdTimestamp}ms) for subcommand "${sub}".`);
      return interaction.reply({ content: '❌ Interaction expired. Please try again.', ephemeral: true });
    }

    // ------------------- Defer reply for asynchronous subcommands -------------------
    if (["test", "appraisalrequest", "appraisalaccept"].includes(sub)) {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply();
        }
      } catch (error) {
    handleError(error, 'relic.js');

        if (error.code === 40060) {
          console.warn(`[relic.js]: Interaction already acknowledged for subcommand "${sub}".`);
        } else if (error.code === 10062) {
          console.error(`[relic.js]: Interaction expired or no longer valid for subcommand "${sub}".`);
          return;
        } else {
          console.error(`[relic.js]: Unexpected error deferring reply for subcommand "${sub}":`, error);
          return;
        }
      }
    }

    try {
      // ------------------- /relic test: Assign a random unappraised relic to a character -------------------
      if (sub === 'test') {
        // Generate a random location.
        const regionNames = Object.keys(locationsModule.locations.Regions);
        const randomRegion = regionNames[Math.floor(Math.random() * regionNames.length)];
        const mapModule = new MapModule();
        const randomColumn = mapModule.columns[Math.floor(Math.random() * mapModule.columns.length)];
        const randomRow = mapModule.rows[Math.floor(Math.random() * mapModule.rows.length)];
        const randomQuadrant = mapModule.quadrants[Math.floor(Math.random() * mapModule.quadrants.length)];
        const generatedLocation = `${randomRegion} - ${randomColumn}${randomRow}, ${randomQuadrant}`;

        // ------------------- Create relic data object locally -------------------
        // Generate a custom relic ID using generateUniqueId('R').
        const customRelicID = generateUniqueId('R');
        const relicData = {
          relicId: customRelicID, // This value should be "R" followed by a number.
          name: 'Unappraised Relic',
          discoveredBy: interaction.options.getString('character'),
          locationFound: generatedLocation,
          discoveredDate: new Date()
        };

        // IMPORTANT: For the test subcommand, we DO NOT write to MongoDB.
        // Simply use the locally created relicData as our relic object.
        const relic = relicData;  // Do not call createRelic() here!

        // ------------------- Save relic info to relicStorage.json locally -------------------
        let relicStorage = [];
        if (fs.existsSync(relicStoragePath)) {
          try {
            const fileData = fs.readFileSync(relicStoragePath, 'utf8');
            relicStorage = fileData.trim() ? JSON.parse(fileData) : [];
          } catch (err) {
    handleError(err, 'relic.js');

            console.error('[relic.js]: Error reading relicStorage.json:', err);
            relicStorage = [];
          }
        }
        relicStorage.push({
          relicId: relic.relicId,
          name: relic.name,
          discoveredBy: relic.discoveredBy,
          locationFound: relic.locationFound,
          discoveredDate: relic.discoveredDate.toISOString()
        });
        try {
          fs.writeFileSync(relicStoragePath, JSON.stringify(relicStorage, null, 2));
        } catch (err) {
    handleError(err, 'relic.js');

          console.error('[relic.js]: Error writing to relicStorage.json:', err);
        }

        // ------------------- Final Response for test subcommand with failsafe -------------------
        try {
          await interaction.editReply(`🗺️ **Test Relic Given to ${relic.discoveredBy}!**
> **Relic ID:** \`${relic.relicId}\`
> **Location:** ${relic.locationFound}

*You can now use /relic appraisalrequest to request its appraisal.*`);
        } catch (finalError) {
    handleError(finalError, 'relic.js');

          // If editReply fails because no reply was sent, fall back to a direct reply.
          if (finalError.code === 'InteractionNotReplied' || finalError.message.includes("has not been sent or deferred")) {
            try {
              await interaction.reply(`🗺️ **Test Relic Given to ${relic.discoveredBy}!**
> **Relic ID:** \`${relic.relicId}\`
> **Location:** ${relic.locationFound}

*You can now use /relic appraisalrequest to request its appraisal.*`);
            } catch (fallbackError) {
    handleError(fallbackError, 'relic.js');

              console.error('[relic.js]: Failed to send fallback reply in test subcommand:', fallbackError);
            }
          } else {
            console.error('[relic.js]: Failed to send final response in test subcommand:', finalError);
          }
        }
        return;
      }
      
      // ------------------- /relic info: View information on an appraised relic -------------------
      else if (sub === 'info') {
        const relicId = interaction.options.getString('relic_id');
        const relic = await fetchRelicById(relicId);
        if (!relic) {
          return interaction.reply({ content: '❌ No relic found by that ID.', ephemeral: true });
        }
        if (!relic.appraised) {
          return interaction.reply({ content: '❌ This relic has not been appraised yet.', ephemeral: true });
        }
        // Construct an embed message for the relic.
        const embed = {
          title: `${relic.name} (\`${relic._id}\`)`,
          description: relic.appraisalDescription,
          fields: [
            { name: 'Discovered By', value: relic.discoveredBy, inline: true },
            { name: 'Location', value: relic.locationFound || 'Unknown', inline: true },
            { name: 'Appraised By', value: relic.appraisedBy || '—', inline: true },
            { name: 'Art Submitted', value: relic.artSubmitted ? '✅' : '❌', inline: true },
            { name: 'Archived', value: relic.archived ? '✅' : '❌', inline: true },
            { name: 'Deteriorated', value: relic.deteriorated ? '⚠️ Yes' : 'No', inline: true }
          ]
        };
        return interaction.reply({ embeds: [embed] });
      }
      
      // ------------------- /relic submit: Submit an appraised relic to the archives -------------------
      else if (sub === 'submit') {
        const relicId = interaction.options.getString('relic_id');
        const imageUrl = interaction.options.getString('image_url');
        const relic = await fetchRelicById(relicId);
        if (!relic) {
          return interaction.reply({ content: '❌ Relic not found.', ephemeral: true });
        }
        if (!relic.appraised) {
          return interaction.reply({ content: '❌ Only appraised relics can be submitted to the archives.', ephemeral: true });
        }
        if (relic.archived) {
          return interaction.reply({ content: '❌ This relic has already been submitted to the archives.', ephemeral: true });
        }
        // Archive the relic with the provided image URL.
        const updatedRelic = await archiveRelic(relicId, imageUrl);
        if (!updatedRelic) {
          return interaction.reply({ content: '❌ Failed to update the relic.', ephemeral: true });
        }
        return interaction.reply(`🖼️ **Relic submitted to the archives!** View: ${imageUrl}`);
      }
      
      // ------------------- /relic appraisalrequest: Request appraisal for a found relic -------------------
      else if (sub === 'appraisalrequest') {
        const character = interaction.options.getString('character');
        const relicId = interaction.options.getString('relic_id');
        const appraiser = interaction.options.getString('appraiser');
        const payment = interaction.options.getString('payment');
        const appraisalId = generateUniqueId('A');
        
        // Build the appraisal request data object.
        const appraisalData = {
          type: "appraisalRequest",
          character,
          relic_id: relicId,
          appraiser,
          payment,
          createdAt: Date.now()
        };
        
        // Save the appraisal request to persistent storage.
        saveSubmissionToStorage(appraisalId, appraisalData);
        
        return interaction.editReply(`📜 Appraisal request created!
> **Appraisal ID:** \`${appraisalId}\`
> Owner: **${character}**
> Intended Appraiser: **${appraiser}**
> Payment: **${payment}**

*(Note: Discovery is handled by /explore – integration pending.)*`);
      }
      
      // ------------------- /relic appraisalaccept: Accept an appraisal request and process appraisal -------------------
      else if (sub === 'appraisalaccept') {
        const providedAppraiser = interaction.options.getString('appraiser');
        const appraisalId = interaction.options.getString('appraisal_id');
        
        // Retrieve the appraisal request from persistent storage.
        const request = retrieveSubmissionFromStorage(appraisalId);
        if (!request) {
          return interaction.editReply({ content: `❌ No appraisal request found with ID \`${appraisalId}\`.`, ephemeral: true });
        }
        
        // Validate the appraiser name (case-insensitive).
        if (request.appraiser.toLowerCase() !== providedAppraiser.toLowerCase()) {
          return interaction.editReply({ content: `❌ Appraiser mismatch. This request is assigned to **${request.appraiser}**.`, ephemeral: true });
        }
        
        // Execute an automatic table roll to determine appraisal outcome.
        const outcomes = [
          'a blank',
          'an ancient scroll',
          'a mystical amulet',
          'a weathered coin'
        ];
        const randomOutcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        const autoDescription = `Item appraised! It's ${randomOutcome}!`;
        
        // Update the relic with appraisal details and outcome.
        const updatedRelic = await appraiseRelic(request.relic_id, providedAppraiser, autoDescription, randomOutcome);
        if (!updatedRelic) {
          return interaction.editReply({ content: '❌ Failed to update relic appraisal. Please check the relic ID.', ephemeral: true });
        }
        
        // Remove the processed appraisal request from storage.
        deleteSubmissionFromStorage(appraisalId);
        
        return interaction.editReply(`📜 **Relic appraised by ${providedAppraiser}!**
> ${autoDescription}
> **Relic ID:** \`${request.relic_id}\``);
      }
      
      // ------------------- Unknown subcommand: Respond when an invalid subcommand is used -------------------
      else {
        return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
      }
    } catch (error) {
    handleError(error, 'relic.js');

      console.error('[relic.js]: Error executing relic command:', error);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: '❌ Something went wrong.', ephemeral: true });
      } else {
        return interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
      }
    }
  }
};
