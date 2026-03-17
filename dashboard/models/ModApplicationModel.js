// ------------------- Mod Application -------------------
// ROTW mod applications; submitted via dashboard, reviewed by staff.
const mongoose = require("mongoose");
const { Schema } = mongoose;

const ModApplicationSchema = new Schema(
  {
    submitterUserId: { type: String, required: true },
    submitterDiscordUsername: { type: String, default: "" },

    discordUsername: { type: String, required: true },
    timePerWeek: { type: String, required: true },
    conflictHandling: { type: Number, required: true, min: 1, max: 10 },
    comfortableModeratingNsfw: { type: String, required: true, enum: ["Yes", "No"] },
    timezoneAndAvailability: { type: String, required: true },
    howLongInGroup: { type: String, required: true },
    reprimandingApproach: { type: String, required: true },
    workingAsTeam: { type: String, required: true },
    discordModExperience: { type: Number, required: true, min: 1, max: 10 },
    framerExperience: { type: Number, required: true, min: 1, max: 10 },
    specialSkills: { type: String, required: true },

    gameMechanicsExperience: { type: String, required: true },
    gameMechanicsSystems: { type: String, default: "" },
    ideasForMechanics: { type: String, required: true },
    npcExperience: { type: String, required: true },
    npcApproach: { type: String, default: "" },
    comfortableLoreDevelopment: { type: String, required: true },
    loreTasksEnjoy: { type: String, default: "" },
    documentationComfort: { type: String, required: true },
    documentationExperience: { type: String, default: "" },
    visualAssetsExperience: { type: String, required: true },
    visualAssetsTools: { type: String, default: "" },
    visualContentManagement: { type: String, required: true, enum: ["Yes", "No", "Maybe"] },
    visualContentDetails: { type: String, default: "" },
    socialMediaManagement: { type: String, required: true, enum: ["Yes", "No", "Maybe"] },
    socialMediaDetails: { type: String, default: "" },

    scenarioTraveller: { type: String, required: true },
    scenarioTriggerWarning: { type: String, required: true },
    scenarioNsfwOption: { type: String, required: true },
    faqExample1: { type: String, default: "" },
    faqExample2: { type: String, default: "" },
    faqExample3: { type: String, default: "" },
    faqExample4: { type: String, default: "" },
    rulesKnowledge: { type: String, default: "" },

    otherComments: { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "modapplications" }
);

ModApplicationSchema.index({ submitterUserId: 1 });
ModApplicationSchema.index({ status: 1 });
ModApplicationSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.ModApplication ||
  mongoose.model("ModApplication", ModApplicationSchema);
