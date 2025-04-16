// ------------------- Imports -------------------
const { Client, GatewayIntentBits } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
require('dotenv').config(); // If you're using .env for the bot token

// ------------------- Client Init -------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ['CHANNEL'],
});

// ------------------- Config -------------------
const targetServerId = '603960955839447050';
const ignoreRoleId = '788148064182730782';
const inviteLink = 'https://discord.gg/7eUN8DAFKJ';

// ------------------- DM Broadcast Logic -------------------
client.once('ready', async () => {
  console.log(`[dmBroadcast.js]: Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(targetServerId);
  const members = await guild.members.fetch();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // ------------------- Split Message -------------------
  const part1 = `# 📢 What is This Message?
You might be wondering... *What is this message? Why am I getting it?*

Tinglebot — the custom bot built for *Roots of the Wild* — is getting close to its first official launch!

Without more testing help, we may have to release an unfinished version of the bot — and we'd really love to avoid that if we can. This is your chance to help shape the future of the server and make sure everything runs smoothly for everyone.

> If you’re already in the server — thank you so much! This is a mass message we’re sending out to everyone.  
> If you haven’t been active for a while, we’d love to have you back and involved again!

Every little bit of help makes a huge difference!`;

  const part2 = `# 🌿 What is Tinglebot?
Tinglebot is the custom bot powering *Roots of the Wild* — our Zelda-inspired Discord server. This bot is built to bring our roleplay world to life with fully automated systems designed for long-term character progression, exploration, and interaction.

This isn’t just a simple dice roller — Tinglebot manages:
- Characters & profiles  
- Vending & shop systems  
- Crafting & gathering  
- Boosting perks & jobs  
- Relics, pets, gear, combat rolls  
- And more — with new features always being added  

# ⚙️ This Will Replace Manual Rolling
Tinglebot is the future of *Roots of the Wild* — it will eventually handle *all* rolling, progression, and systems in the server.

Testing now helps us catch issues early and ensures a smoother experience for everyone once the bot fully takes over.

> Your feedback makes a difference! The more we test together, the better and more fun the final version will be.`;

  const part3 = `# 🛠️ Please Keep in Mind
Many commands are still in progress — some are partially implemented or may not function yet.

We have a living spreadsheet available in the server that tracks the status of commands, systems, and mechanics. Check there if you're unsure what's ready to test!

# 🧪 What Needs Testing
We’re looking for people to just *use* the bot like you normally would — and let us know how it feels!

Things we’re especially looking for help with:
- Are the commands working like you expected?  
- Is the autocomplete showing the right options when you type?  
- Do things make sense or feel confusing?  
- Are there weird errors, missing messages, or things not responding?  
- Is anything frustrating, clunky, or unclear?  

Screenshots and detailed reports are always appreciated!`;

  const part4 = `# 📅 Upcoming Soft Launch Date
We are currently planning a *soft launch* of Tinglebot on:

## **June 5th**

This is when the bot will officially go live for the server — even if some features are still in progress or being polished.

> Please note:
> - There may still be bugs or missing features during this time.  
> - Quests will likely be paused for June as we focus on migrating fully to Tinglebot and stabilizing the new systems.

We encourage everyone to prepare for this date!

# 💡 What Makes a Good Tester
- Try things out — experiment, explore, and see what happens!  
- Report any bugs you find — screenshots and error messages are super helpful.  
- Let us know what feels confusing or difficult to use.  
- Be patient and kind — this is an ongoing project, and every bit of feedback helps us improve.

# 🌱 Final Note
Tinglebot is a huge step forward for *Roots of the Wild* — and it’s built for *you*.

We’re so excited to get everyone involved in testing, improving, and shaping it into something incredible for our community.

Thank you for being part of this adventure!

🔗 Join us again or jump back in: ${inviteLink}`;

  // ------------------- Send Messages -------------------
  for (const [id, member] of members) {
    if (member.user.bot) continue;
    if (member.roles.cache.has(ignoreRoleId)) {
      skipped++;
      continue;
    }

    try {
      await member.send(part1);
      await member.send(part2);
      await member.send(part3);
      await member.send(part4);
      sent++;
    } catch (error) {
    handleError(error, 'dmBrodcast.js');

      console.error(`[dmBroadcast.js]: Failed to DM ${member.user.tag} - ${error.message}`);
      failed++;
    }
  }

  console.log(`[dmBroadcast.js]: DM Broadcast Complete.`);
  console.log(`Sent: ${sent}`);
  console.log(`Skipped (ignored role): ${skipped}`);
  console.log(`Failed to send: ${failed}`);

  process.exit(0);
});

// ------------------- Login -------------------
client.login(process.env.TOKEN);
