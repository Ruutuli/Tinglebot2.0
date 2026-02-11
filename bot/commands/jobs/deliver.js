// ------------------- Standard Libraries -------------------
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { handleInteractionError } = require('@/utils/globalErrorHandler');

// ------------------- Database Services -------------------
const {
 fetchCharacterByName,
 fetchCharacterByNameAndUserId,
 getCharacterInventoryCollection,
 updateCharacterById,
 getOrCreateToken,
 updateTokenBalance,
 getCurrentVendingStockList,
} = require('@/database/db');

// ------------------- Utility Functions -------------------
const { capitalizeWords } = require("../../modules/formattingModule");
const {
 addItemInventoryDatabase,
 removeItemInventoryDatabase,
} = require('@/utils/inventoryUtils');
const { generateUniqueId } = require('@/utils/uniqueIdUtils');
const {
 deleteSubmissionFromStorage,
 retrieveSubmissionFromStorage,
 saveSubmissionToStorage,
} = require('@/utils/storage');
const {
 validateJobVoucher,
 activateJobVoucher,
 fetchJobVoucherItem,
 deactivateJobVoucher,
 getJobVoucherErrorMessage,
} = require("../../modules/jobVoucherModule");
const { getJobPerk } = require("../../modules/jobsModule");
const { checkInventorySync } = require('@/utils/characterUtils');

// ------------------- Boost Integration -------------------
const { applyTravelBoost } = require("../../modules/boostIntegration");
const { clearBoostAfterUse } = require("./boosting");

// ------------------- Database Models -------------------
const ItemModel = require('@/models/ItemModel');
const TempData = require('@/models/TempDataModel');

// ------------------- Google Sheets API -------------------
// Google Sheets functionality removed

// ------------------- Temporary In-Memory Storage -------------------
const deliveryTasks = {};

