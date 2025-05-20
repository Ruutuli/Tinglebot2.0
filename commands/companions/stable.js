// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler');
const { fetchCharacterByNameAndUserId } = require('../../database/db');
const Stable = require('../../models/StableModel');
const Mount = require('../../models/MountModel');
const Pet = require('../../models/PetModel');
const User = require('../../models/UserModel');
const { appendSheetData, authorizeSheets, extractSpreadsheetId, isValidGoogleSheetsUrl, safeAppendDataToSheet, } = require('../../utils/googleSheetsUtils');
const { calculateMountPrice, getMountThumbnail } = require('../../modules/mountModule');

// ------------------- Define Stable Command -------------------
module.exports = {
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

  // ------------------- Execute Stable Command -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    try {
      switch (subcommand) {
        case 'view':
          await handleViewStable(interaction, userId, interaction.options.getString('charactername'));
          break;
        case 'store':
          await handleStoreMount(interaction, userId, interaction.options.getString('charactername'), interaction.options.getString('name'));
          break;
        case 'retrieve':
          await handleRetrieveMount(interaction, userId, interaction.options.getString('charactername'), interaction.options.getString('name'));
          break;
        case 'list':
          const name = interaction.options.getString('name');
          const characterName = interaction.options.getString('charactername');
          // Check if it's a mount or pet
          const character = await fetchCharacterByNameAndUserId(characterName, userId);
          if (!character) {
            await interaction.reply({ content: '❌ Character not found or does not belong to you.', ephemeral: true });
            return;
          }
          const mount = await Mount.findOne({ owner: character._id, name: name });
          if (mount) {
            await handleListMount(interaction, userId, characterName, name);
          } else {
            await handleListPet(interaction, userId, characterName, name);
          }
          break;
        case 'browse':
          await handleBrowseStable(interaction, interaction.options.getString('type'));
          break;
        case 'buy':
          await handleBuyMount(interaction, userId, interaction.options.getString('charactername'), interaction.options.getString('name'));
          break;
        default:
          await interaction.reply({ content: '❌ Invalid subcommand.', ephemeral: true });
      }
    } catch (error) {
      handleError(error, 'stable.js');
      await interaction.reply({ content: '❌ An error occurred while processing your request.', ephemeral: true });
    }
  },

  async autocomplete(interaction) {
    const { handleAutocomplete } = require('../../handlers/autocompleteHandler');
    await handleAutocomplete(interaction);
  }
};

// ------------------- Handle Viewing Stable -------------------
async function handleViewStable(interaction, userId, characterName) {
  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
    await interaction.reply({ content: '❌ Character not found or does not belong to you.', ephemeral: true });
    return;
  }

  let stable = await Stable.findOne({ characterId: character._id });
  if (!stable) {
    stable = new Stable({ characterId: character._id, discordId: userId });
    await stable.save();
  }

  const storedMounts = await Mount.find({ _id: { $in: stable.storedMounts.map(m => m.mountId) } });
  const storedPets = await Pet.find({ _id: { $in: stable.storedPets.map(p => p.petId) } });

  const embed = new EmbedBuilder()
    .setTitle(`�� ${character.name}'s Stable`)
    .setColor(0xAA926A)
    .addFields(
      { name: '📦 Stored Mounts', value: storedMounts.length ? storedMounts.map(m => `> ${m.name} (${m.species})`).join('\n') : '> No mounts stored', inline: false },
      { name: '🐾 Stored Pets', value: storedPets.length ? storedPets.map(p => `> ${p.name} (${p.species})`).join('\n') : '> No pets stored', inline: false },
      { name: '📊 Storage', value: `> ${storedMounts.length + storedPets.length}/${stable.maxSlots} slots used`, inline: false }
    );

  await interaction.reply({ embeds: [embed] });
}

