const { SlashCommandBuilder } = require('discord.js'); // For creating slash commands
const { attemptFlee } = require('../modules/rngModule'); // Import the flee function
const { fetchCharacterByNameAndUserId } = require('../database/characterService'); // Fetch character data

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test') // Command name
        .setDescription('Test the flee mechanic') // Description
        .addStringOption(option =>
            option
                .setName('charactername')
                .setDescription('The name of the character')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('monster_tier')
                .setDescription('Tier of the monster to simulate flee from')
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const characterName = interaction.options.getString('charactername');
            const monsterTier = interaction.options.getInteger('monster_tier');

            // Fetch character data
            const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
            if (!character) {
                await interaction.editReply({
                    content: `❌ **Character "${characterName}" not found or doesn't belong to you!**`,
                });
                return;
            }

            if (character.stamina < 1) {
                await interaction.editReply({
                    content: `❌ **Character "${characterName}" does not have enough stamina to flee!**`,
                });
                return;
            }

            // Calculate flee chance with failed attempts
            const baseFleeChance = 0.5; // Base 50% chance
            const bonusFleeChance = character.failedFleeAttempts * 0.05; // 5% bonus per failed attempt
            const fleeChance = Math.min(baseFleeChance + bonusFleeChance, 0.95); // Cap at 95%
            const fleeChancePercentage = fleeChance * 100;

            // Simulate monster object based on tier
            const monster = { tier: monsterTier, attack: 10 }; // Example monster stats

            // Test flee function
            const result = await attemptFlee(character, monster);

            // Build detailed response
            let responseMessage = `🌀 **Flee Test Result:**\n`;
            responseMessage += `- **Character:** ${character.name}\n`;
            responseMessage += `- **Monster Tier:** ${monster.tier}\n`;
            responseMessage += `- **Base Flee Chance:** 50%\n`;
            responseMessage += `- **Failed Flee Attempts:** ${character.failedFleeAttempts}\n`;
            responseMessage += `- **Bonus Flee Chance:** ${(bonusFleeChance * 100).toFixed(1)}%\n`;
            responseMessage += `- **Total Flee Chance:** ${fleeChancePercentage.toFixed(1)}%\n`;
            responseMessage += `- **Flee Success:** ${result.success ? '✅ Yes' : '❌ No'}\n`;

            if (!result.success) {
                responseMessage += result.attacked
                    ? `- **Monster Attack:** Yes, dealt **${result.damage}** damage.\n`
                    : `- **Monster Attack:** No\n`;
            }

            // Log additional debug info to the console
            console.log(`[TEST COMMAND] Flee Test Results for Character: ${character.name}`);
            console.log(`[TEST COMMAND] Monster Tier: ${monsterTier}`);
            console.log(`[TEST COMMAND] Failed Flee Attempts: ${character.failedFleeAttempts}`);
            console.log(`[TEST COMMAND] Bonus Flee Chance: ${(bonusFleeChance * 100).toFixed(1)}%`);
            console.log(`[TEST COMMAND] Total Flee Chance: ${fleeChancePercentage.toFixed(1)}%`);
            console.log(`[TEST COMMAND] Flee Success: ${result.success}`);
            console.log(result.attacked
                ? `[TEST COMMAND] Monster attacked and dealt ${result.damage} damage.`
                : `[TEST COMMAND] Monster did not attack.`
            );

            await interaction.editReply({ content: responseMessage });
        } catch (error) {
            console.error('[TEST ERROR]', error);
            await interaction.editReply({
                content: `❌ **An error occurred during the test command execution.**`,
            });
        }
    },
};
