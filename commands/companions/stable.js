// ============================================================================
// ---- Imports ----
// Core dependencies and module imports
// ============================================================================

// ------------------- Standard Libraries -------------------
const mongoose = require('mongoose');

// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// ------------------- Database Services -------------------
const { fetchCharacterByNameAndUserId } = require('../../database/db');

// ------------------- Custom Modules -------------------
const { calculateMountPrice } = require('../../modules/mountModule');
const { getPetTypeData, getPetEmoji, getRollsDisplay } = require('../../modules/petModule');

// ------------------- Utils -------------------
const { handleError } = require('../../utils/globalErrorHandler');

// ------------------- Models -------------------
const Character = require('../../models/CharacterModel');
const Mount = require('../../models/MountModel');
const Pet = require('../../models/PetModel');
const { Stable, ListedMount, ListedPet } = require('../../models/StableModel');
const User = require('../../models/UserModel');

// ============================================================================
// ---- Constants & Configuration ----
// System-wide constants and configuration values
// ============================================================================

const COMPANION_STATUS = {
  ACTIVE: 'active',
  STORED: 'stored',
  LISTED: 'listed'
};

// ============================================================================
// ---- Utility Functions ----
// Helper functions for data validation and manipulation
// ============================================================================

// ---- Handler Utilities ----
// Wraps handler functions with common validation and error handling
async function withValidation(interaction, userId, characterName, handler) {
  try {
    console.log(`[stable.js]: 🚀 Starting handler for character "${characterName}"`);
    
    const character = await validateCharacterOwnership(interaction, userId, characterName);
    if (!character) {
      console.log(`[stable.js]: ❌ Character validation failed for "${characterName}"`);
      return;
    }
    console.log(`[stable.js]: ✅ Character validated: ${character.name}`);

    return await handler(character);
  } catch (error) {
    console.error(`[stable.js]: ❌ Error in handler:`, error);
    await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
  }
}

// Validates user existence and returns user object
async function validateUser(interaction, userId) {
  const user = await User.findOne({ discordId: userId });
  if (!user) {
    console.log(`[stable.js]: ❌ User not found for Discord ID: ${userId}`);
    await interaction.reply({ content: '❌ User not found.', ephemeral: true });
    return null;
  }
  console.log(`[stable.js]: ✅ User found: ${user.username}`);
  return user;
}

// Finds companion by name, trying mount first then pet
async function findCompanionByType(characterId, companionName) {
  let type = 'mount';
  console.log(`[stable.js]: 🔍 Looking for ${type} "${companionName}"`);
  let companion = await findCompanionByName(characterId, companionName, type);
  
  if (!companion) {
    console.log(`[stable.js]: 🔄 Mount not found, trying as pet`);
    type = 'pet';
    companion = await findCompanionByName(characterId, companionName, type);
  }

  return { companion, type };
}

// ---- Response Utilities ----
// Creates a standardized error response
async function sendErrorResponse(interaction, message, ephemeral = true) {
  await interaction.reply({ content: `❌ ${message}`, ephemeral });
}

// Creates a standardized success response
async function sendSuccessResponse(interaction, message, ephemeral = false) {
  await interaction.reply({ content: `✅ ${message}`, ephemeral });
}

// ---- Character Validation ----
// Validates character ownership and existence
async function validateCharacterOwnership(interaction, userId, characterName) {
  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
    await interaction.reply({ content: '❌ Character not found or does not belong to you.', ephemeral: true });
    return null;
  }
  return character;
}

// ---- Stable Management ----
// Gets or creates a stable for a character
async function getOrCreateStable(characterId, discordId) {
  let stable = await Stable.findOne({ characterId });
  if (!stable) {
    stable = new Stable({ characterId, discordId });
    await stable.save();
  }
  return stable;
}

// Validates stable capacity
function validateStableCapacity(stable) {
  const totalStored = stable.storedMounts.length + stable.storedPets.length;
  if (totalStored >= stable.maxSlots) {
    throw new Error('❌ Your stable is full! You can only store up to 3 mounts/pets.');
  }
}

