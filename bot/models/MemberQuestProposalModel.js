// ------------------- Member Quest Proposal -------------------
// Members submit quest proposals; mods approve (creates Quest) or reject.
const mongoose = require("mongoose");
const { Schema } = mongoose;

const MemberQuestProposalSchema = new Schema(
  {
    submitterUserId: { type: String, required: true },
    submitterUsername: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectReason: { type: String, default: null },
    reviewedByUserId: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    approvedQuestId: { type: String, default: null }, // questID of created Quest
    // Template fields
    title: { type: String, required: true },
    locations: { type: String, default: "" },
    date: { type: String, default: "" },
    timeLimit: { type: String, default: "" },
    timePerRound: { type: String, default: "" },
    type: { type: String, default: "" }, // RP / Interactive / Art / Writing
    specialEquipment: { type: String, default: "" },
    rewards: { type: String, default: "" },
    partySize: { type: String, default: "" },
    signUpFormLink: { type: String, default: "" },
    questDescription: { type: String, default: "" },
    questSummary: { type: String, default: "" },
    gameplayDescription: { type: String, default: "" },
    gameRules: { type: String, default: "" },
    runningEventDescription: { type: String, default: "" },
    // Quest-model-aligned fields
    signupDeadline: { type: String, default: "" },
    postRequirement: { type: Number, default: null },
    collabAllowed: { type: Boolean, default: false },
    collabRule: { type: String, default: "" },
    artWritingMode: { type: String, enum: ["both", "either"], default: "both" },
    tableRollName: { type: String, default: "" },
    requiredRolls: { type: Number, default: null },
    minRequirements: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "memberquestproposals" }
);

MemberQuestProposalSchema.index({ status: 1 });
MemberQuestProposalSchema.index({ submitterUserId: 1 });

MemberQuestProposalSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.MemberQuestProposal ||
  mongoose.model("MemberQuestProposal", MemberQuestProposalSchema);
