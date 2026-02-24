/**
 * One-time script to fix tasks that have a due date but no assignees.
 * Assigns the task to its creator.
 * 
 * Usage: node bot/scripts/fixUnassignedTasks.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('module-alias/register');
const mongoose = require('mongoose');
const ModTask = require('../models/ModTaskModel');

async function fixUnassignedTasks() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI environment variable is required');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected!\n');

    // Find tasks with due date but no assignees
    const tasksToFix = await ModTask.find({
      dueDate: { $ne: null },
      $or: [
        { assignees: { $exists: false } },
        { assignees: { $size: 0 } }
      ]
    });

    console.log(`Found ${tasksToFix.length} task(s) with due dates but no assignees:\n`);

    if (tasksToFix.length === 0) {
      console.log('No tasks need fixing!');
      await mongoose.disconnect();
      return;
    }

    for (const task of tasksToFix) {
      console.log(`- "${task.title}"`);
      console.log(`  Due: ${task.dueDate?.toISOString()}`);
      console.log(`  Created by: ${task.createdBy?.username} (${task.createdBy?.discordId})`);
      console.log(`  Column: ${task.column}`);
      
      if (task.createdBy?.discordId && task.createdBy?.username) {
        task.assignees = [{
          discordId: task.createdBy.discordId,
          username: task.createdBy.username,
          avatar: null
        }];
        await task.save();
        console.log(`  ✅ Assigned to ${task.createdBy.username}\n`);
      } else {
        console.log(`  ⚠️ No creator info available, skipping\n`);
      }
    }

    console.log('Done!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixUnassignedTasks();