// ---- Companion Management ----
// Updates companion status and storage location
async function updateCompanionStatus(companion, newStatus, stableId = null) {
  companion.status = newStatus;
  companion.storageLocation = stableId;
  companion.storedAt = newStatus === COMPANION_STATUS.ACTIVE ? null : new Date();
  await companion.save();
}

// Updates character's active companion
async function updateCharacterActiveCompanion(characterId, type, companionId = null) {
  const update = type === 'mount' 
    ? { currentActiveMount: companionId, mount: !!companionId }
    : { currentActivePet: companionId, pet: !!companionId };
  await Character.findByIdAndUpdate(characterId, update);
}

// Calculates companion price based on type and attributes
function calculateCompanionPrice(companion, type) {
  if (type === 'mount') {
    return calculateMountPrice(companion);
  }
  const traits = Array.isArray(companion.traits) ? companion.traits : [];
  return Math.floor(companion.level * 100 + (traits.length * 50));
}

// ---- Database Operations ----
// Executes database operations within a transaction
async function executeInTransaction(operations) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await operations(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// ---- Companion Lookup ----
// Finds companion by name and owner
async function findCompanionByName(characterId, companionName, type, status = null) {
  const Model = type === 'mount' ? Mount : Pet;
  const character = await Character.findById(characterId);
  
  const query = type === 'mount'
    ? { owner: character.name, name: companionName }
    : { owner: characterId, name: companionName };
  
  if (status) {
    query.status = Array.isArray(status) ? { $in: status } : status;
  }
  
  console.log(`[stable.js]: 🔍 Query for ${type}:`, JSON.stringify(query, null, 2));
  const result = await Model.findOne(query);
  console.log(`[stable.js]: ${result ? '✅' : '❌'} ${type} search result:`, result ? 'Found' : 'Not found');
  
  return result;
}

// ---- URL Handling ----
// Sanitizes and validates image URLs
const sanitizeUrl = (url, type) => {
  if (!url) {
    if (type === 'mount') {
      const { getMountThumbnail } = require('../../modules/mountModule');
      return getMountThumbnail('Horse'); // Default to horse thumbnail
    }
    return "https://static.wikia.nocookie.net/cursed-images-inspiration/images/3/35/7a0c5231e5034fc4450867a7f2781eb0.jpg/revision/latest?cb=20210304180138";
  }
  try {
    const encodedUrl = encodeURI(url).replace(/!/g, '%21');
    const urlObj = new URL(encodedUrl);
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      return encodedUrl;
    }
    if (type === 'mount') {
      const { getMountThumbnail } = require('../../modules/mountModule');
      return getMountThumbnail('Horse'); // Default to horse thumbnail
    }
    return "https://static.wikia.nocookie.net/cursed-images-inspiration/images/3/35/7a0c5231e5034fc4450867a7f2781eb0.jpg/revision/latest?cb=20210304180138";
  } catch (_) {
    console.error("[stable.js]: ❌ Error sanitizing URL:", url);
    if (type === 'mount') {
      const { getMountThumbnail } = require('../../modules/mountModule');
      return getMountThumbnail('Horse'); // Default to horse thumbnail
    }
    return "https://static.wikia.nocookie.net/cursed-images-inspiration/images/3/35/7a0c5231e5034fc4450867a7f2781eb0.jpg/revision/latest?cb=20210304180138";
  }
};

// ============================================================================
// ---- Core Companion Operations ----
// Main functions for managing companions in the stable system
// ============================================================================

