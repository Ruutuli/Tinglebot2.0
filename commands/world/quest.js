// const { SlashCommandBuilder } = require('@discordjs/builders');
// const { handleError } = require('../../utils/globalErrorHandler');
// const { EmbedBuilder } = require('discord.js');
// const Quest = require('../../models/QuestModel');
// const Character = require('../../models/CharacterModel');
// const QUEST_CHANNEL_ID = '1305486549252706335';

// module.exports = {
//     data: new SlashCommandBuilder()
//         .setName('quest')
//         .setDescription('Join a quest with your character.')
//         .addStringOption(option =>
//             option
//                 .setName('charactername')
//                 .setDescription('The name of your character.')
//                 .setRequired(true)
//                 .setAutocomplete(true)
//         )
//         .addStringOption(option =>
//             option
//                 .setName('questid')
//                 .setDescription('The ID of the quest you want to join.')
//                 .setRequired(true)
//                 .setAutocomplete(true)
//         ),
    
//     async execute(interaction) {
//         const characterName = interaction.options.getString('charactername');
//         const questID = interaction.options.getString('questid');
//         const userID = interaction.user.id;
//         const userName = interaction.user.username;

//         try {
//             const quest = await Quest.findOne({ questID });
//             if (!quest) {
//                 return interaction.reply({
//                     content: `❌ Quest with ID \`${questID}\` does not exist.`,
//                     ephemeral: true
//                 });
//             }

//             if (quest.status !== 'active') {
//                 return interaction.reply({
//                     content: `❌ The quest \`${quest.title}\` is no longer active.`,
//                     ephemeral: true
//                 });
//             }

//             const now = new Date();
//             if (quest.signupDeadline) {
//                 const deadline = new Date(quest.signupDeadline);
//                 if (now > deadline) {
//                     return interaction.reply({
//                         content: `❌ The signup deadline for quest \`${quest.title}\` has passed.`,
//                         ephemeral: true
//                     });
//                 }
//             }

//             const character = await Character.findOne({ 
//                 name: characterName, 
//                 userId: userID 
//             });
            
//             if (!character) {
//                 return interaction.reply({
//                     content: `❌ You don't own a character named \`${characterName}\`. Please use one of your registered characters.`,
//                     ephemeral: true
//                 });
//             }

//             if (quest.participants.has(userID)) {
//                 return interaction.reply({
//                     content: `❌ You are already participating in the quest \`${quest.title}\` with character **${quest.participants.get(userID)}**.`,
//                     ephemeral: true
//                 });
//             }

//             if (quest.participantCap && quest.participants.size >= quest.participantCap) {
//                 return interaction.reply({
//                     content: `❌ The quest \`${quest.title}\` has reached its participant limit of ${quest.participantCap}.`,
//                     ephemeral: true
//                 });
//             }

//             switch (quest.questType.toLowerCase()) {
//                 case 'rp':
//                     if (quest.posted) {
//                         const questPostDate = new Date(quest.date);
//                         const rpSignupDeadline = new Date(questPostDate.getTime() + (7 * 24 * 60 * 60 * 1000)); // 1 week
                        
//                         if (now > rpSignupDeadline) {
//                             return interaction.reply({
//                                 content: `❌ The signup window for RP quest \`${quest.title}\` has closed. RP quests have a 1-week signup window.`,
//                                 ephemeral: true
//                             });
//                         }
//                     }
//                     break;
                
//                 case 'interactive':
//                     if (quest.minRequirements > 0) {
//                     }
//                     break;
//             }

//             if (quest.participantCap) {
//                 const otherCappedQuests = await Quest.find({
//                     participantCap: { $ne: null },
//                     status: 'active',
//                     questID: { $ne: questID }
//                 });

//                 for (const otherQuest of otherCappedQuests) {
//                     if (otherQuest.participants.has(userID)) {
//                         return interaction.reply({
//                             content: `❌ You are already participating in another member-capped quest (\`${otherQuest.title}\`). You can only join one member-capped quest at a time.`,
//                             ephemeral: true
//                         });
//                     }
//                 }
//             }

//             const role = interaction.guild.roles.cache.find(r => r.id === quest.roleID);
//             if (!role) {
//                 return interaction.reply({
//                     content: `❌ The role for this quest does not exist. Please contact an admin.`,
//                     ephemeral: true
//                 });
//             }

//             const member = interaction.guild.members.cache.get(userID);
//             if (!member) {
//                 return interaction.reply({
//                     content: `❌ Unable to find your guild member record.`,
//                     ephemeral: true
//                 });
//             }

//             await member.roles.add(role);

//             quest.participants.set(userID, characterName);
//             await quest.save();

//             if (quest.messageID) {
//                 try {
//                     const questChannel = interaction.guild.channels.cache.get(QUEST_CHANNEL_ID);
//                     const questMessage = await questChannel.messages.fetch(quest.messageID);

//                     if (questMessage) {
//                         const embed = EmbedBuilder.from(questMessage.embeds[0]);
                        
//                         const participantEntries = Array.from(quest.participants.entries());
//                         const participantList = participantEntries.length > 0 
//                             ? participantEntries.map(([userId, charName]) => `• ${charName}`).join('\n')
//                             : 'None';

//                         const updatedFields = embed.data.fields.map(field => {
//                             if (field.name === '👥 Participants') {
//                                 const participantCount = quest.participantCap 
//                                     ? `(${participantEntries.length}/${quest.participantCap})`
//                                     : `(${participantEntries.length})`;
                                
//                                 return {
//                                     ...field,
//                                     name: `👥 Participants ${participantCount}`,
//                                     value: participantList.length > 1024 
//                                         ? participantList.substring(0, 1021) + '...' 
//                                         : participantList
//                                 };
//                             }
//                             return field;
//                         });

//                         embed.setFields(updatedFields);
//                         await questMessage.edit({ embeds: [embed] });
//                     }
//                 } catch (embedError) {
//                     console.warn('[WARNING]: Failed to update quest embed:', embedError);
//                 }
//             }

//             let successMessage = `✅ **${userName}** joined the quest **${quest.title}** with character **${characterName}**!`;
            
//             if (quest.questType.toLowerCase() === 'rp' && quest.postRequirement) {
//                 successMessage += `\n📝 **Reminder**: This RP quest requires a minimum of ${quest.postRequirement} posts with a maximum of 2 paragraphs each.`;
//             }
            
//             if (quest.timeLimit) {
//                 successMessage += `\n⏰ **Time Limit**: ${quest.timeLimit}`;
//             }

//             return interaction.reply({
//                 content: successMessage,
//                 ephemeral: true
//             });

//         } catch (error) {
//             handleError(error, 'quest.js');
//             console.error('[ERROR]: Failed to process quest participation:', error);
            
//             return interaction.reply({
//                 content: `❌ An error occurred while processing your request. Please try again later.`,
//                 ephemeral: true
//             });
//         }
//     }
// };