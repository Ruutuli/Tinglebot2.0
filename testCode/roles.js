// ------------------- Import necessary modules -------------------
const { getAllRaces } = require('../modules/raceModule');
const { jobPerks, getAllJobs } = require('../modules/jobsModule');
const { Client, GatewayIntentBits } = require('discord.js');

// ------------------- Discord Bot Setup -------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const TOKEN = process.env.BOT_TOKEN; // Bot token from environment variables

// ------------------- Utility Functions -------------------
/**
 * Creates a role in the guild.
 * @param {Guild} guild - The Discord guild.
 * @param {string} name - The name of the role.
 * @param {string} color - The color of the role (optional).
 */
const createRole = async (guild, name, color = null) => {
  try {
    // Check if role already exists
    const existingRole = guild.roles.cache.find(role => role.name === name);
    if (existingRole) {
      console.log(`[Roles]: Role "${name}" already exists. Skipping creation.`);
      return existingRole;
    }

    const role = await guild.roles.create({
      name,
      color: color || null,
    });
    console.log(`[Roles]: Role "${name}" created successfully.`);
    return role;
  } catch (error) {
    console.error(`[Roles]: Error creating role "${name}":`, error.message);
  }
};

/**
 * Deletes duplicate roles in the guild.
 * @param {Guild} guild - The Discord guild.
 */
const removeDuplicateRoles = async (guild) => {
  try {
    const roleNames = new Set();
    for (const role of guild.roles.cache.values()) {
      if (roleNames.has(role.name)) {
        console.log(`[Roles]: Deleting duplicate role "${role.name}".`);
        await role.delete();
      } else {
        roleNames.add(role.name);
      }
    }
  } catch (error) {
    console.error('[Roles]: Error removing duplicate roles:', error.message);
  }
};

// ------------------- Generate Roles -------------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Replace with your target guild ID
  const guildId = '1305484048063529002';
  const guild = client.guilds.cache.get(guildId);

  if (!guild) {
    console.error('[Roles]: Guild not found. Please check the guild ID.');
    return;
  }

  console.log('[Roles]: Starting role creation process...');

  // Define village colors
  const villageColors = {
    Inariko: '#277ecd',
    Rudania: '#d7342a',
    Vhintl: '#25c059',
  };

  try {
    // Remove duplicate roles before creating new ones
    await removeDuplicateRoles(guild);

    // Create roles for village residents and visitors
    const villages = ['Rudania', 'Inariko', 'Vhintl'];
    for (const village of villages.sort()) {
      const color = villageColors[village] || null;
      await createRole(guild, `${village} Resident`, color);
      await createRole(guild, `${village} Visiting`, color);
    }

    // Create roles for races
    const races = getAllRaces();
    if (!Array.isArray(races) || races.length === 0) {
      console.warn('[Roles]: No races found. Skipping race role creation.');
    } else {
      for (const race of races.sort()) {
        await createRole(guild, `Race: ${race}`, '#5c5c5c');
      }
    }

    // Create roles for jobs
    const jobs = getAllJobs();
    if (!Array.isArray(jobs) || jobs.length === 0) {
      console.warn('[Roles]: No jobs found. Skipping job role creation.');
    } else {
      for (const job of jobs.sort()) {
        await createRole(guild, `Job: ${job}`, '#5e626e');
      }
    }

    // Create roles for job perks
    if (!Array.isArray(jobPerks) || jobPerks.length === 0) {
      console.warn('[Roles]: No job perks found. Skipping job perk role creation.');
    } else {
      const uniquePerks = Array.from(new Set(jobPerks.map(perk => perk.perk))).sort();
      for (const perk of uniquePerks) {
        await createRole(guild, `Job Perk: ${perk}`, '#8b96b8');
      }
    }
  } catch (error) {
    console.error('[Roles]: Error during role creation process:', error.message);
  }

  console.log('[Roles]: Role creation process completed.');
  process.exit(); // Exit the process once roles are created
});

// ------------------- Login to Discord -------------------
client.login(TOKEN);