// ---- Storage Operations ----
// Stores a companion in the stable
async function storeCompanion(characterId, type, companionName, discordId) {
  return await executeInTransaction(async (session) => {
    console.log(`[stable.js]: 🚀 Starting store process for ${type} "${companionName}"`);
    
    const foundCompanion = await findCompanionByName(characterId, companionName, type);
    if (!foundCompanion) throw new Error(`${type === 'mount' ? 'Mount' : 'Pet'} not found`);
    console.log(`[stable.js]: ✅ Found ${type} "${companionName}"`);

    // For mounts, check if it's already stored
    if (type === 'mount' && foundCompanion.isStored) {
      throw new Error('❌ This mount is already stored');
    }

    const stable = await getOrCreateStable(characterId, discordId);
    const storedArray = type === 'mount' ? stable.storedMounts : stable.storedPets;
    if (storedArray.length >= stable.maxSlots) {
      throw new Error('❌ Stable is full');
    }

    // Add companion data to stable
    storedArray.push({
      mountId: foundCompanion._id,
      storedAt: new Date()
    });
    await stable.save({ session });
    console.log(`[stable.js]: ✅ Added ${type} to stable storage`);

    // Update the companion's stored status
    if (type === 'mount') {
      foundCompanion.isStored = true;
      foundCompanion.storageLocation = stable._id;
      foundCompanion.storedAt = new Date();
      await foundCompanion.save({ session });
    } else {
      // For pets, update their stored status
      foundCompanion.status = COMPANION_STATUS.STORED;
      foundCompanion.storageLocation = stable._id;
      foundCompanion.storedAt = new Date();
      await foundCompanion.save({ session });
    }
    console.log(`[stable.js]: ✅ Updated ${type} storage status`);

    await updateCharacterActiveCompanion(characterId, type, null);
    console.log(`[stable.js]: ✅ Updated character's active ${type} status`);
    
    return foundCompanion;
  });
}

// Retrieves a companion from the stable
async function retrieveCompanion(characterId, type, companionName, discordId) {
  return await executeInTransaction(async (session) => {
    console.log(`[stable.js]: 🚀 Starting retrieve process for ${type} "${companionName}"`);
    
    const character = await Character.findById(characterId);
    const hasActive = type === 'mount' ? character.mount : character.pet;
    if (hasActive) {
      throw new Error(`❌ Character already has an active ${type}`);
    }

    const stable = await getOrCreateStable(characterId, discordId);
    const storedArray = type === 'mount' ? stable.storedMounts : stable.storedPets;
    const storedCompanion = storedArray.find(p => p.name === companionName);
    if (!storedCompanion) {
      throw new Error(`❌ ${type === 'mount' ? 'Mount' : 'Pet'} not found in stable`);
    }
    console.log(`[stable.js]: ✅ Found ${type} in stable storage`);

    // Update the companion's status to active
    const Model = type === 'mount' ? Mount : Pet;
    const companion = await Model.findOne({
      name: companionName,
      owner: type === 'mount' ? character.name : characterId
    });

    if (!companion) {
      throw new Error(`❌ ${type === 'mount' ? 'Mount' : 'Pet'} not found in database`);
    }

    if (type === 'mount') {
      companion.isStored = false;
      companion.storageLocation = null;
      companion.storedAt = null;
    } else {
      companion.status = COMPANION_STATUS.ACTIVE;
      companion.storageLocation = null;
      companion.storedAt = null;
    }
    await companion.save({ session });
    console.log(`[stable.js]: ✅ Updated ${type} status to active`);

    // Remove from stable
    storedArray.splice(storedArray.indexOf(storedCompanion), 1);
    await stable.save({ session });
    console.log(`[stable.js]: ✅ Removed ${type} from stable storage`);

    await updateCharacterActiveCompanion(characterId, type, companion._id);
    console.log(`[stable.js]: ✅ Updated character's active ${type} status`);
    
    return companion;
  });
}