// ------------------- Handle Storing Mount -------------------
async function handleStoreMount(interaction, userId, characterName, mountName) {
  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
    await interaction.reply({ content: '❌ Character not found or does not belong to you.', ephemeral: true });
    return;
  }

  let stable = await Stable.findOne({ characterId: character._id });
  if (!stable) {
    stable = new Stable({ characterId: character._id, discordId: userId });
    await stable.save();
  }

  const totalStored = stable.storedMounts.length + stable.storedPets.length;
  if (totalStored >= stable.maxSlots) {
    await interaction.reply({ content: '❌ Your stable is full! You can only store up to 3 mounts/pets.', ephemeral: true });
    return;
  }

  const mount = await Mount.findOne({ owner: character._id, name: mountName });
  if (!mount) {
    await interaction.reply({ content: `❌ Mount **${mountName}** not found.`, ephemeral: true });
    return;
  }

  if (mount.isStored) {
    await interaction.reply({ content: `❌ Mount **${mountName}** is already stored in a stable.`, ephemeral: true });
    return;
  }

  // Check if this is the active mount
  if (character.mount && character.activeMount === mount._id) {
    // Find another non-stored mount to set as active
    const otherMount = await Mount.findOne({ 
      owner: character._id, 
      _id: { $ne: mount._id },
      isStored: false 
    });

    if (otherMount) {
      // Set the other mount as active
      character.activeMount = otherMount._id;
      character.mount = true;
    } else {
      // No other mounts available
      character.mount = false;
      character.activeMount = null;
    }
    await character.save();
  }

  stable.storedMounts.push({ mountId: mount._id });
  await stable.save();

  mount.isStored = true;
  mount.storageLocation = character.currentVillage;
  mount.storedAt = new Date();
  await mount.save();

  const response = otherMount 
    ? `✅ Successfully stored **${mountName}** in your stable. You are now riding **${otherMount.name}**.`
    : `✅ Successfully stored **${mountName}** in your stable.`;

  await interaction.reply({ content: response });
}

// ------------------- Handle Retrieving Mount -------------------
async function handleRetrieveMount(interaction, userId, characterName, mountName) {
  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
    await interaction.reply({ content: '❌ Character not found or does not belong to you.', ephemeral: true });
    return;
  }

  const stable = await Stable.findOne({ characterId: character._id });
  if (!stable) {
    await interaction.reply({ content: '❌ You do not have a stable.', ephemeral: true });
    return;
  }

  const mount = await Mount.findOne({ owner: character._id, name: mountName });
  if (!mount) {
    await interaction.reply({ content: `❌ Mount **${mountName}** not found.`, ephemeral: true });
    return;
  }

  if (!mount.isStored) {
    await interaction.reply({ content: `❌ Mount **${mountName}** is not stored in a stable.`, ephemeral: true });
    return;
  }

  if (character.mount) {
    await interaction.reply({ content: '❌ You already have a mount active. Store your current mount first.', ephemeral: true });
    return;
  }

  stable.storedMounts = stable.storedMounts.filter(m => m.mountId.toString() !== mount._id.toString());
  await stable.save();

  mount.isStored = false;
  mount.storageLocation = null;
  mount.storedAt = null;
  await mount.save();

  character.mount = true;
  character.activeMount = mount._id;
  await character.save();

  await interaction.reply({ content: `✅ Successfully retrieved **${mountName}** from your stable.` });
}

