// ============================================================================
// CraftingRequest — dashboard commission / crafting request board
// ============================================================================

const mongoose = require("mongoose");
const { Schema } = mongoose;

const CraftingRequestSchema = new Schema(
  {
    requesterDiscordId: { type: String, required: true, index: true },
    requesterUsername: { type: String, default: "" },

    requesterCharacterName: { type: String, required: true },

    craftItemName: { type: String, required: true, index: true },
    craftItemMongoId: { type: Schema.Types.ObjectId, ref: "Item", default: null },

    craftingJobsSnapshot: { type: [String], default: [] },
    staminaToCraftSnapshot: { type: Number, default: 0 },

    targetMode: {
      type: String,
      enum: ["open", "specific"],
      required: true,
    },
    targetCharacterId: { type: Schema.Types.ObjectId, default: null, index: true },
    targetCharacterName: { type: String, default: "" },
    targetCharacterHomeVillage: { type: String, default: "" },

    providingAllMaterials: { type: Boolean, default: false },
    materialsDescription: { type: String, default: "" },
    paymentOffer: { type: String, default: "" },
    elixirDescription: { type: String, default: "" },
    /** 1–3 Basic/Mid/High when craft is a mixer elixir; null otherwise */
    elixirTier: { type: Number, default: null },
    /**
     * Mixer elixirs only: commissioner picks exact inventory rows (and max qty per row) they commit.
     * Claim consumes rows against the boost-adjusted recipe.
     */
    elixirMaterialSelections: {
      type: [
        {
          inventoryDocumentId: { type: Schema.Types.ObjectId, required: true },
          maxQuantity: { type: Number, required: true, min: 1 },
        },
      ],
      default: [],
    },
    boostNotes: { type: String, default: "" },

    status: {
      type: String,
      enum: ["open", "accepted", "cancelled"],
      default: "open",
      index: true,
    },
    acceptedAt: { type: Date, default: null },
    acceptedByUserId: { type: String, default: null },
    acceptedByCharacterId: { type: Schema.Types.ObjectId, default: null },
    acceptedByCharacterName: { type: String, default: "" },

    discordMessageId: { type: String, default: null },
  },
  {
    collection: "craftingrequests",
    timestamps: true,
  }
);

CraftingRequestSchema.index({ status: 1, createdAt: -1 });
CraftingRequestSchema.index({ requesterDiscordId: 1, createdAt: -1 });
CraftingRequestSchema.index({ targetCharacterId: 1 }, { sparse: true });

module.exports =
  mongoose.models.CraftingRequest ||
  mongoose.model("CraftingRequest", CraftingRequestSchema);