// ------------------- Command Definition -------------------
const command = {
 data: new SlashCommandBuilder()
  .setName("deliver")
  .setDescription("Manage delivery tasks")
  .addSubcommand((sub) =>
   sub
    .setName("request")
    .setDescription("Request a delivery")
    .addStringOption((opt) =>
     opt
      .setName("sender")
      .setDescription("Character paying for delivery")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("courier")
      .setDescription("Courier character")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("recipient")
      .setDescription("Recipient character")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("item")
      .setDescription("Item to deliver")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((opt) =>
     opt
      .setName("quantity")
      .setDescription("Quantity of the item to deliver")
      .setRequired(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("payment")
      .setDescription("Payment details; Item's or other agreed upon payments")
      .setRequired(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("flavortext")
      .setDescription("Optional flavor text or note to include in the delivery")
      .setRequired(false)
    )
  )
  .addSubcommand((sub) =>
   sub
    .setName("accept")
    .setDescription("Courier accepts a delivery task")
    .addStringOption((opt) =>
     opt
      .setName("courier")
      .setDescription("Courier character accepting the delivery")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("deliveryid")
      .setDescription("Delivery ID to accept")
      .setRequired(true)
    )
  )
  .addSubcommand((sub) =>
   sub
    .setName("fulfill")
    .setDescription(
     "Fulfill a delivery task if courier is in the correct village"
    )
    .addStringOption((opt) =>
     opt
      .setName("courier")
      .setDescription("Courier character fulfilling the delivery")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("deliveryid")
      .setDescription("Delivery ID to fulfill")
      .setRequired(true)
    )
  )
  .addSubcommand((sub) =>
   sub
    .setName("cancel")
    .setDescription("Cancel a delivery request")
    .addStringOption((opt) =>
     opt
      .setName("deliveryid")
      .setDescription("Delivery ID to cancel")
      .setRequired(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("character")
      .setDescription(
       "Character cancelling the delivery (must be sender or courier)"
      )
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((sub) =>
   sub
    .setName("vendingstock")
    .setDescription("Courier delivery of vending stock to a vendor")
    .addStringOption((opt) =>
     opt
      .setName("recipient")
      .setDescription(
       "Vendor receiving stock (must have a vending job); includes their current village"
      )
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("courier")
      .setDescription(
       "Courier character who will carry the stock; includes their village"
      )
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("vendoritem")
      .setDescription(
       "Item to deliver from the courier's village vending stock that matches vendor type"
      )
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((opt) =>
     opt
      .setName("vendoritem_qty")
      .setDescription("Quantity of item to deliver")
      .setRequired(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("payment")
      .setDescription(
       "Payment details for vending stock delivery (tokens, items, etc.)"
      )
      .setRequired(true)
    )
    .addStringOption((opt) =>
     opt
      .setName("flavortext")
      .setDescription("Optional flavor text or delivery note")
      .setRequired(false)
    )
  ),

 async execute(interaction) {
  // Defer reply at the start to prevent interaction timeout
  await interaction.deferReply({ ephemeral: false });

  const subcommand = interaction.options.getSubcommand();

  // ------------------- Delivery Request Handler -------------------
  if (subcommand === "request") {
   try {
    // ------------------- Extract command options -------------------
    const senderName = interaction.options.getString("sender");
    const courierName = interaction.options.getString("courier");
    const recipientName = interaction.options.getString("recipient");

    // Check inventory sync for all involved characters
    const sender = await fetchCharacterByName(senderName);
    const courier = await fetchCharacterByName(courierName);
    const recipient = await fetchCharacterByName(recipientName);

    // Check inventory sync for all involved characters
    try {
     if (sender) await checkInventorySync(sender);
     if (courier) await checkInventorySync(courier);
     if (recipient) await checkInventorySync(recipient);
    } catch (error) {
     await interaction.editReply({
      content: error.message,
      ephemeral: true,
     });
     return;
    }

    // ------------------- Validate: Sender cannot be Recipient -------------------
    if (senderName === recipientName) {
     return interaction.editReply({
      content: `❌ You cannot send a delivery to yourself.`,
      ephemeral: true,
     });
    }

    // ------------------- Validate: Courier cannot be Sender or Recipient -------------------
    if (courierName === senderName || courierName === recipientName) {
     return interaction.editReply({
      content: `❌ Courier must be different from both the **sender** and **recipient**.`,
      ephemeral: true,
     });
    }

    // ------------------- Extract item and quantity -------------------
    const rawItemName = interaction.options.getString("item");
    const itemName = rawItemName.trim();
    const quantity = interaction.options.getInteger("quantity");

    // ------------------- Validate: Quantity must be at least 1 -------------------
    if (quantity < 1) {
     return interaction.editReply({
      content: `❌ Quantity must be at least **1**.`,
      ephemeral: true,
     });
    }

    // ------------------- Extract payment and optional flavor text -------------------
    const payment = interaction.options.getString("payment");
    const flavortext = interaction.options.getString("flavortext") || null;

    // ------------------- Generate unique delivery ID -------------------
    const deliveryId = generateUniqueId("D");

    // ------------------- Create delivery task object and persist to database -------------------
    let deliveryTask = {
     sender: senderName,
     courier: courierName,
     recipient: recipientName,
     item: itemName,
     quantity,
     payment,
     flavortext,
     status: "pending",
     createdAt: new Date().toISOString(),
     userId: interaction.user.id,
    };

    // ------------------- Apply Delivery Boost (Traveling Category) -------------------
    deliveryTask = await applyTravelBoost(courier.name, deliveryTask);

    // Save to TempData instead of using saveSubmissionToStorage
    await TempData.create({
     key: deliveryId,
     type: "delivery",
     data: deliveryTask,
     expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours expiration
    });

    // ------------------- Fetch character profiles -------------------
    const senderCharacter = await fetchCharacterByNameAndUserId(
     senderName,
     interaction.user.id
    );
    const courierCharacter = await fetchCharacterByName(courierName);
    const recipientCharacter = await fetchCharacterByName(recipientName);

    // ------------------- Validate Courier's Job -------------------
    let job =
     courierCharacter.jobVoucher && courierCharacter.jobVoucherJob
      ? courierCharacter.jobVoucherJob
      : courierCharacter.job;
    console.log(
     `[deliver.js]: 🔄 Job determined for ${courierCharacter.name}: "${job}"`
    );

    let voucherCheck;
    if (courierCharacter.jobVoucher) {
     console.log(
      `[deliver.js]: 🎫 Validating job voucher for ${courierCharacter.name}`
     );
     voucherCheck = await validateJobVoucher(courierCharacter, job);
     if (voucherCheck.skipVoucher) {
      console.log(
       `[deliver.js]: ✅ ${courierCharacter.name} already has job "${job}" - skipping voucher`
      );
      // No activation needed
     } else if (!voucherCheck.success) {
      if (courierCharacter.jobVoucherJob === null) {
       console.log(
        `[deliver.js]: 🔄 Unrestricted job voucher - proceeding with "${job}"`
       );
      } else {
       return interaction.editReply({
        content: voucherCheck.message,
        ephemeral: true,
       });
      }
     } else {
      console.log(
       `[deliver.js]: 🎫 Activating job voucher for ${courierCharacter.name}`
      );
      const {
       success: itemSuccess,
       item: jobVoucherItem,
       message: itemError,
      } = await fetchJobVoucherItem();
      if (!itemSuccess) {
       await interaction.editReply({ content: itemError, ephemeral: true });
       return;
      }
      const activationResult = await activateJobVoucher(
       courierCharacter,
       job,
       jobVoucherItem,
       1,
       interaction
      );
      if (!activationResult.success) {
       await interaction.editReply({
        content: activationResult.message,
        ephemeral: true,
       });
       return;
      }
      await interaction.followUp({
       content: activationResult.message,
       ephemeral: true,
      });
     }
    }

    // Validate courier job perks
    const jobPerk = getJobPerk(job);
    if (!jobPerk || !jobPerk.perks.includes("DELIVERY")) {
     return interaction.editReply({
      content: getJobVoucherErrorMessage("MISSING_SKILLS", {
       characterName: courierCharacter.name,
       jobName: job,
      }).message,
      ephemeral: true,
     });
    }

    // ------------------- New Validation: Check Village Alignment -------------------
    // Check if we're in the testing channel (or a thread in it) to skip village restrictions
    const testingChannelId = '1391812848099004578';
    const isTestingChannel = interaction.channelId === testingChannelId || interaction.channel?.parentId === testingChannelId;

    const courierCurrentVillage = courierCharacter?.currentVillage
     ?.trim()
     .toLowerCase();
    const recipientCurrentVillage = recipientCharacter?.currentVillage
     ?.trim()
     .toLowerCase();

    if (
     !courierCurrentVillage ||
     !recipientCurrentVillage ||
     (courierCurrentVillage !== recipientCurrentVillage && !isTestingChannel)
    ) {
     return interaction.editReply(
      `❌ **Delivery Fulfillment Error:** The courier **${capitalizeWords(
       courierCharacter?.name || "Unknown"
      )}** and the vendor **${capitalizeWords(
       recipientCharacter?.name || "Unknown"
      )}** are not in the same village.\n\n` +
       `**Courier's Current Village:** ${capitalizeWords(
        courierCharacter?.currentVillage || "Unknown"
       )}\n` +
       `**Vendor's Current Village:** ${capitalizeWords(
        recipientCharacter?.currentVillage || "Unknown"
       )}\n\n` +
       `**Action Required:** Courier **${capitalizeWords(
        courierCharacter?.name || "Unknown"
       )}**, please use the **</travel:1317733980304310272>** command to journey to the vendor's village before fulfilling the delivery.`
     );
    }

    // ------------------- Validate village sync between sender and courier -------------------
    const senderVillage = senderCharacter?.currentVillage?.trim().toLowerCase();
    const courierVillage = courierCharacter?.currentVillage
     ?.trim()
     .toLowerCase();

    if (!senderVillage || !courierVillage || (senderVillage !== courierVillage && !isTestingChannel)) {
     return interaction.reply({
      content: `❌ **${senderName}** and **${courierName}** must be in the same village to initiate a delivery.\n\n📤 Sender: **${capitalizeWords(
       senderCharacter?.currentVillage || "Unknown"
      )}**\n✉️ Courier: **${capitalizeWords(
       courierCharacter?.currentVillage || "Unknown"
      )}**`,
      ephemeral: true,
     });
    }

    // ------------------- Fetch item emoji for visual enhancement -------------------
    const itemData = await ItemModel.findOne({ itemName: itemName });
    const itemEmoji =
     itemData?.emoji && itemData.emoji.trim() !== "" ? itemData.emoji : "🔹";

    // ------------------- Construct the delivery request embed -------------------
    const deliveryEmbed = {
     title: `📦 Delivery Request Initiated!`,
     description: `**${senderName}** wants to hire **${courierName}** to make a delivery to **${recipientName}**!`,
     color: 0xaa926a,
     thumbnail: {
      url: courierCharacter?.icon || "https://default.image.url/fallback.png",
     },
     author: {
      name: `Sender: ${senderName}`,
      icon_url:
       senderCharacter?.icon || "https://default.image.url/fallback.png",
      url: senderCharacter?.inventory || "",
     },
     footer: {
      text: `Recipient: ${recipientName}`,
      icon_url:
       recipientCharacter?.icon || "https://default.image.url/fallback.png",
      url: recipientCharacter?.inventory || "",
     },
     fields: [
      {
       name: `__📤 Sender__`,
       value: `> [**${senderName}**](${senderCharacter?.inventory || ""})`,
       inline: true,
      },
      {
       name: `__✉️ Courier__`,
       value: `> [**${courierName}**](${courierCharacter?.inventory || ""})`,
       inline: true,
      },
      {
       name: `__📥 Recipient__`,
       value: `> [**${recipientName}**](${
        recipientCharacter?.inventory || ""
       })`,
       inline: true,
      },
      {
       name: `__📦 Item to Deliver__`,
       value: `> ${itemEmoji} **${
        itemData?.itemName || itemName
       }** x ${quantity}`,
       inline: false,
      },
      {
       name: `__📍 Delivering From__`,
       value: `> **${capitalizeWords(
        senderCharacter?.currentVillage || "Unknown"
       )}**`,
       inline: true,
      },
      {
       name: `__📍 Delivering To__`,
       value: `> **${capitalizeWords(
        recipientCharacter?.currentVillage || "Unknown"
       )}**`,
       inline: true,
      },
      { name: `__💰 Payment__`, value: `> ${payment}`, inline: false },
      ...(flavortext
       ? [
          {
           name: `__📝 Flavor Text__`,
           value: `> ${flavortext}`,
           inline: false,
          },
         ]
       : []),
      {
       name: `__📋 Courier Instructions__`,
       value: `> Please use **</deliver accept:1353035054753775646>** to accept this delivery task!`,
       inline: false,
      },
     ],
     image: {
      url: "https://storage.googleapis.com/tinglebot/Graphics/border.png",
     },
     timestamp: new Date(),
    };

    // ------------------- Prepare user mentions for clarity -------------------
    const senderUserId = senderCharacter?.userId || null;
    const courierUserId = courierCharacter?.userId || null;
    const recipientUserId = recipientCharacter?.userId || null;

    let mentionMessage = "";
    if (senderUserId && courierUserId && recipientUserId) {
     mentionMessage = `<@${senderUserId}> is requesting <@${courierUserId}> to deliver an item to <@${recipientUserId}>!`;
    }

    // ------------------- Final bot reply -------------------
    await interaction.editReply({
     content: mentionMessage,
     embeds: [deliveryEmbed],
    });

    // ------------------- Clear Boost After Use -------------------
    if (courierCharacter) {
      await clearBoostAfterUse(courierCharacter, {
        client: interaction.client,
        context: 'delivery request'
      });
    }

    // ------------------- Deactivate Job Voucher -------------------
    if (courierCharacter.jobVoucher && !voucherCheck?.skipVoucher) {
     const deactivationResult = await deactivateJobVoucher(
      courierCharacter._id,
      { afterUse: true }
     );
     if (!deactivationResult.success) {
      console.error(
       `[deliver.js]: Failed to deactivate job voucher for ${courierCharacter.name}`
      );
     } else {
      console.error(
       `[deliver.js]: Job voucher deactivated for ${courierCharacter.name}`
      );
     }
    }
   } catch (error) {
    handleInteractionError(error, interaction, { source: "deliver.js" });
    return interaction.reply({
     content: `❌ An unexpected error occurred while creating the delivery task. Please try again later.`,
     ephemeral: true,
    });
   }
  } else if (subcommand === "accept") {
   try {
    const courierName = interaction.options.getString("courier");
    const deliveryId = interaction.options.getString("deliveryid");

    // Check inventory sync for courier
    const courier = await fetchCharacterByName(courierName);
    try {
     if (courier) await checkInventorySync(courier);
    } catch (error) {
     await interaction.editReply({
      content: error.message,
      ephemeral: true,
     });
     return;
    }

    // ------------------- Validate: Courier must be the one who accepted -------------------
    if (courierName !== interaction.user.username) {
     return interaction.editReply({
      content: `❌ You can only accept deliveries as yourself.`,
      ephemeral: true,
     });
    }

    // ------------------- Validate: Delivery request exists -------------------
    const deliveryRequest = await TempData.findOne({
     key: deliveryId,
     type: "delivery",
    });

    if (!deliveryRequest) {
     return interaction.editReply({
      content: `❌ Delivery request with ID **${deliveryId}** not found.`,
      ephemeral: true,
     });
    }

    // ------------------- Validate: Delivery not already accepted -------------------
    if (deliveryRequest.data.status !== "pending") {
     return interaction.editReply({
      content: `❌ This delivery has already been **${deliveryRequest.data.status}**.`,
      ephemeral: true,
     });
    }

    // ------------------- Apply Traveling Boost for Accept -------------------
    if (courier) {
     console.log(
      `[deliver.js] Courier ${courier.name} is boosted for delivery acceptance`
     );
     // Boost could reduce travel time or improve success rate
    }

    // ------------------- Update delivery status -------------------
    deliveryRequest.data.status = "accepted";
    deliveryRequest.data.acceptedAt = new Date();
    await TempData.findByIdAndUpdate(deliveryRequest._id, {
     data: deliveryRequest.data,
    });

    // ------------------- Create delivery embed -------------------
    const deliveryEmbed = new EmbedBuilder()
     .setColor("#00ff00")
     .setTitle("📦 Delivery Accepted")
     .setDescription(
      `Delivery request **${deliveryId}** has been accepted by **${courierName}**.`
     )
     .addFields(
      { name: "From", value: deliveryRequest.data.sender, inline: true },
      { name: "To", value: deliveryRequest.data.recipient, inline: true },
      { name: "Item", value: deliveryRequest.data.item, inline: true },
      {
       name: "Quantity",
       value: deliveryRequest.data.quantity.toString(),
       inline: true,
      },
      { name: "Status", value: "Accepted", inline: true }
     )
     .setTimestamp();

    // ------------------- Final bot reply -------------------
    await interaction.editReply({
     content: `Delivery request **${deliveryId}** has been accepted by **${courierName}**.`,
     embeds: [deliveryEmbed],
    });

    // ------------------- Clear Boost After Use -------------------
    if (courier) {
      await clearBoostAfterUse(courier, {
        client: interaction.client,
        context: 'delivery accept'
      });
    }
   } catch (error) {
    console.error("Error in deliver accept:", error);
    await interaction.editReply({
     content: `❌ An error occurred while accepting the delivery. Please try again.`,
     ephemeral: true,
    });
   }
  } else if (subcommand === "fulfill") {
   try {
    const courierName = interaction.options.getString("courier");
    const deliveryId = interaction.options.getString("deliveryid");

    // Check inventory sync for courier
    const courier = await fetchCharacterByName(courierName);
    try {
     if (courier) await checkInventorySync(courier);
    } catch (error) {
     await interaction.editReply({
      content: error.message,
      ephemeral: true,
     });
     return;
    }

    // ------------------- Validate: Courier must be the one who accepted -------------------
    if (courierName !== interaction.user.username) {
     return interaction.editReply({
      content: `❌ You can only fulfill deliveries as yourself.`,
      ephemeral: true,
     });
    }

    // ------------------- Validate: Delivery request exists -------------------
    const deliveryRequest = await TempData.findOne({
     key: deliveryId,
     type: "delivery",
    });

    if (!deliveryRequest) {
     return interaction.editReply({
      content: `❌ Delivery request with ID **${deliveryId}** not found.`,
      ephemeral: true,
     });
    }

    // ------------------- Validate: Delivery is accepted -------------------
    if (deliveryRequest.data.status !== "accepted") {
     return interaction.editReply({
      content: `❌ This delivery must be **accepted** before it can be fulfilled.`,
      ephemeral: true,
     });
    }

    // ------------------- Apply Traveling Boost for Fulfill -------------------
    if (courier) {
     console.log(
      `[deliver.js] Courier ${courier.name} is boosted for delivery fulfillment`
     );
     // Boost could provide additional benefits on completion
    }

    // ------------------- Update delivery status -------------------
    deliveryRequest.data.status = "fulfilled";
    deliveryRequest.data.fulfilledAt = new Date();
    await TempData.findByIdAndUpdate(deliveryRequest._id, {
     data: deliveryRequest.data,
    });

    // ------------------- Create delivery embed -------------------
    const deliveryEmbed = new EmbedBuilder()
     .setColor("#00ff00")
     .setTitle("📦 Delivery Fulfilled")
     .setDescription(
      `Delivery request **${deliveryId}** has been fulfilled by **${courierName}**.`
     )
     .addFields(
      { name: "From", value: deliveryRequest.data.sender, inline: true },
      { name: "To", value: deliveryRequest.data.recipient, inline: true },
      { name: "Item", value: deliveryRequest.data.item, inline: true },
      {
       name: "Quantity",
       value: deliveryRequest.data.quantity.toString(),
       inline: true,
      },
      { name: "Status", value: "Fulfilled", inline: true }
     )
     .setTimestamp();

    // ------------------- Final bot reply -------------------
    await interaction.editReply({
     content: `Delivery request **${deliveryId}** has been fulfilled by **${courierName}**.`,
     embeds: [deliveryEmbed],
    });

    // ------------------- Clear Boost After Use -------------------
    if (courier) {
      await clearBoostAfterUse(courier, {
        client: interaction.client,
        context: 'delivery fulfill'
      });
    }
   } catch (error) {
    console.error("Error in deliver fulfill:", error);
    await interaction.editReply({
     content: `❌ An error occurred while fulfilling the delivery. Please try again.`,
     ephemeral: true,
    });
   }
  } else if (subcommand === "cancel") {
   try {
    const deliveryId = interaction.options.getString("deliveryid");
    const characterName = interaction.options.getString("character");

    // Find the delivery request in TempData
    const deliveryRequest = await TempData.findOne({
     key: deliveryId,
     type: "delivery",
    });

    if (!deliveryRequest) {
     return interaction.reply({
      content: `❌ No delivery request found with ID **${deliveryId}**.`,
      ephemeral: true,
     });
    }

    const { data: deliveryTask } = deliveryRequest;

    // Validate character is either sender or courier
    if (
     deliveryTask.sender !== characterName &&
     deliveryTask.courier !== characterName
    ) {
     return interaction.reply({
      content: `❌ Only the sender (${deliveryTask.sender}) or courier (${deliveryTask.courier}) can cancel this delivery.`,
      ephemeral: true,
     });
    }

    // Delete the delivery request
    await TempData.findByIdAndDelete(deliveryRequest._id);
    console.log(
     `[deliver.js]: Deleted cancelled delivery request ${deliveryId}`
    );

    // Notify relevant users
    const senderCharacter = await fetchCharacterByName(deliveryTask.sender);
    const courierCharacter = await fetchCharacterByName(deliveryTask.courier);
    const recipientCharacter = await fetchCharacterByName(
     deliveryTask.recipient
    );

    const cancelMessage =
     `📦 Delivery request **${deliveryId}** has been cancelled by **${characterName}**.\n\n` +
     `**Details:**\n` +
     `📤 Sender: ${deliveryTask.sender}\n` +
     `✉️ Courier: ${deliveryTask.courier}\n` +
     `📥 Recipient: ${deliveryTask.recipient}\n` +
     `📦 Item: ${deliveryTask.item} x${deliveryTask.quantity}`;

    // Send notifications to all involved parties
    const notifyUser = async (userId) => {
     if (userId) {
      try {
       const user = await interaction.client.users.fetch(userId);
       if (user) {
        await user.send(cancelMessage);
       }
      } catch (dmError) {
       console.error(
        `[deliver.js]: Failed to send DM to user ${userId}:`,
        dmError
       );
      }
     }
    };

    await Promise.all([
     notifyUser(senderCharacter?.userId),
     notifyUser(courierCharacter?.userId),
     notifyUser(recipientCharacter?.userId),
    ]);

    return interaction.reply({
     content: `✅ Delivery request **${deliveryId}** has been cancelled.`,
     ephemeral: true,
    });
   } catch (error) {
    handleInteractionError(error, interaction, { source: "deliver.js" });
    return interaction.reply({
     content: `❌ An error occurred while cancelling the delivery request.`,
     ephemeral: true,
    });
   }
  }
 },
};

module.exports = command;