// ------------------- Handle Listing Mount -------------------
async function handleListMount(interaction, userId, characterName, mountName) {
  try {
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      await interaction.reply({ content: '❌ Character not found or does not belong to you.', ephemeral: true });
      return;
    }

    let stable = await Stable.findOne({ characterId: character._id });
    if (!stable) {
      stable = new Stable({ characterId: character._id, discordId: userId });
      await stable.save();
    }

    const mount = await Mount.findOne({ owner: character._id, name: mountName });
    if (!mount) {
      await interaction.reply({ content: `❌ Mount **${mountName}** not found.`, ephemeral: true });
      return;
    }

    const user = await User.findOne({ discordId: userId });
    if (!user) {
      await interaction.reply({ content: '❌ User not found.', ephemeral: true });
      return;
    }

    // Calculate price using the existing function
    const price = calculateMountPrice(mount);

    // Update mount status for listing
    mount.owner = 'For Sale'; // Set to 'For Sale' instead of null to satisfy validation
    mount.isStored = true;
    mount.storageLocation = 'For Sale';
    mount.storedAt = new Date();
    await mount.save();

    // Remove from stored mounts if it was stored
    if (stable.storedMounts.some(m => m.mountId.toString() === mount._id.toString())) {
      stable.storedMounts = stable.storedMounts.filter(m => m.mountId.toString() !== mount._id.toString());
    }

    // Add to listed mounts
    stable.listedMounts.push({
      mountId: mount._id,
      price: price,
      sellerId: user._id,
      originalOwner: character.name
    });
    await stable.save();

    // Update character's mount status if it was active
    if (character.mount && character.activeMount === mount._id) {
      character.mount = false;
      character.activeMount = null;
      await character.save();
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏪 Mount Listed for Sale`)
      .setColor(0xAA926A)
      .setDescription(`**${mount.name}** has been listed for sale!`)
      .addFields(
        { name: '🐎 Mount Details', value: `> Species: ${mount.species}\n> Level: ${mount.level}\n> Traits: ${mount.traits.join(', ')}`, inline: false },
        { name: '💰 Price', value: `> ${price} tokens`, inline: false },
        { name: '👤 Seller', value: `> ${character.name}`, inline: false }
      )
      .setFooter({ text: 'The mount will remain listed until purchased or removed.' });

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    handleError(error, 'stable.js', {
      commandName: 'list',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName: characterName,
      options: {
        mountName: mountName,
        operation: 'listMount'
      }
    });
    await interaction.reply({ content: '❌ An error occurred while listing your mount.', ephemeral: true });
  }
}

// ------------------- Handle Listing Pet -------------------
async function handleListPet(interaction, userId, characterName, petName) {
  try {
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      await interaction.reply({ content: '❌ Character not found or does not belong to you.', ephemeral: true });
      return;
    }

    let stable = await Stable.findOne({ characterId: character._id });
    if (!stable) {
      stable = new Stable({ characterId: character._id, discordId: userId });
      await stable.save();
    }

    const pet = await Pet.findOne({ owner: character._id, name: petName });
    if (!pet) {
      await interaction.reply({ content: `❌ Pet **${petName}** not found.`, ephemeral: true });
      return;
    }

    const user = await User.findOne({ discordId: userId });
    if (!user) {
      await interaction.reply({ content: '❌ User not found.', ephemeral: true });
      return;
    }

    // Calculate price based on pet's level and traits
    const traits = Array.isArray(pet.traits) ? pet.traits : [];
    const price = Math.floor(pet.level * 100 + (traits.length * 50));

    // Update pet status for listing
    pet.owner = 'For Sale'; // Set to 'For Sale' instead of null to satisfy validation
    pet.isStored = true;
    pet.storageLocation = 'For Sale';
    pet.storedAt = new Date();
    await pet.save();

    // Remove from stored pets if it was stored
    if (stable.storedPets.some(p => p.petId.toString() === pet._id.toString())) {
      stable.storedPets = stable.storedPets.filter(p => p.petId.toString() !== pet._id.toString());
    }

    // Add to listed pets
    stable.listedPets.push({
      petId: pet._id,
      price: price,
      sellerId: user._id,
      originalOwner: character.name
    });
    await stable.save();

    // Update character's pet status if it was active
    if (character.pet) {
      character.pet = false;
      await character.save();
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏪 Pet Listed for Sale`)
      .setColor(0xAA926A)
      .setDescription(`**${pet.name}** has been listed for sale!`)
      .addFields(
        { name: '🐾 Pet Details', value: `> Species: ${pet.species}\n> Level: ${pet.level}\n> Traits: ${traits.join(', ')}`, inline: false },
        { name: '💰 Price', value: `> ${price} tokens`, inline: false },
        { name: '👤 Seller', value: `> ${character.name}`, inline: false }
      )
      .setFooter({ text: 'The pet will remain listed until purchased or removed.' });

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    handleError(error, 'stable.js', {
      commandName: 'list',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName: characterName,
      options: {
        petName: petName,
        operation: 'listPet'
      }
    });
    await interaction.reply({ content: '❌ An error occurred while listing your pet.', ephemeral: true });
  }
}

