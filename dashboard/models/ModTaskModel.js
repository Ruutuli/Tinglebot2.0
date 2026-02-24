const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// ------------------- Assignee Sub-Schema -------------------
// ============================================================================

const AssigneeSchema = new Schema({
    discordId: { type: String, required: true },
    username: { type: String, required: true },
    avatar: { type: String, default: null }
}, { _id: false });

// ============================================================================
// ------------------- Creator Sub-Schema -------------------
// ============================================================================

const CreatorSchema = new Schema({
    discordId: { type: String, required: true },
    username: { type: String, required: true }
}, { _id: false });

// ============================================================================
// ------------------- Repeat Config Sub-Schema -------------------
// ============================================================================

const RepeatConfigSchema = new Schema({
    frequency: { 
        type: String, 
        enum: ['daily', 'weekly', 'monthly', 'quarterly'],
        default: null
    },
    lastCompleted: { type: Date, default: null },
    nextDue: { type: Date, default: null }
}, { _id: false });

// ============================================================================
// ------------------- Checklist Item Sub-Schema -------------------
// ============================================================================

const ChecklistItemSchema = new Schema({
    text: { type: String, required: true, maxlength: 500 },
    checked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// ============================================================================
// ------------------- Comment Sub-Schema -------------------
// ============================================================================

const CommentSchema = new Schema({
    text: { type: String, required: true, maxlength: 2000 },
    author: {
        discordId: { type: String, required: true },
        username: { type: String, required: true },
        avatar: { type: String, default: null }
    },
    createdAt: { type: Date, default: Date.now },
    editedAt: { type: Date, default: null }
});

// ============================================================================
// ------------------- Main ModTask Schema -------------------
// ============================================================================

const ModTaskSchema = new Schema({
    title: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 200
    },
    description: { 
        type: String, 
        default: '',
        maxlength: 2000
    },
    column: { 
        type: String, 
        enum: ['repeating', 'todo', 'in_progress', 'pending', 'done'],
        default: 'todo',
        index: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    dueDate: { 
        type: Date, 
        default: null 
    },
    assignees: {
        type: [AssigneeSchema],
        default: []
    },
    createdBy: {
        type: CreatorSchema,
        required: true
    },
    isRepeating: { 
        type: Boolean, 
        default: false 
    },
    repeatConfig: {
        type: RepeatConfigSchema,
        default: null
    },
    order: { 
        type: Number, 
        default: 0,
        index: true
    },
    // Discord source tracking
    discordSource: {
        messageId: { type: String, default: null, index: true },
        channelId: { type: String, default: null },
        guildId: { type: String, default: null },
        messageUrl: { type: String, default: null }
    },
    // Reminder tracking
    lastReminderSent: { type: Date, default: null },
    // Checklist items
    checklist: {
        type: [ChecklistItemSchema],
        default: []
    },
    // Comments/activity
    comments: {
        type: [CommentSchema],
        default: []
    }
}, { 
    timestamps: true,
    collection: 'modtasks'
});

// ============================================================================
// ------------------- Indexes -------------------
// ============================================================================

ModTaskSchema.index({ column: 1, order: 1 });
ModTaskSchema.index({ 'assignees.discordId': 1 });
ModTaskSchema.index({ dueDate: 1 });

// ============================================================================
// ------------------- Static Methods -------------------
// ============================================================================

ModTaskSchema.statics.getTasksByColumn = function() {
    return this.aggregate([
        {
            $group: {
                _id: '$column',
                tasks: { 
                    $push: '$$ROOT'
                }
            }
        },
        {
            $project: {
                column: '$_id',
                tasks: {
                    $sortArray: {
                        input: '$tasks',
                        sortBy: { order: 1 }
                    }
                }
            }
        }
    ]);
};

ModTaskSchema.statics.getTasksForUser = function(discordId) {
    return this.find({ 'assignees.discordId': discordId })
        .sort({ dueDate: 1, priority: -1 });
};

ModTaskSchema.statics.getOverdueTasks = function() {
    return this.find({
        dueDate: { $lt: new Date() },
        column: { $ne: 'done' }
    }).sort({ dueDate: 1 });
};

ModTaskSchema.statics.getNextOrderInColumn = async function(column) {
    const maxTask = await this.findOne({ column })
        .sort({ order: -1 })
        .select('order');
    return maxTask ? maxTask.order + 1 : 0;
};

ModTaskSchema.statics.findByMessageId = function(messageId) {
    return this.findOne({ 'discordSource.messageId': messageId });
};

ModTaskSchema.statics.getTasksNeedingReminders = function() {
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    return this.find({
        column: { $nin: ['done'] },
        dueDate: { $ne: null, $lte: twoHoursFromNow },
        $or: [
            { lastReminderSent: null },
            { lastReminderSent: { $lt: oneHourAgo } }
        ]
    });
};

// ============================================================================
// ------------------- Instance Methods -------------------
// ============================================================================

ModTaskSchema.methods.isOverdue = function() {
    if (!this.dueDate) return false;
    return new Date() > this.dueDate && this.column !== 'done';
};

ModTaskSchema.methods.isDueSoon = function(hoursThreshold = 24) {
    if (!this.dueDate) return false;
    const threshold = new Date();
    threshold.setHours(threshold.getHours() + hoursThreshold);
    return this.dueDate <= threshold && this.dueDate > new Date() && this.column !== 'done';
};

// ============================================================================
// ------------------- Export -------------------
// ============================================================================

// Delete cached model to ensure schema updates are applied
if (mongoose.models.ModTask) {
    delete mongoose.models.ModTask;
}

module.exports = mongoose.model('ModTask', ModTaskSchema);
