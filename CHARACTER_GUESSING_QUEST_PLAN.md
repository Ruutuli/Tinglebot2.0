# Character Guessing Quest (HWQ) - Implementation Plan

## Overview
A new Help Wanted Quest type where players must guess which character is being described. The quest presents clues in **two possible variants**:
1. **Snippets** – 2–4 excerpts from the character's `personality` and `history` (see `CharacterModel.js`: `personality`, `history`).
2. **Icon zoom** – A really zoomed-in crop of the character's `icon` image (see `CharacterModel.js`: `icon` { type: String, required: true }).

Players use `/helpwanted guess` to submit their answer. First correct guess wins.

**Quest Type Name:** `character-guess` or `guess`  
**Emoji:** 🎭 or 🔍

---

## Feature Description

### Concept
- An NPC posts a quest asking "Who is this person?"
- **Sometimes** the quest shows 2–4 snippets from the character's `personality` and `history`.
- **Sometimes** the quest shows only a really zoomed-in picture of the character's `icon` (so you have to guess from a small detail).
- Players use `/helpwanted guess` to submit their answer.
- First correct guess wins; only characters native to the quest's village can participate.

### Clue Variants
| Variant     | Source (CharacterModel) | What players see |
|------------|--------------------------|------------------|
| `snippets` | `personality`, `history` | 2–4 text excerpts |
| `icon-zoom`| `icon` (required String) | Single zoomed/cropped image (e.g. center 15–25% of icon) |

### Quest Flow
1. **Generation**: Pick accepted character; randomly choose clue type (`snippets` or `icon-zoom`). For snippets: extract text. For icon-zoom: generate/store zoomed icon URL.
2. **Posting**: Embed shows either snippet text or the zoomed icon (and flavor text).
3. **Completion**: Player uses `/helpwanted guess` with quest ID and guessed name.
4. **Validation**: Match guess to character name (case-insensitive).
5. **Reward**: Standard HWQ rewards apply.

---

## Data Structure Changes

### 1. HelpWantedQuestModel Schema Update
**File:** `dashboard/models/HelpWantedQuestModel.js` and `bot/models/HelpWantedQuestModel.js`

Add `'character-guess'` or `'guess'` to the `type` enum:
```javascript
type: {
  type: String,
  required: true,
  enum: ['item', 'monster', 'escort', 'crafting', 'art', 'writing', 'character-guess'] // or 'guess'
}
```

### 2. Quest Requirements Structure
For character-guess quests, `requirements` always has base fields, then **either** snippet fields **or** icon-zoom fields depending on `clueType` (from `CharacterModel`: `_id`, `name`, `personality`, `history`, `icon`).

**Base (all character-guess quests):**
```javascript
{
  characterId: ObjectId,        // CharacterModel._id
  characterName: String,       // CharacterModel.name - for validation (case-insensitive)
  clueType: String              // 'snippets' | 'icon-zoom'
}
```

**When clueType === 'snippets':**
```javascript
{
  ...base,
  snippets: [
    { text: String, source: 'personality' | 'history' }
  ],
  snippetCount: Number          // 2-4
}
```

**When clueType === 'icon-zoom':**
```javascript
{
  ...base,
  iconUrl: String,              // CharacterModel.icon - original icon URL
  zoomedIconUrl: String         // URL of generated zoomed/cropped image (see "Zoomed icon generation" below)
}
```

---

## Implementation Steps

### Phase 1: Quest Generation Logic

#### 1.1 Update Quest Type Constants
**File:** `bot/modules/helpWantedModule.js`