// ------------------- Handle Browsing Stable -------------------
async function handleBrowseStable(interaction, type) {
  const stables = await Stable.find({});
  const listings = [];

  for (const stable of stables) {
    const items = type === 'mounts' ? stable.listedMounts : stable.listedPets;
    const unsoldItems = items.filter(item => !item.isSold);
    
    for (const item of unsoldItems) {
      const companion = type === 'mounts' 
        ? await Mount.findById(item.mountId)
        : await Pet.findById(item.petId);
      
      if (companion) {
        listings.push({
          name: companion.name,
          species: companion.species,
          level: companion.level,
          price: item.price,
          seller: item.originalOwner,
          traits: companion.traits
        });
      }
    }
  }

  if (listings.length === 0) {
    await interaction.reply({ content: `❌ No ${type} are currently listed for sale.`, ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
  .setTitle(`🏪 ${type.charAt(0).toUpperCase() + type.slice(1)} for Sale`)
    .setColor(0xAA926A)
    .setDescription(listings.map(l => 
      `**${l.name}** (${l.species})\n` +
      `> Level: ${l.level}\n` +
      `> Price: ${l.price} tokens\n` +
      `> Seller: ${l.seller}\n` +
      `> Traits: ${l.traits.join(', ')}\n`
    ).join('\n'));

  await interaction.reply({ embeds: [embed] });
}

// ------------------- Handle Buying Mount -------------------
async function handleBuyMount(interaction, userId, characterName, mountName) {
  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
    await interaction.reply({ content: '❌ Character not found or does not belong to you.', ephemeral: true });
    return;
  }

  if (character.mount) {
    await interaction.reply({ content: '❌ You already have a mount active. Store your current mount first.', ephemeral: true });
    return;
  }

  const user = await User.findOne({ discordId: userId });
  if (!user) {
    await interaction.reply({ content: '❌ User not found.', ephemeral: true });
    return;
  }

  const stables = await Stable.find({});
  let foundListing = null;
  let foundStable = null;

  for (const stable of stables) {
    const listing = stable.listedMounts.find(l => !l.isSold);
    if (listing) {
      const mount = await Mount.findById(listing.mountId);
      if (mount && mount.name === mountName) {
        foundListing = listing;
        foundStable = stable;
        break;
      }
    }
  }

  if (!foundListing) {
    await interaction.reply({ content: `❌ Mount **${mountName}** is not available for purchase.`, ephemeral: true });
    return;
  }

  if (user.tokens < foundListing.price) {
    await interaction.reply({ content: `❌ You don't have enough tokens. This mount costs ${foundListing.price} tokens.`, ephemeral: true });
    return;
  }

  const mount = await Mount.findById(foundListing.mountId);
  mount.owner = character.name;
  mount.isStored = false;
  mount.storageLocation = null;
  mount.storedAt = null;
  await mount.save();

  foundListing.isSold = true;
  foundListing.soldAt = new Date();
  foundListing.buyerId = user._id;
  await foundStable.save();

  const seller = await User.findById(foundListing.sellerId);
  seller.tokens += foundListing.price;
  await seller.save();

  user.tokens -= foundListing.price;
  await user.save();

  character.mount = true;
  await character.save();

  await interaction.reply({ content: `✅ Successfully purchased **${mountName}** for ${foundListing.price} tokens.` });
}
  
  
  