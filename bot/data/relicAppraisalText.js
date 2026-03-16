// ============================================================================
// Full appraisal text for relics (Description, Functionality, Origins, Uses).
// Source: docs/ROTW_exploring_2023 - relics Info.csv and _tableroll relics ALL.csv
// Used in relic appraisal embeds so finders have the full description for their art.
// ============================================================================

/** Relic outcome name (relicOutcomes.js) -> optional CSV key if different (e.g. "Lense Of Truth" -> "Lens Of Truth") */
const NAME_ALIASES = {};

/**
 * Full appraisal text by relic name (matches RELIC_OUTCOMES name).
 * Discord embed description limit 4096; we truncate with "…" if over 4000.
 */
const RELIC_APPRAISAL_TEXT = {
  'Blessed Hourglass': `**__Blessed Hourglass__**

**Description:** The Blessed Hourglass is a rare and potent artifact, imbued with ancient magic and revered for its ability to manipulate the flow of time in the face of blight. Crafted with exquisite craftsmanship, this hourglass radiates a divine aura, hinting at its sacred purpose.

**Functionality:** When activated, the Blessed Hourglass grants its bearer the remarkable ability to pause the relentless advance of blight for a duration of one week. With a mere turn of the hourglass, time itself seems to stand still within the affected region, providing a temporary respite from the encroaching darkness. This invaluable ability offers a crucial advantage to those combating the blight, allowing them to strategize, regroup, and bolster their defenses before facing the next wave of darkness.

**Origins:** The origins of the Blessed Hourglass are steeped in legend and myth, with tales dating back to the ancient times of Hyrule's history. Some believe it to be a divine gift bestowed by benevolent deities, while others attribute its creation to powerful sorcerers or wise sages who sought to protect the land from the ravages of blight. Regardless of its origins, the Blessed Hourglass remains a symbol of hope and resilience in the face of adversity.

**Uses:** When activated within a village, Blessed Hourglass grants its inhabitants a respite from the need to roll for an entire week during times of blight, offering temporary relief from the affliction's effects.`,

  'Ancient Zonai Bottle': `**__Ancient Zonai Bottle__**

**Description:** The Ancient Zonai Bottle, a relic of the mysterious Zonai civilization, exudes an air of enigma with its intricate design and the verdant hue of its contents—an unidentified green liquid that captivates scholars and adventurers alike.

**Functionality:** Discovered within remote and ancient ruins, these bottles serve as cryptic artifacts left behind by the Zonai people. The green liquid within, its properties shrouded in mystery, ignites speculation ranging from potent elixir to symbolic representation of the Zonai's affinity with nature.

**Origins:** With roots tracing back to the lost civilization of the Zonai, known for their advanced magical knowledge and the enigmatic ruins scattered throughout Hyrule, the Ancient Zonai Bottles stand as echoes of a civilization steeped in legend and mystique. The purpose behind these vessels within Zonai society remains elusive, sparking theories of ceremonial significance or alchemical experimentation.

**Uses:** Scholars speculate that the green liquid within may grant extraordinary abilities, ranging from heightened senses to enhanced agility or even brief bursts of magical abilities, to those who ingest it, yet they strongly advise against any attempts to do so.`,

  'Ancient Zonai Dragon Idol': `**__Ancient Zonai Dragon Idol__**

**Description:** The Ancient Zonai Dragon Idol stands as a majestic relic from the enigmatic Zonai civilization, crafted with exquisite detail and reverence. Carved from jade, this idol depicts a powerful dragon in striking detail, its form radiating an aura of mystery and ancient power.

**Functionality:** Revered as a symbol of strength and protection, the Ancient Zonai Dragon Idol is believed to hold mystical properties tied to the ancient magic of the Zonai people. It is said that those who possess or venerate the idol may receive blessings of resilience and courage, while invoking its name is thought to ward off malevolent forces and bring fortune to those who honor it.

**Origins:** Originating from the lost Zonai civilization, renowned for their deep connection to nature and mastery of arcane arts, the Ancient Zonai Dragon Idol represents the zenith of their craftsmanship and spiritual beliefs. Believed to be guardians of the land, dragons held a special significance in Zonai culture, symbolizing power, wisdom, and the eternal cycle of life.

**Uses:** Scholars and historians study the Ancient Zonai Dragon Idol to unravel the mysteries of the lost Zonai civilization.`,

  'Ancient Zonai Owl Statue': `**__Ancient Zonai Owl Statue__**

**Description:** The Ancient Zonai Owl Statue stands as a testament to the craftsmanship and spiritual reverence of the long-lost Zonai civilization. Carved from stone with meticulous detail, this statue depicts an owl with outstretched wings, its eyes imbued with an aura of wisdom and mystery.

**Functionality:** Revered as a symbol of foresight and guidance, the Ancient Zonai Owl Statue is believed to possess mystical properties tied to the ancient magic of the Zonai people. It is said that those who seek its wisdom may receive visions or insights into the future, while others believe that it serves as a guardian spirit, watching over sacred sites and offering protection to those who honor it.

**Origins:** Originating from the enigmatic Zonai civilization, known for their deep connection to nature and the spiritual realm, the Ancient Zonai Owl Statue holds a sacred place in their culture and beliefs. Owls were revered as messengers of the divine and symbols of intuition and enlightenment, making them a central motif in Zonai art and spirituality.

**Uses:** Tribal elders or wise leaders displayed the Ancient Zonai Owl Statue as a symbol of their wisdom and guidance. Its presence in council chambers or communal gathering spaces reinforced the leader's commitment to upholding the values of insight and intuition embodied by the Zonai civilization.`,

  'Blight Candle': `**__Blight Candle__**

**Description:** The Blight Candle is a unique artifact with the remarkable ability to sense and repel blight. Crafted with ancient techniques and infused with mystical properties, it emits a faint but discernible aura that reacts to the presence of blight. The candle's wax holds a subtle luminescence, flickering with an otherworldly glow when danger approaches.

**Functionality:** When within proximity of blight-infested areas or malevolent entities, the Blight Candle's flame intensifies, warning the bearer of impending danger. Its presence serves as a beacon of protection, warding off blight and providing a sense of security in otherwise perilous environments. It is believed that the candle draws upon ancient blessings or protective enchantments to fulfill its purpose.

**Origin:** The origins of the Blight Candle are shrouded in mystery, with some tales attributing its creation to ancient guardians or prophetic seers who sought to combat the spread of blight. Legends suggest that it was forged during a time of great turmoil, crafted by skilled artisans who imbued it with the essence of purity to counteract the darkness of blight.

**Uses:** The primary use of the Blight Candle lies in its ability to detect and repel blight. Adventurers and guardians utilize the candle as a proactive measure against the spread of darkness, carrying it with them as they traverse blight-infested territories. When the candle's flame intensifies in the presence of blight, it serves as an early warning system, allowing the bearer to take necessary precautions or alter their course to avoid danger. Once the candle burns out it loses its abilities.`,

  'Blighted Dragon Parts': `**__Blighted Dragon Parts__**

**Description:** Blighted Dragon parts, characterized by their ominous, blight-infused hues, are mysterious remnants of an unknown origin within the realm of Hyrule. These artifacts, ranging from scales to talons, emanate an unsettling aura, hinting at their connection to dark forces lurking within the land.

**Functionality:** Despite their unsettling appearance, the functionality of Blighted Dragon parts remains largely unknown. While some speculate that they may possess mystical properties or latent powers, their true purpose eludes even the most seasoned adventurers. Some whisper of a curse attached to these artifacts, warning against their use or possession.

**Origins:** The origins of Blighted Dragon parts are veiled in secrecy, with no definitive source known to scholars or historians. Legends speak of a mythical creature, the Blighted Dragon, rumored to wander the shadowed realms of Hyrule. It is conjectured that these parts may be remnants of this elusive beast, shed as it traverses the dark corners of the land. However, without concrete evidence, their true genesis remains a subject of speculation and myth.

**Uses:** Despite the mystery surrounding their origins, Blighted Dragon parts are often subjects of arcane research and study by scholars and mystics. Their ominous hues and unsettling aura suggest a connection to dark forces within Hyrule, sparking curiosity about their potential properties and significance.`,

  'Lense Of Truth': `**__Lens Of Truth__**

**Description:** The Lens of Truth is a mystical artifact of unparalleled clarity, crafted with precision and imbued with ancient magic. Encased in a delicate frame adorned with intricate patterns, its crystalline lens sparkles with an otherworldly radiance, hinting at the secrets it holds.

**Functionality:** Functioning as a window into the unseen, the Lens of Truth bestows upon its wielder the ability to peer beyond illusions and deceptions. By gazing through its lens, one can unveil hidden passages, reveal concealed traps, and discern truths obscured by the veil of deception. Its powers extend even to the ethereal realm, allowing exploration beyond the boundaries of the tangible world.

**Origins:** The origins of the Lens of Truth are veiled in mystery, with whispers of its creation echoing through the annals of time. Some believe it to be a gift from ancient spirits, bestowed upon mortals to navigate the treacherous paths of the unknown. Others claim it was forged by master craftsmen using rare and mystical materials, harnessing the essence of the arcane to bring it to life.

**Uses:** The Lens of Truth offers a swift solution in navigating a Grottos. By revealing hidden pathways and dispelling illusions, it streamlines the journey, leaving only the final boss battle as the remaining challenge to face.`,

  'Moon Pearl': `**__Moon Pearl__**

**Description:** The Moon Pearl is a radiant orb of celestial essence, shimmering with an ethereal glow reminiscent of the moon's gentle light. Encased in a lustrous shell, it exudes an aura of tranquility and resilience against the encroaching darkness.

**Functionality:** Holding the Moon Pearl grants its bearer immunity against the corrupting influence of the blight. As long as one possesses the pearl, they are shielded from the malevolent forces that seek to consume and corrupt. Its power acts as a ward, repelling the blight's tendrils and safeguarding the bearer from its insidious grasp.

**Origins:** The origins of the Moon Pearl are steeped in celestial mystery, with legends attributing its creation to the luminous energies of the heavens. Some believe it to be a gift from celestial beings, bestowed upon mortals as a beacon of hope in times of darkness. Others speculate that it was forged from the essence of the moon itself, imbued with its divine radiance to serve as a safeguard against the blight's encroachment.

**Uses:** The primary and most significant use of the Moon Pearl is its ability to protect its bearer from the corrupting influence of the blight. Those who possess the pearl are shielded from the malevolent forces that seek to consume and corrupt.`,

  'Old Key': `**__Old Key__**

**Description:** The Old Key, weathered by the passage of time, holds within its rusted grooves the promise of unlocking mysteries long forgotten. Crafted from sturdy metal and adorned with intricate engravings, it bears the weight of ages past and the secrets yet to be revealed.

**Functionality:** As a relic of unlocking, the Old Key possesses the power to open long-sealed doors and hidden chests, granting access to treasures and knowledge concealed from the world. Its touch awakens dormant mechanisms and releases the bonds of time, allowing its bearer to explore realms once thought lost.

**Origins:** The origins of the Old Key are veiled in the mists of antiquity, its true creator lost to the annals of history. Some whisper of skilled craftsmen of ancient civilizations, while others believe it to be the work of mystical artisans imbued with the wisdom of the ages. Regardless of its origin, the key has endured the passage of time as a testament to the ingenuity of its makers.

**Uses:** Currently no known uses, but scholars deemed this item worth keeping and collecting incase of future uses.`,

  "Poe's Lantern": `**__Poe's Lantern__**

**Description:** Poe's Lantern, a mysterious artifact originating from the depths of Hyrule's blight-filled crypts, exudes an otherworldly radiance that defies the darkness surrounding it. Its spectral flame flickers with an eerie glow, casting haunting shadows that dance across the walls of the crypts where it was discovered.

**Functionality:** In the shadowy depths of Hyrule's blight-filled crypts, Poe's Lantern emerges as an indispensable tool for intrepid adventurers. Crafted within the heart of darkness, its ethereal light pierces through the gloom, revealing hidden passages and warding off malevolent spirits that lurk within the ancient ruins. With its ghostly glow guiding their way, explorers unlock the mysteries concealed within Hyrule's shadowy crypts, braving the darkness to uncover long-forgotten secrets and lost treasures.

**Origins:** The origins of Poe's Lantern trace back to the ancient lands of Hyrule, where it was crafted by unknown hands in ages long past. Legends speak of its creation amidst the turmoil of Hyrule's darkest hours, infused with the essence of the blight that pervades the crypts where it was unearthed. Though its creators remain shrouded in mystery, the lantern's presence serves as a reminder of Hyrule's enduring legacy and the secrets that lie buried within its depths.

**Uses:** Armed with the insights gleaned from Poe's Lantern, adventurers have the opportunity to make informed decisions and course corrections within the grottos. By harnessing the lantern's mystical power, travelers can undo decisions they regret or explore new avenues that were previously overlooked.`,

  'Shard of Agony': `**__Shard of Agony__**

**Description:** The Shard of Agony, a curious artifact shrouded in mystery, appears as a translucent crystal fragment pulsating with an ominous energy. Its jagged edges seem to whisper secrets of forgotten realms, while its eerie glow casts an unsettling aura in its vicinity, hinting at the hidden truths it holds within.

**Functionality:** Despite its diminutive size, the Shard of Agony possesses a remarkable ability to detect hidden secrets and concealed passages within its vicinity. When activated, it emits faint vibrations and emits a faint hum, guiding its bearer towards points of interest that elude the naked eye. Whether uncovering hidden chambers in ancient ruins or revealing obscured paths in dense forests, the Shard of Agony serves as a valuable tool for intrepid adventurers seeking to unravel the mysteries of the world.

**Origins:** Legends speak of the Shard of Agony as a fragment of a greater whole, shattered eons ago during a cataclysmic event that reshaped the fabric of reality. Said to be born from the anguish of lost souls and the echoes of forgotten memories, its origins remain steeped in myth and legend. Some believe it to be a remnant of a fallen deity's power, while others attribute its creation to ancient sorcery beyond mortal comprehension. Regardless of its true origins, the Shard of Agony holds a unique significance in the annals of history, its presence serving as a constant reminder of the enigmatic forces that shape the world.

**Uses:** The primary function of the Shard of Agony is to detect hidden secrets and concealed passages within its vicinity. When activated, it emits faint vibrations and emits a soft hum, guiding its bearer towards points of interest that elude normal perception.`,

  'Talisman': `**__Talisman__**

**Description:** The Talisman is a potent artifact associated with an ancient and enigmatic clan that once held ties to the Sheikah. Crafted with dark magic and imbued with sinister intentions, these talismans hold significant power within the realm of Hyrule, serving as symbols of the clan's influence and malevolent ambitions.

**Functionality:** These talismans primarily mark individuals as allies or agents of the ancient and secretive clan, granting them access to hidden sanctuaries, secret passages, and forbidden knowledge. Possession of a Talisman confers certain privileges and protections upon its bearer, including the ability to communicate with fellow members of the clan and to invoke dark powers in service to their cause.

**Origins:** The origins of the Talisman can be traced back to the formation of the ancient clan itself, which once had ties with the Sheikah tribe but diverged in pursuit of darker pursuits and forbidden arts. Crafted by skilled sorcerers and dark adepts, these talismans are infused with the essence of shadow and corruption.

**Uses:** Currently, it seems these talismans no longer hold any active power. They are under study for further information regarding their significance and potential latent abilities.`,

  'The Tainted Idol': `**__The Tainted Idol__**

**Description:** The Tainted Idol, a relic steeped in darkness and despair, emanates an aura of malevolence that chills the very air around it. Carved from obsidian and adorned with sinister glyphs, its surface is marred by cracks that seem to pulse with a sickly energy. Despite its unsettling appearance, there is an undeniable allure to the idol, drawing the curious and the reckless alike into its grasp.

**Functionality:** The Tainted Idol harbors a corrupting influence, twisting the minds of those who come into contact with it and ensnaring their souls in its dark embrace. Once wielded by a mysterious person who could control blight, its power extends beyond the physical realm, manifesting as whispered promises of forbidden knowledge and untold riches. However, those who succumb to its allure often find themselves consumed by madness, their sanity shattered by the insidious whispers that echo from its depths.

**Origins:** Legends tell of a time when the Tainted Idol was crafted by hands tainted by darkness, its creation born from the depths of despair and anguish. Forged in the crucible of despair, it became a vessel for darkest desires and most twisted ambitions.

**Uses:** The primary function of the Tainted Idol is to exert a corrupting influence upon those who come into contact with it. Its malevolent aura twists the minds of the unwary, enticing them with promises of power and wealth while ensnaring their souls in its dark embrace.`,

  'Wooden Totem': `**__Wooden Totem__**

**Description:** The Wooden Totem, a rustic artifact hewn from the ancient trees of the Kokiri Forest, stands as a testament to the enduring bond between the denizens of the forest and the mystical realm they call home. Carved with intricate patterns and adorned with verdant foliage, it emanates a serene aura that echoes the wisdom of the forest itself.

**Functionality:** Crafted with reverence by the skilled hands of Kokiri artisans under the watchful gaze of the wise Deku Tree, the Wooden Totem serves as a conduit to channel the primal energies of the forest. Its purpose extends beyond mere decoration, for it holds within it the essence of the forest's vitality, offering protection and guidance to those who seek solace beneath its boughs.

**Origins:** Fashioned from the sacred wood of the Kokiri Forest, the Wooden Totem embodies the spirit of the forest and the wisdom of its guardian, the Deku Tree. Legend has it that the totem was crafted in ages past as a symbol of unity among the Kokiri, a tangible reminder of their connection to the natural world that sustains them. Infused with the magic of the forest, it has stood the test of time, a silent sentinel watching over the heart of the woodland realm.

**Uses:** As a tangible manifestation of the Kokiri's connection to the natural world, the Wooden Totem facilitates communion with the spirits of the forest. Those who approach it with reverence and humility may find themselves attuned to the whispers of the wind, the rustle of leaves, and the murmurs of the woodland creatures.`,
};

const MAX_DESCRIPTION_LENGTH = 4000;

/**
 * Returns the full appraisal text for a relic (Description, Functionality, Origins, Uses)
 * for use in the appraisal embed. Falls back to null if not in map; caller uses short description.
 * @param {string} relicName - Name from RELIC_OUTCOMES (e.g. "Blessed Hourglass")
 * @returns {string|null}
 */
function getAppraisalText(relicName) {
  if (!relicName || typeof relicName !== 'string') return null;
  const key = NAME_ALIASES[relicName] ?? relicName;
  const text = RELIC_APPRAISAL_TEXT[key];
  if (!text) return null;
  if (text.length <= MAX_DESCRIPTION_LENGTH) return text;
  return text.slice(0, MAX_DESCRIPTION_LENGTH - 1) + '…';
}

module.exports = { getAppraisalText, RELIC_APPRAISAL_TEXT };
