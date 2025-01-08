// ------------------- Imports -------------------
require('dotenv').config();
const { connectToTinglebot } = require('./database/connection'); // Adjust path if necessary
const Character = require('./models/CharacterModel'); // Adjust path if necessary
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js'); // Discord.js
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID; // Use the same channel as Daily Blight Roll Call

// ------------------- Simulate Blight Death -------------------
async function simulateBlightDeath() {
  try {
    // Connect to Discord and database
    await client.login(process.env.DISCORD_TOKEN); // Ensure DISCORD_TOKEN is set in your .env
    await connectToTinglebot();
    console.log('✅ Connected to Discord and database.');

    // Step 1: Assign stage 5 blight and set a death deadline for "Luar"
    const character = await Character.findOne({ name: 'Luar' });
    if (!character) {
      console.log('❌ Character "Luar" not found.');
      return;
    }

    character.blightStage = 5;
    character.blighted = true;
    character.deathDeadline = new Date(Date.now() + 10 * 1000); // 10 seconds for testing
    await character.save();
    console.log(`🟢 Character ${character.name} set to stage 5 with a simulated death deadline.`);
    console.log('⏲️ Timer set for 10 seconds...');

    // Step 2: Simulate a check for the character's death deadline
    setTimeout(async () => {
      console.log('\n⏳ Timeout triggered, starting death check...');

      const now = new Date();
      const doomedCharacter = await Character.findOne({
        name: 'Luar',
        blightStage: 5,
        deathDeadline: { $lte: now },
      });

      if (doomedCharacter) {
        // Mark the character as dead
        doomedCharacter.blighted = false;
        doomedCharacter.blightStage = 0;
        doomedCharacter.deathDeadline = null; // Clear the deadline
        doomedCharacter.status = 'dead'; // Example field to mark death
        await doomedCharacter.save();

        console.log(`☠ Character ${doomedCharacter.name} has succumbed to the blight and is now marked as dead.`);

        // Post the dramatic death alert in the Blight Notifications channel
        const channel = await client.channels.fetch(channelId);
        if (channel) {
          const embed = new EmbedBuilder()
          .setColor('#AD1457') // Dramatic red for death
          .setTitle(`<:blight_eye:805576955725611058> **Blight Death Alert** <:blight_eye:805576955725611058>`)
          .setDescription(`**${character.name}** has succumbed to Stage 5 Blight..\n\n *This character and all of their items have been removed...*`)
          .setThumbnail(character.icon || 'https://example.com/default-icon.png') // Use the character's icon or a default image
          .setFooter({ text: 'Blight Death Announcement', iconURL: 'https://example.com/blight-icon.png' })
          .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png') // Same image as roll call
          .setTimestamp();

          await channel.send({ embeds: [embed] });
          console.log(`📨 Notification sent to the Community Board for ${doomedCharacter.name}'s death.`);
        } else {
          console.error('❌ Could not find the Blight Notifications channel.');
        }
      } else {
        console.log(`✅ Character "Luar" is still alive or not at risk of death.`);
      }

      console.log('✅ Simulation completed.');

      // Close the connection
      process.exit();
    }, 10 * 1000); // 10 seconds for testing
  } catch (error) {
    console.error('❌ Error during simulation:', error);
  }
}

// ------------------- Run Simulation -------------------
simulateBlightDeath();