// ---- Marketplace Operations ----
// Lists a companion for sale
async function listCompanion(characterId, type, companionName) {
  return await executeInTransaction(async (session) => {
    console.log(`[stable.js]: 🚀 Starting to list ${type} "${companionName}" for sale`);
    
    const companion = await findCompanionByName(characterId, companionName, type);
    if (!companion) throw new Error(`❌ ${type === 'mount' ? 'Mount' : 'Pet'} not found`);
    console.log(`[stable.js]: ✅ Found ${type} "${companionName}" owned by "${companion.owner}"`);

    const character = await Character.findById(characterId);
    const price = calculateCompanionPrice(companion, type);
    
    // Create new listing in appropriate collection
    const ListingModel = type === 'mount' ? ListedMount : ListedPet;
    const listingData = {
      ...companion.toObject(),
      price,
      sellerId: characterId,
      originalOwner: character.name,
      listedAt: new Date(),
      isSold: false
    };
    
    const listing = new ListingModel(listingData);
    await listing.save({ session });
    console.log(`[stable.js]: ✅ Created new ${type} listing`);

    // If the mount was stored in a stable, remove it from there
    if (type === 'mount' && companion.storageLocation) {
      const stable = await Stable.findById(companion.storageLocation);
      if (stable) {
        stable.storedMounts = stable.storedMounts.filter(m => m.mountId.toString() !== companion._id.toString());
        await stable.save({ session });
        console.log(`[stable.js]: ✅ Removed mount from stable storage`);
      }
    }

    // Delete from original collection
    const Model = type === 'mount' ? Mount : Pet;
    await Model.findByIdAndDelete(companion._id, { session });
    console.log(`[stable.js]: ✅ Deleted ${type} from original collection`);

    // Update character's mount/pet status
    if (type === 'mount') {
      character.mount = false;
      character.currentActiveMount = null;
    } else {
      character.currentActivePet = null;
    }
    await character.save({ session });
    console.log(`[stable.js]: ✅ Updated character's ${type} status`);
    
    console.log(`[stable.js]: ✅ Successfully listed ${type} "${companionName}" for sale`);
    return { companion: listingData, price };
  });
}

// Buys a companion from the marketplace
async function buyCompanion(buyerId, type, companionName) {
  return await executeInTransaction(async (session) => {
    console.log(`[stable.js]: 🚀 Starting purchase process for ${type} "${companionName}"`);
    
    const buyer = await Character.findById(buyerId);
    const hasActive = type === 'mount' ? buyer.mount : buyer.pet;
    if (hasActive) {
      throw new Error(`❌ Buyer already has an active ${type}`);
    }

    // Find the listing
    const ListingModel = type === 'mount' ? ListedMount : ListedPet;
    const listing = await ListingModel.findOne({
      name: companionName,
      isSold: false
    });
    
    if (!listing) {
      throw new Error(`❌ ${type === 'mount' ? 'Mount' : 'Pet'} not found for sale`);
    }
    console.log(`[stable.js]: ✅ Found available ${type} listing`);

    // Create new companion in original collection
    const Model = type === 'mount' ? Mount : Pet;
    const companion = new Model({
      ...listing.toObject(),
      owner: buyerId,
      status: COMPANION_STATUS.ACTIVE,
      storedAt: null,
      storageLocation: null
    });
    await companion.save({ session });
    console.log(`[stable.js]: ✅ Created new ${type} for buyer`);

    // Update listing status
    listing.isSold = true;
    listing.soldAt = new Date();
    listing.buyerId = buyerId;
    await listing.save({ session });
    console.log(`[stable.js]: ✅ Updated listing status to sold`);

    await updateCharacterActiveCompanion(buyerId, type, companion._id);
    console.log(`[stable.js]: ✅ Updated buyer's active ${type} status`);
    
    return { companion, price: listing.price };
  });
}

// ---- View Operations ----
// Views companion details
async function viewCompanion(characterId, type, companionName) {
  console.log(`[stable.js]: 🔍 Looking up ${type} "${companionName}"`);
  
  // First check active companions
  let companion = await findCompanionByName(characterId, companionName, type);
  
  // If not found, check stable
  if (!companion) {
    const stable = await getOrCreateStable(characterId, null);
    const storedArray = type === 'mount' ? stable.storedMounts : stable.storedPets;
    const storedCompanion = storedArray.find(p => p.name === companionName);
    if (storedCompanion) {
      companion = storedCompanion;
      console.log(`[stable.js]: ✅ Found ${type} in stable storage`);
    }
  }

  if (!companion) {
    throw new Error(`❌ ${type === 'mount' ? 'Mount' : 'Pet'} not found`);
  }

  const result = {
    ...companion.toObject ? companion.toObject() : companion,
    status: companion.status || COMPANION_STATUS.ACTIVE
  };

  if (type === 'pet') {
    result.rollsDisplay = getRollsDisplay(companion.rollsRemaining || 0, companion.level || 0);
    result.petTypeData = getPetTypeData(companion.petType);
  }

  console.log(`[stable.js]: ✅ Successfully retrieved ${type} details`);
  return result;
}

