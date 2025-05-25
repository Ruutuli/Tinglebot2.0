// ============================================================================
// ------------------- Import necessary modules -------------------
// ============================================================================
const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const Character = require('../../models/CharacterModel');
const Mount = require('../../models/MountModel');
const Pet = require('../../models/PetModel');
const { Stable, ForSaleMount, ForSalePet } = require('../../models/StableModel');
const { handleError } = require('../../utils/globalErrorHandler');
const { getPetEmoji, getPetThumbnail } = require('../../modules/petModule');
const { getMountEmoji, calculateMountPrice, getMountThumbnail } = require('../../modules/mountModule');
const { calculatePetPrice } = require('../../modules/petModule');
const mongoose = require('mongoose');

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================
const command = new SlashCommandBuilder()
  .setName('stable')
  .setDescription('Manage your character\'s stable of pets and mounts')
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View your character\'s stable')
      .addStringOption(option =>
        option
          .setName('charactername')
          .setDescription('The name of your character')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('store')
      .setDescription('Store a pet or mount in your stable')
      .addStringOption(option =>
        option
          .setName('charactername')
          .setDescription('The name of your character')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('The name of the pet or mount to store')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('retrieve')
      .setDescription('Retrieve a pet or mount from your stable')
      .addStringOption(option =>
        option
          .setName('charactername')
          .setDescription('The name of your character')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('The name of the pet or mount to retrieve')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('sell')
      .setDescription('Put a pet or mount up for sale')
      .addStringOption(option =>
        option
          .setName('charactername')
          .setDescription('The name of your character')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('The name of the pet or mount to sell')
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Function: getStableSlotsUsed -------------------
// Calculates how many stable slots are currently in use
async function getStableSlotsUsed(stable) {
  return (stable.storedMounts?.length || 0) + (stable.storedPets?.length || 0);
}

// ------------------- Function: findCompanion -------------------
// Finds a companion (pet or mount) by name and type
async function findCompanion(character, name, stable = null) {
  const [mount, pet] = await Promise.all([
    Mount.findOne({ owner: character.name, name }),
    Pet.findOne({ owner: character._id, name })
  ]);

  // If we're checking for a stored companion, verify it's in the stable
  if (stable) {
    if (mount) {
      const isStored = stable.storedMounts.some(m => m.mountId.equals(mount._id));
      if (!isStored) return null;
    }
    if (pet) {
      const isStored = stable.storedPets.some(p => p.petId.equals(pet._id));
      if (!isStored) return null;
    }
  }

  return mount || pet;
}

// ------------------- Function: createStableIfNeeded -------------------
// Creates a stable for a character if they don't have one
async function createStableIfNeeded(character) {
  try {
    // First check if character already has a valid stable
    if (character.stable && mongoose.Types.ObjectId.isValid(character.stable)) {
      const existingStable = await Stable.findById(character.stable);
      if (existingStable) {
        return existingStable;
      }
      // If stable ID exists but document not found, clear the invalid stable ID
      character.stable = null;
      await character.save();
    }

    // Create new stable
    const stable = await Stable.create({
      characterId: character._id,
      discordId: character.userId,
      maxSlots: 3
    });

    // Validate the created stable
    if (!stable || !stable._id || !mongoose.Types.ObjectId.isValid(stable._id)) {
      throw new Error('Failed to create valid stable');
    }

    // Update character with new stable ID
    character.stable = stable._id;
    await character.save();

    return stable;
  } catch (error) {
    console.error(`[stable.js]: ❌ Error in createStableIfNeeded: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// ------------------- Command Handler -------------------
// ============================================================================
async function execute(interaction) {
  try {
    const subcommand = interaction.options.getSubcommand();
    const characterNameRaw = interaction.options.getString('charactername');
    const userId = interaction.user.id;

    // Extract just the name part if it includes village and job
    const characterName = characterNameRaw.split('|')[0].trim();

    // Get character and verify ownership
    const character = await Character.findOne({ name: characterName, userId });
    if (!character) {
      return await interaction.reply({
        content: '❌ Character not found or you don\'t own this character.',
        ephemeral: true
      });
    }

    // Get or create stable
    const stable = await createStableIfNeeded(character);

    switch (subcommand) {
      case 'view':
        await handleView(interaction, character, stable);
        break;
      case 'store':
        await handleStore(interaction, character, stable);
        break;
      case 'retrieve':
        await handleRetrieve(interaction, character, stable);
        break;
      case 'sell':
        await handleSell(interaction, character, stable);
        break;
    }
  } catch (error) {
    handleError(error, 'stable.js', {
      operation: 'execute',
      userId: interaction.user.id,
      interactionId: interaction.id
    });
    await interaction.reply({
      content: '❌ An error occurred while processing your request.',
      ephemeral: true
    });
  }
}

// ============================================================================
// ------------------- Subcommand Handlers -------------------
// ============================================================================

// ------------------- Function: handleView -------------------
async function handleView(interaction, character, stable) {
  const slotsUsed = await getStableSlotsUsed(stable);
  const slotsRemaining = stable.maxSlots - slotsUsed;

  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`🏰 ${character.name}'s Stable`)
    .setDescription(`📊 **Stable Status**\n• Slots Used: ${slotsUsed}/${stable.maxSlots}\n• Available Space: ${slotsRemaining} slots`)
    .setTimestamp();

  // Add stored mounts
  if (stable.storedMounts?.length > 0) {
    let mountDescription = '';
    for (const storedMount of stable.storedMounts) {
      const mount = await Mount.findById(storedMount.mountId);
      if (mount) {
        const mountEmoji = getMountEmoji(mount.species);
        mountDescription += `\n**${mountEmoji} ${mount.name}**\n`;
        mountDescription += `┣ Species: ${mount.species}\n`;
        mountDescription += `┣ Level: ${mount.level}\n`;
        mountDescription += `┣ Stamina: ${mount.currentStamina}/${mount.stamina}🥕\n`;
        if (mount.traits?.length > 0) {
          mountDescription += `┣ Traits: ${mount.traits.map(trait => `\`${trait}\``).join(', ')}\n`;
        }
        if (mount.region) {
          mountDescription += `┣ Region: ${mount.region} 🌍\n`;
        }
        if (mount.lastMountTravel) {
          mountDescription += `┗ Last Travel: ${mount.lastMountTravel.toLocaleDateString()} 📅\n`;
        } else {
          mountDescription += `┗ Last Travel: Never 📅\n`;
        }
      }
    }
    embed.addFields({ name: '🐴 Stored Mounts', value: mountDescription || 'No mounts stored' });
  }

  // Add stored pets
  if (stable.storedPets?.length > 0) {
    let petDescription = '';
    for (const storedPet of stable.storedPets) {
      const pet = await Pet.findById(storedPet.petId);
      if (pet) {
        const petEmoji = getPetEmoji(pet.species);
        petDescription += `\n**${petEmoji} ${pet.name}**\n`;
        petDescription += `┣ Species: ${pet.species}\n`;
        petDescription += `┣ Type: ${pet.petType}\n`;
        petDescription += `┣ Level: ${pet.level} ⭐\n`;
        if (pet.rollsRemaining > 0) {
          petDescription += `┣ Rolls Remaining: ${pet.rollsRemaining} 🎲\n`;
        }
        if (pet.rollCombination?.length > 0) {
          petDescription += `┣ Roll Combination: ${pet.rollCombination.map(roll => `\`${roll}\``).join(', ')} 🎯\n`;
        }
        if (pet.tableDescription) {
          petDescription += `┣ Table: ${pet.tableDescription} 📋\n`;
        }
        if (pet.lastRollDate) {
          petDescription += `┗ Last Roll: ${pet.lastRollDate.toLocaleDateString()} 📅\n`;
        } else {
          petDescription += `┗ Last Roll: Never 📅\n`;
        }
      }
    }
    embed.addFields({ name: '🐾 Stored Pets', value: petDescription || 'No pets stored' });
  }

  if (!stable.storedMounts?.length && !stable.storedPets?.length) {
    embed.addFields({ name: '📭 Empty Stable', value: 'No pets or mounts currently stored.' });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ------------------- Function: handleStore -------------------
async function handleStore(interaction, character, stable) {
  const companionName = interaction.options.getString('name');
  const companion = await findCompanion(character, companionName);

  if (!companion) {
    return await interaction.reply({
      content: '❌ No pet or mount found with that name.',
      ephemeral: true
    });
  }

  // Verify ownership
  const isOwner = companion instanceof Mount 
    ? companion.owner === character.name
    : companion.owner.toString() === character._id.toString();

  if (!isOwner) {
    return await interaction.reply({
      content: '❌ You do not own this companion.',
      ephemeral: true
    });
  }

  // Check if companion is already stored
  if (companion.status === 'stored') {
    return await interaction.reply({
      content: '❌ This companion is already stored.',
      ephemeral: true
    });
  }

  // Check if companion is listed
  if (companion.status === 'listed') {
    return await interaction.reply({
      content: '❌ Cannot store a listed companion.',
      ephemeral: true
    });
  }

  // Check stable capacity
  const slotsUsed = await getStableSlotsUsed(stable);
  if (slotsUsed >= stable.maxSlots) {
    return await interaction.reply({
      content: '❌ Your stable is full!',
      ephemeral: true
    });
  }

  // Store the companion
  companion.status = 'stored';
  companion.storedAt = new Date();
  await companion.save();

  // Add to stable
  if (companion instanceof Mount) {
    stable.storedMounts.push({
      mountId: companion._id,
      storedAt: new Date()
    });
  } else {
    stable.storedPets.push({
      petId: companion._id,
      storedAt: new Date()
    });
  }
  await stable.save();

  // Remove from active companions
  if (character.currentActiveMount?.equals(companion._id)) {
    character.currentActiveMount = null;
  } else if (character.currentActivePet?.equals(companion._id)) {
    character.currentActivePet = null;
  }
  await character.save();

  await interaction.reply({
    content: `✅ Successfully stored ${companion.name} in your stable.`,
    ephemeral: true
  });
}

// ------------------- Function: handleRetrieve -------------------
async function handleRetrieve(interaction, character, stable) {
  const companionName = interaction.options.getString('name');
  const companion = await findCompanion(character, companionName, stable);

  if (!companion) {
    return await interaction.reply({
      content: '❌ No pet or mount found with that name in your stable.',
      ephemeral: true
    });
  }

  // Check if companion is stored
  if (companion.status !== 'stored') {
    return await interaction.reply({
      content: '❌ This companion is not stored in your stable.',
      ephemeral: true
    });
  }

  // Verify the companion is actually in this stable
  const isInStable = companion instanceof Mount 
    ? stable.storedMounts.some(m => m.mountId.equals(companion._id))
    : stable.storedPets.some(p => p.petId.equals(companion._id));

  if (!isInStable) {
    return await interaction.reply({
      content: '❌ This companion is not stored in your stable.',
      ephemeral: true
    });
  }

  // Check if character already has an active companion of the same type
  if (companion instanceof Mount && character.currentActiveMount) {
    return await interaction.reply({
      content: '❌ You already have an active mount.',
      ephemeral: true
    });
  } else if (companion instanceof Pet && character.currentActivePet) {
    return await interaction.reply({
      content: '❌ You already have an active pet.',
      ephemeral: true
    });
  }

  // Remove from stable
  if (companion instanceof Mount) {
    stable.storedMounts = stable.storedMounts.filter(m => !m.mountId.equals(companion._id));
  } else {
    stable.storedPets = stable.storedPets.filter(p => !p.petId.equals(companion._id));
  }
  await stable.save();

  // Update companion status
  companion.status = 'active';
  companion.storedAt = null;
  await companion.save();

  // Set as active companion
  if (companion instanceof Mount) {
    character.currentActiveMount = companion._id;
  } else {
    character.currentActivePet = companion._id;
  }
  await character.save();

  await interaction.reply({
    content: `✅ Successfully retrieved ${companion.name} from your stable.`,
    ephemeral: true
  });
}

// ------------------- Function: handleSell -------------------
async function handleSell(interaction, character, stable) {
  const companionName = interaction.options.getString('name');
  const companion = await findCompanion(character, companionName);

  if (!companion) {
    return await interaction.reply({
      content: '❌ No pet or mount found with that name.',
      ephemeral: true
    });
  }

  // Check if companion is already listed
  if (companion.status === 'for_sale') {
    return await interaction.reply({
      content: '❌ This companion is already listed for sale.',
      ephemeral: true
    });
  }

  // Calculate price based on companion type
  const price = companion instanceof Mount ? 
    calculateMountPrice(companion) : 
    calculatePetPrice(companion);

  // Create listing
  const listingData = {
    species: companion.species,
    name: companion.name,
    ownerName: character.name,
    sellerId: character._id,
    discordId: character.userId,
    price: price
  };

  if (companion instanceof Mount) {
    Object.assign(listingData, {
      level: companion.level,
      fee: companion.fee,
      stamina: companion.stamina,
      currentStamina: companion.currentStamina,
      traits: companion.traits,
      region: companion.region,
      lastMountTravel: companion.lastMountTravel
    });
    await ForSaleMount.create(listingData);
  } else {
    Object.assign(listingData, {
      petType: companion.petType,
      level: companion.level,
      rollsRemaining: companion.rollsRemaining,
      rollCombination: companion.rollCombination,
      tableDescription: companion.tableDescription,
      lastRollDate: companion.lastRollDate
    });
    await ForSalePet.create(listingData);
  }

  // Update companion status and remove owner
  companion.status = 'for_sale';
  if (companion instanceof Mount) {
    companion.owner = 'stables';
  } else {
    // For pets, we need to keep the owner as an ObjectId but set ownerName to 'stables'
    companion.ownerName = 'stables';
    companion.discordId = 'stables'; // Set discordId for stables
  }
  companion.storedAt = null;
  companion.removedFromStorageAt = new Date();
  await companion.save();

  // Remove from stable if stored
  if (companion.status === 'stored') {
    if (companion instanceof Mount) {
      stable.storedMounts = stable.storedMounts.filter(m => !m.mountId.equals(companion._id));
    } else {
      stable.storedPets = stable.storedPets.filter(p => !p.petId.equals(companion._id));
    }
    await stable.save();
  }

  // Remove from active companions
  if (character.currentActiveMount?.equals(companion._id)) {
    character.currentActiveMount = null;
  } else if (character.currentActivePet?.equals(companion._id)) {
    character.currentActivePet = null;
  }
  await character.save();

  // Create embed for the sale listing
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`🏪 New Companion Listed for Sale`)
    .setDescription(`A new companion has been listed in the marketplace!`)
    .addFields(
      { name: 'Name', value: companion.name, inline: true },
      { name: 'Species', value: companion.species, inline: true },
      { name: 'Level', value: companion.level.toString(), inline: true }
    );

  if (companion instanceof Mount) {
    const mountEmoji = getMountEmoji(companion.species);
    embed.setThumbnail(getMountThumbnail(companion.species))
      .addFields(
        { name: 'Type', value: 'Mount', inline: true },
        { name: 'Stamina', value: `${companion.currentStamina}/${companion.stamina} 🥕`, inline: true },
        { name: 'Region', value: companion.region || 'Any', inline: true }
      );
    if (companion.traits?.length > 0) {
      embed.addFields({ name: 'Traits', value: companion.traits.map(trait => `\`${trait}\``).join(', ') });
    }
  } else {
    const petEmoji = getPetEmoji(companion.species);
    embed.setThumbnail(getPetThumbnail(companion.species))
      .addFields(
        { name: 'Type', value: 'Pet', inline: true },
        { name: 'Pet Type', value: companion.petType, inline: true },
        { name: 'Rolls Remaining', value: companion.rollsRemaining.toString(), inline: true }
      );
    if (companion.rollCombination?.length > 0) {
      embed.addFields({ name: 'Roll Types', value: companion.rollCombination.map(roll => `\`${roll}\``).join(', ') });
    }
  }

  embed.addFields(
    { name: 'Price', value: `${price} tokens`, inline: true },
    { name: 'Seller', value: character.name, inline: true },
    { name: 'Listed At', value: new Date().toLocaleString(), inline: true }
  );

  await interaction.reply({ embeds: [embed] });
}

// ============================================================================
// ------------------- Export -------------------
// ============================================================================
module.exports = {
  data: command,
  execute
}; 