- Add `'character-guess'` to `QUEST_TYPES` array (line ~24)
- Add emoji mapping: `'character-guess': '🎭'` to `QUEST_TYPE_EMOJIS` (line ~57-64)
- Add to `QUEST_PARAMS` if needed (though this quest type doesn't need amount params)

#### 1.2 Create Character Pool Functions
**File:** `bot/modules/helpWantedModule.js`  
**Reference:** `bot/models/CharacterModel.js` – `icon` (required), `personality`, `history`, `status: 'accepted'`.

**Pool for snippet clues** – characters with enough personality/history text:
```javascript
// ------------------- Function: getCharacterGuessPool (snippets) -------------------
// Fetches accepted characters with sufficient personality and history (CharacterModel)
async function getCharacterGuessSnippetPool() {
  try {
    const Character = require('@/models/CharacterModel');
    
    const characters = await Character.find({
      status: 'accepted',
      $and: [
        { personality: { $exists: true, $ne: '', $not: /^\s*$/ } },
        { history: { $exists: true, $ne: '', $not: /^\s*$/ } }
      ]
    }).select('_id name personality history homeVillage icon');
    
    const validCharacters = characters.filter(char => {
      const personalityLength = (char.personality || '').trim().length;
      const historyLength = (char.history || '').trim().length;
      return personalityLength >= 50 && historyLength >= 50;
    });
    
    if (validCharacters.length === 0) {
      logger.warn('QUEST', 'No characters available for character-guess (snippets) pool');
      return [];
    }
    return validCharacters;
  } catch (error) {
    logger.error('QUEST', 'Error fetching character guess snippet pool', error);
    return [];
  }
}
```

**Pool for icon-zoom clues** – any accepted character with a valid `icon` URL (CharacterModel requires `icon`):
```javascript
// ------------------- Function: getCharacterGuessIconPool -------------------
// Fetches accepted characters with valid icon URL (CharacterModel.icon)
async function getCharacterGuessIconPool() {
  try {
    const Character = require('@/models/CharacterModel');
    
    const characters = await Character.find({
      status: 'accepted',
      icon: { $exists: true, $ne: '', $not: /^\s*$/ }
    }).select('_id name icon homeVillage');
    
    if (characters.length === 0) {
      logger.warn('QUEST', 'No characters available for character-guess (icon-zoom) pool');
      return [];
    }
    return characters;
  } catch (error) {
    logger.error('QUEST', 'Error fetching character guess icon pool', error);
    return [];
  }
}
```

**Unified pool** (optional): build one pool with a `canSnippet` / `canIcon` flag per character so generation can pick clue type then filter.

#### 1.3 Create Snippet Extraction Function
**File:** `bot/modules/helpWantedModule.js`

```javascript
// ------------------- Function: extractSnippetsFromCharacter -------------------
// Extracts random snippets from character's personality and history
function extractSnippetsFromCharacter(character, snippetCount = 3) {
  const snippets = [];
  const personality = (character.personality || '').trim();
  const history = (character.history || '').trim();
  
  // Split into sentences (rough approximation)
  const personalitySentences = personality.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const historySentences = history.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  // Ensure we have enough sentences
  if (personalitySentences.length === 0 && historySentences.length === 0) {
    throw new Error('Character has insufficient text for snippets');
  }
  
  // Determine how many snippets from each source
  // At least 1 from each if both available, otherwise all from available source
  let personalityCount = 0;
  let historyCount = 0;
  
  if (personalitySentences.length > 0 && historySentences.length > 0) {
    // Mix: at least 1 from each
    personalityCount = Math.max(1, Math.floor(snippetCount / 2));
    historyCount = snippetCount - personalityCount;
  } else if (personalitySentences.length > 0) {
    personalityCount = snippetCount;
  } else {
    historyCount = snippetCount;
  }
  
  // Extract personality snippets
  for (let i = 0; i < Math.min(personalityCount, personalitySentences.length); i++) {
    const randomIndex = Math.floor(Math.random() * personalitySentences.length);
    const snippet = personalitySentences[randomIndex].trim();
    if (snippet.length > 0) {
      snippets.push({
        text: snippet,
        source: 'personality'
      });
      personalitySentences.splice(randomIndex, 1); // Remove to avoid duplicates
    }
  }
  
  // Extract history snippets
  for (let i = 0; i < Math.min(historyCount, historySentences.length); i++) {
    const randomIndex = Math.floor(Math.random() * historySentences.length);
    const snippet = historySentences[randomIndex].trim();
    if (snippet.length > 0) {
      snippets.push({
        text: snippet,
        source: 'history'
      });
      historySentences.splice(randomIndex, 1); // Remove to avoid duplicates
    }
  }
  
  // Shuffle snippets
  return shuffleArray(snippets);
}
```

#### 1.4 Zoomed Icon Generation (icon-zoom variant)
**Reference:** `CharacterModel.icon` is a String URL (required). We need a **zoomed/cropped** version (e.g. center 15–25% of the image) so the full character isn’t obvious.

**Option A – Server-side at quest generation (recommended)**  
When generating an icon-zoom quest:
1. Fetch the image from `character.icon` (e.g. `https://cdn.discordapp.com/...`).
2. Crop to a small center region (e.g. 20% width × 20% height, or a random offset so it’s not always the same spot).
3. Scale that crop up to a reasonable display size (e.g. 256×256) so it looks “zoomed in”.
4. Save to temp storage or your CDN and get a URL → store as `requirements.zoomedIconUrl`.

**Libraries:** `sharp` or `jimp` in Node. Example shape:
```javascript
// ------------------- Function: generateZoomedIconUrl -------------------
// Fetches character.icon, crops center region (e.g. 20% size), scales up, saves and returns URL
async function generateZoomedIconUrl(iconUrl, characterId) {
  // 1. Fetch image from iconUrl
  // 2. Get dimensions; crop rect = center 15-25% of width/height (randomize slightly)
  // 3. Resize crop to e.g. 256x256
  // 4. Save to /public/quest-clues/<questId>-zoomed.png or upload to CDN
  // 5. Return public URL for zoomedIconUrl
}
```

**Option B – API route**  
Dashboard or bot exposes e.g. `GET /api/quest-clue-image?url=...&crop=0.2` that fetches the icon, crops, and returns the image. Store that full URL in `requirements.zoomedIconUrl` when generating the quest.

**Option C – Discord + URL params**  
If the icon host supports resize/crop via query params (e.g. `?w=256&h=256&fit=crop&crop=center`), you could build `zoomedIconUrl` without server-side image processing. Less control over “zoom” effect.

**Recommendation:** Option A so you control exactly how zoomed/cropped the clue is. Persist the generated URL so the embed is stable.

---

#### 1.5 Update generateQuestRequirements Function
**File:** `bot/modules/helpWantedModule.js` (around line 1175)

Add case for `'character-guess'` with **two variants** (snippets vs icon-zoom). Randomly choose clue type (e.g. 50/50), then use the right pool and build requirements.

```javascript
case 'character-guess': {
  try {
    // Randomly choose clue type: snippets or icon-zoom (e.g. 50/50)
    const clueType = Math.random() < 0.5 ? 'snippets' : 'icon-zoom';
    
    if (clueType === 'snippets') {
      const pool = pools.characterGuessSnippetPool || [];
      if (!pool.length) throw new Error(`No characters for snippet character-guess in ${village}`);
      
      const selectedCharacter = getRandomElement(pool);
      const snippetCount = Math.floor(Math.random() * 3) + 2; // 2-4
      const snippets = extractSnippetsFromCharacter(selectedCharacter, snippetCount);
      if (snippets.length === 0) throw new Error(`Failed to extract snippets for ${selectedCharacter.name}`);
      
      return {
        characterId: selectedCharacter._id.toString(),
        characterName: selectedCharacter.name,
        clueType: 'snippets',
        snippets,
        snippetCount: snippets.length
      };
    }
    
    // clueType === 'icon-zoom'
    const iconPool = pools.characterGuessIconPool || [];
    if (!iconPool.length) throw new Error(`No characters for icon-zoom character-guess in ${village}`);
    
    const selectedCharacter = getRandomElement(iconPool);
    const zoomedIconUrl = await generateZoomedIconUrl(selectedCharacter.icon, selectedCharacter._id);
    if (!zoomedIconUrl) throw new Error(`Failed to generate zoomed icon for ${selectedCharacter.name}`);
    
    return {
      characterId: selectedCharacter._id.toString(),
      characterName: selectedCharacter.name,
      clueType: 'icon-zoom',
      iconUrl: selectedCharacter.icon,
      zoomedIconUrl
    };
  } catch (error) {
    logger.error('QUEST', `Error generating character-guess quest for ${village}`, error);
    throw new Error(`Failed to generate character-guess quest for ${village}: ${error.message}`);
  }
}
```

#### 1.6 Update Quest Pool Generation
**File:** `bot/modules/helpWantedModule.js`

Find where quest pools are generated (e.g. in `generateQuestForVillage` or similar) and add both character-guess pools (see CharacterModel for `icon`, `personality`, `history`):

```javascript
const characterGuessSnippetPool = await getCharacterGuessSnippetPool();
const characterGuessIconPool = await getCharacterGuessIconPool();
```

Include both in the pools object passed to `generateQuestRequirements`:
```javascript
characterGuessSnippetPool,
characterGuessIconPool
```

---

### Phase 2: Quest Display/Embed Formatting

#### 2.1 Update formatSpecificQuestsAsEmbedsByVillage
**File:** `bot/modules/helpWantedModule.js` (around line 2370)

Add special formatting for character-guess quests based on `requirements.clueType`. For **snippets** show text; for **icon-zoom** show the zoomed image (from `requirements.zoomedIconUrl`, which comes from CharacterModel `icon`).

```javascript
// Special handling for character-guess quests
if (quest.type === 'character-guess' && quest.requirements) {
  const { clueType, snippets, zoomedIconUrl } = quest.requirements;
  
  if (clueType === 'snippets' && snippets?.length) {
    const snippetText = snippets
      .map((snippet, index) => {
        const sourceLabel = snippet.source === 'personality' ? 'Personality' : 'History';
        return `**${sourceLabel} Clue ${index + 1}:**\n${snippet.text}`;
      })
      .join('\n\n');
    
    embed.addFields({
      name: '🎭 Who is this person?',
      value: snippetText,
      inline: false
    });
  } else if (clueType === 'icon-zoom' && zoomedIconUrl) {
    // Show really zoomed-in picture as the main embed image (not thumbnail)
    embed.setImage(zoomedIconUrl);
    embed.addFields({
      name: '🎭 Who is this person?',
      value: '*Guess from the zoomed-in picture above!*',
      inline: false
    });
    // Don’t set village border image when we’re using zoomed icon as main image,
    // or set it after so it doesn’t override (depends on your embed order).
  }
}
```

**Note:** For icon-zoom, the zoomed image should be the primary visual (e.g. `embed.setImage(zoomedIconUrl)`). Avoid overwriting it with the village border image, or set the village image only when `clueType !== 'icon-zoom'`.

**updateQuestEmbed:** When the quest is completed, the same character-guess display logic (snippets vs icon-zoom) should run so the updated embed still shows the clue (snippets or zoomed icon from `quest.requirements`).

#### 2.2 Update getQuestTurnInInstructions
**File:** `bot/modules/helpWantedModule.js`

Find `getQuestTurnInInstructions` function and add:

```javascript
case 'character-guess':
  return 'Use `/helpwanted guess` with the quest ID and your guess for the character name.';
```

#### 2.3 Update NPC Quest Flavor Text
**File:** `bot/modules/NPCsModule.js` (or wherever `getNPCQuestFlavor` is defined)

Add flavor text for character-guess quests. Optionally branch on `requirements.clueType` so icon-zoom has different copy:

```javascript
case 'character-guess': {
  const clueType = requirements?.clueType || 'snippets';
  if (clueType === 'icon-zoom') {
    return `${npcName} found a really zoomed-in picture of someone's portrait but can't tell who it is! Can you figure it out?\n\n*"I only have this tiny piece of the image—who does it belong to?!"*`;
  }
  return `${npcName} has found some mysterious notes about someone, but can't remember who they belong to! Can you help identify this person?\n\n*"I found these notes scattered around, but I can't for the life of me remember who they're about! Help me figure it out!"*`;
}
```

---

### Phase 3: Quest Completion Logic

#### 3.1 Add Guess Subcommand
**File:** `bot/commands/world/helpWanted.js`

Add new subcommand to the SlashCommandBuilder:

```javascript
.addSubcommand(sub =>
  sub.setName('guess')
    .setDescription('Submit your guess for a character guessing quest')
    .addStringOption(opt =>
      opt.setName('id')
        .setDescription('The quest ID')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt.setName('character')
        .setDescription('Your character\'s name (if you have multiple)')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt.setName('guess')
        .setDescription('Your guess for the character name')
        .setRequired(true)
        .setAutocomplete(true) // Optional: autocomplete with character names
    )
)
```

#### 3.2 Add Guess Handler Function
**File:** `bot/commands/world/helpWanted.js`

```javascript
async function handleCharacterGuess(interaction, questId, characterName, guess) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  
  try {
    // Validate quest exists and is correct type
    const quest = await HelpWantedQuest.findOne({ questId });
    if (!quest) {
      return await interaction.editReply({
        content: '❌ Quest not found. Please check the quest ID.'
      });
    }
    
    if (quest.type !== 'character-guess') {
      return await interaction.editReply({
        content: `❌ This quest is not a character guessing quest. It's a ${quest.type} quest.`
      });
    }
    
    if (quest.completed) {
      return await interaction.editReply({
        content: '❌ This quest has already been completed!'
      });
    }
    
    // Validate character and user (reuse existing validation functions)
    const userId = interaction.user.id;
    const user = await User.findOne({ discordId: userId });
    if (!user) {
      return await interaction.editReply({
        content: '❌ User not found. Please try again.'
      });
    }
    
    // Check cooldowns
    const cooldownCheck = await validateUserCooldowns(userId);
    if (!cooldownCheck.canProceed) {
      return await interaction.editReply({
        embeds: [cooldownCheck.embed]
      });
    }
    
    // Get character
    const character = await Character.findOne({ 
      userId: user._id.toString(), 
      name: characterName 
    });
    
    if (!character) {
      return await interaction.editReply({
        content: `❌ Character "${characterName}" not found.`
      });
    }
    
    // Validate character eligibility
    const eligibilityCheck = await validateCharacterEligibility(character, quest);
    if (!eligibilityCheck.canProceed) {
      return await interaction.editReply({
        embeds: eligibilityCheck.embed ? [eligibilityCheck.embed] : undefined,
        content: eligibilityCheck.message
      });
    }
    
    // Validate character location (must be native to quest village)
    const locationCheck = validateCharacterLocation(character, quest);
    if (!locationCheck.canProceed) {
      return await interaction.editReply({
        content: locationCheck.message
      });
    }
    
    // Validate guess (case-insensitive, trim whitespace)
    const correctName = quest.requirements.characterName.trim();
    const userGuess = guess.trim();
    
    // Normalize for comparison (case-insensitive, remove extra spaces)
    const normalizedCorrect = correctName.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizedGuess = userGuess.toLowerCase().replace(/\s+/g, ' ').trim();
    
    if (normalizedGuess !== normalizedCorrect) {
      return await interaction.editReply({
        content: `❌ That's not quite right! The answer was **${correctName}**. Better luck next time!`
      });
    }
    
    // Correct guess! Complete the quest
    quest.completed = true;
    quest.completedBy = {
      userId: userId,
      characterId: character._id.toString(),
      timestamp: new Date().toISOString()
    };
    await quest.save();
    
    // Update user cooldown
    const today = getUTCDateString();
    if (!user.helpWanted) {
      user.helpWanted = {};
    }
    user.helpWanted.lastCompletion = today;
    user.helpWanted.cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    if (!user.helpWanted.completions) {
      user.helpWanted.completions = [];
    }
    user.helpWanted.completions.push({
      date: today,
      village: quest.village,
      questType: quest.type
    });
    await user.save();
    
    // Update character completion tracking
    if (!character.helpWanted) {
      character.helpWanted = {};
    }
    character.helpWanted.lastCompletion = today;
    character.helpWanted.completions = character.helpWanted.completions || [];
    character.helpWanted.completions.push({
      date: today,
      village: quest.village,
      questType: quest.type
    });
    await character.save();
    
    // Update quest embed
    await updateQuestEmbed(interaction.client, quest, quest.completedBy);
    
    // Give rewards (reuse existing reward logic)
    // ... (implement reward distribution similar to other quest types)
    
    const successEmbed = new EmbedBuilder()
      .setTitle('🎭 Correct Guess!')
      .setDescription(`**${character.name}** correctly identified **${correctName}**!`)
      .setColor(0x00FF00)
      .addFields(
        { name: 'Quest Completed', value: `Quest ID: \`${questId}\``, inline: false },
        { name: 'Rewards', value: 'Tokens and experience have been added to your account!', inline: false }
      );
    
    return await interaction.editReply({
      embeds: [successEmbed]
    });
    
  } catch (error) {
    logger.error('QUEST', `Error handling character guess for quest ${questId}`, error);
    return await interaction.editReply({
      content: '❌ An error occurred while processing your guess. Please try again.'
    });
  }
}
```

#### 3.3 Update Command Execute Handler
**File:** `bot/commands/world/helpWanted.js`

In the `execute` function, add:

```javascript
if (sub === 'guess') {
  const questId = interaction.options.getString('id');
  const characterName = interaction.options.getString('character');
  const guess = interaction.options.getString('guess');
  
  await handleCharacterGuess(interaction, questId, characterName, guess);
  return;
}
```

#### 3.4 Add Autocomplete for Character Names (Optional)
**File:** `bot/handlers/autocompleteHandler.js`

Add autocomplete handler for the `guess` field that suggests character names from accepted characters.

---

### Phase 4: Validation & Edge Cases

#### 4.1 Character Name Matching
- Case-insensitive comparison
- Handle extra whitespace
- Consider fuzzy matching for typos? (Probably not for first version - keep strict)

#### 4.2 Snippet Quality
- Ensure snippets are meaningful (minimum length)
- Avoid snippets that reveal the character name directly
- Filter out snippets that are too generic

#### 4.3 Character Pool Filtering
- Only use characters with sufficient personality/history text
- Consider excluding recently used characters (optional enhancement)
- Handle edge case where no characters are available

#### 4.4 Quest Regeneration
- If character-guess quest fails to generate, fall back to another quest type
- Ensure regeneration logic handles this quest type

---

## Testing Checklist

- [ ] Quest generates successfully with valid characters (snippets and icon-zoom)
- [ ] **Snippets variant:** Quest embed displays personality/history snippets correctly
- [ ] **Icon-zoom variant:** Quest embed shows zoomed icon image (from CharacterModel `icon`); no snippet text
- [ ] Zoomed icon image loads (URL is valid and image is actually zoomed/cropped)
- [ ] Correct guess completes quest (both variants)
- [ ] Incorrect guess shows error message
- [ ] Only village natives can complete
- [ ] Cooldown system works correctly
- [ ] Quest embed updates on completion (both variants)
- [ ] Rewards are distributed correctly
- [ ] Handles edge cases (no characters available, insufficient text, icon URL unreachable, etc.)
- [ ] Autocomplete works for quest ID and character name

---

## Future Enhancements (Optional)

1. **Difficulty Levels**: Use different snippet counts based on character popularity
2. **Hint System**: Allow players to request hints (with penalty)
3. **Multiple Rounds**: Show one snippet at a time, players guess after each
4. **Character Exclusion**: Don't use recently guessed characters
5. **Fuzzy Matching**: Allow slight typos in guesses
6. **Leaderboard**: Track who guesses correctly most often
7. **Snippet Filtering**: AI/ML to ensure snippets don't reveal the name
8. **Icon-zoom:** Random crop region (e.g. corner vs center) so it’s not always the same “zoom”; vary zoom level (15% vs 25%) for difficulty

---

## Files to Modify

1. `dashboard/models/HelpWantedQuestModel.js` - Add quest type to enum
2. `bot/models/HelpWantedQuestModel.js` - Add quest type to enum
3. `bot/modules/helpWantedModule.js` - Generation logic, formatting, pools
4. `bot/commands/world/helpWanted.js` - Guess subcommand and handler
5. `bot/handlers/autocompleteHandler.js` - Autocomplete for guess field (optional)
6. `bot/modules/NPCsModule.js` - Quest flavor text (if separate file)

---

## Notes

- **CharacterModel reference:** `bot/models/CharacterModel.js` – `icon` (required String, URL), `personality`, `history`, `status: 'accepted'`. Snippet pool uses personality/history; icon-zoom pool uses any accepted character with valid `icon`.
- Keep snippets anonymous – don’t include character names in snippets.
- **Icon-zoom:** Use a really zoomed-in crop of `character.icon` so the full face/character isn’t obvious; store the generated image URL in `requirements.zoomedIconUrl`.
- Consider minimum text requirements for snippet characters (e.g. 50+ chars each for personality and history).
- Quest is completed by guessing the character name (case-insensitive); first correct guess wins.
- Standard HWQ rules apply (one per user per day, village natives only, etc.).