// ---- Browse Handler ----
// Handles browsing marketplace listings
async function handleBrowseStable(interaction, type) {
  try {
    console.log(`[stable.js]: 🚀 Starting browse process for ${type}`);
    
    const ListingModel = type === 'mounts' ? ListedMount : ListedPet;
    const listings = await ListingModel.find({ isSold: false });

    if (listings.length === 0) {
      console.log(`[stable.js]: ℹ️ No ${type} currently listed for sale`);
      await sendErrorResponse(interaction, `No ${type} are currently listed for sale.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏪 ${type.charAt(0).toUpperCase() + type.slice(1)} for Sale`)
      .setColor(0xAA926A)
      .setDescription(listings.map(l => 
        `**${l.name}** (${l.species})\n` +
        `> Level: ${l.level}\n` +
        `> Price: ${l.price} tokens\n` +
        `> Seller: ${l.originalOwner}\n` +
        `> Traits: ${l.traits.join(', ')}\n`
      ).join('\n'));

    console.log(`[stable.js]: ✅ Successfully generated browse view for ${type}`);
    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error(`[stable.js]: ❌ Error in handleBrowseStable:`, error);
    await sendErrorResponse(interaction, error.message);
  }
}

// ============================================================================
// ---- Command Handlers ----
// Handlers for stable command subcommands
// ============================================================================

// ---- View Handler ----
// Handles viewing stable contents
async function handleViewStable(interaction, userId, characterName) {
  await withValidation(interaction, userId, characterName, async (character) => {
    const stable = await Stable.findOne({ characterId: character._id });
    if (!stable) {
      console.log(`[stable.js]: ❌ No stable found for character "${characterName}"`);
      await sendErrorResponse(interaction, 'You do not have a stable yet.');
      return;
    }

    const storedMounts = stable.storedMounts.map(m => 
      `> ${m.name} (${m.species}) - Level ${m.level}`
    );

    const storedPets = stable.storedPets.map(p => 
      `> ${p.name} (${p.species}) - Level ${p.level}`
    );

    const listedMounts = stable.listedMounts
      .filter(m => !m.isSold)
      .map(m => 
        `> ${m.name} (${m.species}) - ${m.price} tokens`
      );

    const listedPets = stable.listedPets
      .filter(p => !p.isSold)
      .map(p => 
        `> ${p.name} (${p.species}) - ${p.price} tokens`
      );

    const embed = new EmbedBuilder()
      .setTitle(`${character.name}'s Stable`)
      .setColor(0xAA926A)
      .addFields(
        { name: '🐴 Stored Mounts', value: storedMounts.join('\n') || '> No mounts stored', inline: false },
        { name: '🐾 Stored Pets', value: storedPets.join('\n') || '> No pets stored', inline: false },
        { name: '💰 Listed Mounts', value: listedMounts.join('\n') || '> No mounts listed', inline: false },
        { name: '💰 Listed Pets', value: listedPets.join('\n') || '> No pets listed', inline: false },
        { name: '📊 Storage', value: `> ${stable.storedMounts.length + stable.storedPets.length}/${stable.maxSlots} slots used`, inline: false }
      );

    console.log(`[stable.js]: ✅ Successfully generated stable view for "${characterName}"`);
    await interaction.reply({ embeds: [embed] });
  });
}

// ---- Store Handler ----
// Handles storing companions in stable
async function handleStorePet(interaction, userId, characterName, companionName) {
  await withValidation(interaction, userId, characterName, async (character) => {
    const { companion, type } = await findCompanionByType(character._id, companionName);
    
    if (!companion) {
      console.log(`[stable.js]: ❌ No companion found with name "${companionName}"`);
      await sendErrorResponse(interaction, `No mount or pet found with name "${companionName}". Please check the name and try again.`);
      return;
    }
    console.log(`[stable.js]: ✅ Found ${type}:`, companion.name);

    const storedCompanion = await storeCompanion(character._id, type, companionName, userId);
    console.log(`[stable.js]: ✅ Successfully stored ${type} "${companionName}"`);
    
    const embed = new EmbedBuilder()
      .setTitle(`${type === 'mount' ? '🐴' : '🐾'} ${type.charAt(0).toUpperCase() + type.slice(1)} Stored`)
      .setColor("#FF0000")
      .setDescription(
        `Your ${type} **${storedCompanion.name}** has been stored in your stable.\n` +
        `You can now add a new ${type} to your character or retrieve this one later.`
      )
      .addFields(
        { name: "__Name__", value: `> ${storedCompanion.name}`, inline: true },
        { name: "__Species__", value: `> ${storedCompanion.species}`, inline: true },
        { name: "__Level__", value: `> ${storedCompanion.level}`, inline: true }
      )
      .setImage(sanitizeUrl(storedCompanion.imageUrl, type))
      .setFooter({ text: `${type.charAt(0).toUpperCase() + type.slice(1)} stored successfully.` });

    await interaction.reply({ embeds: [embed] });
  });
}

// ---- Retrieve Handler ----
// Handles retrieving companions from stable
async function handleRetrievePet(interaction, userId, characterName, petName) {
  await withValidation(interaction, userId, characterName, async (character) => {
    const pet = await retrieveCompanion(character._id, 'pet', petName, userId);
    console.log(`[stable.js]: ✅ Successfully retrieved pet "${petName}"`);
    
    await sendSuccessResponse(interaction, `✅ Successfully retrieved **${petName}** from your stable.`);
  });
}

// ---- List Handler ----
// Handles listing companions for sale
async function handleListCompanion(interaction, userId, characterName, companionName) {
  await withValidation(interaction, userId, characterName, async (character) => {
    const user = await validateUser(interaction, userId);
    if (!user) return;

    // Try to find the companion as a mount first
    let type = 'mount';
    console.log(`[stable.js]: 🔍 Attempting to find mount "${companionName}"`);
    let companion = await findCompanionByName(character._id, companionName, type);
    
    // If not found as a mount, try as a pet
    if (!companion) {
      console.log(`[stable.js]: 🔄 Mount not found, trying as pet`);
      type = 'pet';
      companion = await findCompanionByName(character._id, companionName, type);
    }

    if (!companion) {
      console.log(`[stable.js]: ❌ No companion found with name "${companionName}"`);
      await sendErrorResponse(interaction, `❌ ${type === 'mount' ? 'Mount' : 'Pet'} not found.`, true);
      return;
    }
    console.log(`[stable.js]: ✅ Found ${type}:`, companion.name);

    const { companion: listedCompanion, price } = await listCompanion(character._id, type, companionName);
    console.log(`[stable.js]: ✅ Listed ${type} for sale at ${price} tokens`);
    
    const embed = new EmbedBuilder()
      .setTitle(`🏪 ${type === 'mount' ? 'Mount' : 'Pet'} Listed for Sale`)
      .setColor(0xAA926A)
      .setDescription(`**${listedCompanion.name}** has been listed for sale!`)
      .addFields(
        { name: `${type === 'mount' ? '🐴' : '🐾'} Details`, value: `> Species: ${listedCompanion.species}\n> Level: ${listedCompanion.level}\n> Traits: ${listedCompanion.traits.join(', ')}`, inline: false },
        { name: '💰 Price', value: `> ${price} tokens`, inline: false },
        { name: '👤 Seller', value: `> ${character.name}`, inline: false }
      )
      .setFooter({ text: `The ${type} will remain listed until purchased or removed.` });

    await interaction.reply({ embeds: [embed] });
    console.log(`[stable.js]: ✅ Successfully sent listing confirmation for ${type} "${companionName}"`);
  });
}

// ---- Buy Handler ----
// Handles buying companions from marketplace
async function handleBuyPet(interaction, userId, characterName, petName) {
  await withValidation(interaction, userId, characterName, async (character) => {
    const user = await validateUser(interaction, userId);
    if (!user) return;

    const { companion: pet, price } = await buyCompanion(character._id, 'pet', petName);
    console.log(`[stable.js]: ✅ Found pet listing for ${price} tokens`);
    
    if (user.tokens < price) {
      console.log(`[stable.js]: ❌ Insufficient tokens: ${user.tokens} < ${price}`);
      await sendErrorResponse(interaction, `❌ You don't have enough tokens. This pet costs ${price} tokens.`);
      return;
    }

    user.tokens -= price;
    await user.save();
    console.log(`[stable.js]: ✅ Updated user tokens: ${user.tokens}`);

    await sendSuccessResponse(interaction, `✅ Successfully purchased **${petName}** for ${price} tokens.`);
  });
}

// ============================================================================
// ---- Command Definition ----
// Defines the stable command and its subcommands
// ============================================================================

module.exports = {
  // ---- Command Data ----
  // Defines the command structure and options
  data: new SlashCommandBuilder()
    .setName('stable')
    .setDescription('Manage your stable and view/buy/sell mounts and pets')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View your stable and stored mounts/pets')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Enter the character name')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('store')
        .setDescription('Store a mount or pet in your stable')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Enter the character name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Enter the mount/pet name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Type of companion to store')
            .setRequired(true)
            .addChoices(
              { name: 'Mount', value: 'mount' },
              { name: 'Pet', value: 'pet' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('retrieve')
        .setDescription('Retrieve a mount or pet from your stable')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Enter the character name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Enter the mount/pet name')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List a mount or pet for sale')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Enter the character name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Enter the mount/pet name')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('browse')
        .setDescription('Browse mounts and pets for sale')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Type of companion to browse')
            .setRequired(true)
            .addChoices(
              { name: 'Mounts', value: 'mounts' },
              { name: 'Pets', value: 'pets' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('buy')
        .setDescription('Buy a mount or pet from the stable')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Enter your character name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Enter the mount/pet name')
            .setRequired(true)
        )
    ),

  // ---- Command Execution ----
  // Handles command execution and routes to appropriate handler
  async execute(interaction) {
    console.log(`[stable.js]: 🚀 Executing stable command: ${interaction.options.getSubcommand()}`);
    
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    try {
      switch (subcommand) {
        case 'view':
          await handleViewStable(interaction, userId, interaction.options.getString('charactername'));
          break;
        case 'store':
          await handleStorePet(interaction, userId, interaction.options.getString('charactername'), interaction.options.getString('name'));
          break;
        case 'retrieve':
          await handleRetrievePet(interaction, userId, interaction.options.getString('charactername'), interaction.options.getString('name'));
          break;
        case 'list':
          await handleListCompanion(interaction, userId, interaction.options.getString('charactername'), interaction.options.getString('name'));
          break;
        case 'browse':
          await handleBrowseStable(interaction, interaction.options.getString('type'));
          break;
        case 'buy':
          await handleBuyPet(interaction, userId, interaction.options.getString('charactername'), interaction.options.getString('name'));
          break;
        default:
          console.log(`[stable.js]: ❌ Invalid subcommand: ${subcommand}`);
          await sendErrorResponse(interaction, 'Invalid subcommand.');
      }
    } catch (error) {
      console.error(`[stable.js]: ❌ Error executing stable command:`, error);
      handleError(error, 'stable.js');
      await sendErrorResponse(interaction, 'An error occurred while processing your request.');
    }
  },

  // Export the viewCompanion function
  viewCompanion
};