/**
 * Old Maps (Map #1–#46): flavor text, what the map leads to, and coordinates.
 * When a player finds an old map (e.g. in ruins), we pick one at random, give "Map #N",
 * and DM expedition members with the map's location.
 * More info: https://www.rootsofthewild.com/oldmaps
 */
const OLD_MAPS = [
  { number: 1, leadsTo: "shrine", coordinates: "G8-Q2", flavorText: "Inside of this map describes the location of a mystical grotto known for its ancient blessings." },
  { number: 2, leadsTo: "chest", coordinates: "C2-Q4", flavorText: "Inside of this map describes the location of a hidden chest filled with mysterious artifacts." },
  { number: 3, leadsTo: "ruins", coordinates: "I10-Q3", flavorText: "Inside of this map describes the location of the remnants of old ruins, possibly holding forgotten secrets." },
  { number: 4, leadsTo: "chest", coordinates: "C11-Q4", flavorText: "Inside of this map describes the location of a hidden chest filled with mysterious artifacts." },
  { number: 5, leadsTo: "relic", coordinates: "F6-Q1", flavorText: "Inside of this map describes the location of a rare relic, said to possess magical properties." },
  { number: 6, leadsTo: "ruins", coordinates: "B2-Q2", flavorText: "Inside of this map describes the location of the remnants of old ruins, possibly holding forgotten secrets." },
  { number: 7, leadsTo: "chest", coordinates: "H9-Q3", flavorText: "Inside of this map describes the location of a secluded chest packed with valuable treasures." },
  { number: 8, leadsTo: "ruins", coordinates: "E5-Q1", flavorText: "Inside of this map describes the location of the remnants of old ruins, possibly holding forgotten secrets." },
  { number: 9, leadsTo: "chest", coordinates: "J12-Q2", flavorText: "Inside of this map describes the location of a secluded chest packed with valuable treasures." },
  { number: 10, leadsTo: "shrine", coordinates: "B3-Q3", flavorText: "Inside of this map describes the location of a sacred grotto that grants powerful spiritual enhancements." },
  { number: 11, leadsTo: "ruins", coordinates: "D10-Q4", flavorText: "Inside of this map describes the location of the remnants of old ruins, possibly holding forgotten secrets." },
  { number: 12, leadsTo: "chest", coordinates: "B8-Q4", flavorText: "Inside of this map describes the location of a secluded chest packed with valuable treasures." },
  { number: 13, leadsTo: "shrine", coordinates: "I2-Q4", flavorText: "Inside of this map describes the location of a sacred grotto that grants powerful spiritual enhancements." },
  { number: 14, leadsTo: "chest", coordinates: "D2-Q2", flavorText: "Inside of this map describes the location of a hidden chest filled with mysterious artifacts." },
  { number: 15, leadsTo: "ruins", coordinates: "C4-Q1", flavorText: "Inside of this map describes the location of expansive ruins, promising untold stories and possible dangers." },
  { number: 16, leadsTo: "ruins", coordinates: "G3-Q2", flavorText: "Inside of this map describes the location of expansive ruins, promising untold stories and possible dangers." },
  { number: 17, leadsTo: "ruins", coordinates: "H6-Q1", flavorText: "Inside of this map describes the location of ancient ruins known for their complex labyrinths." },
  { number: 18, leadsTo: "chest", coordinates: "H3-Q3", flavorText: "Inside of this map describes the location of a lost chest buried in a remote location." },
  { number: 19, leadsTo: "chest", coordinates: "E9-Q2", flavorText: "Inside of this map describes the location of a lost chest buried in a remote location." },
  { number: 20, leadsTo: "shrine", coordinates: "C6-Q3", flavorText: "Inside of this map describes the location of a revered grotto that bestows wisdom to its visitors." },
  { number: 21, leadsTo: "chest", coordinates: "J4-Q1", flavorText: "Inside of this map describes the location of a treasure chest, heavily guarded by natural elements." },
  { number: 22, leadsTo: "chest", coordinates: "B6-Q3", flavorText: "Inside of this map describes the location of a treasure chest, heavily guarded by natural elements." },
  { number: 23, leadsTo: "ruins", coordinates: "A2-Q2", flavorText: "Inside of this map describes the location of the ruins of a once-powerful civilization." },
  { number: 24, leadsTo: "shrine", coordinates: "F2-Q4", flavorText: "Inside of this map describes the location of a revered grotto that bestows wisdom to its visitors." },
  { number: 25, leadsTo: "chest", coordinates: "H2-Q2", flavorText: "Inside of this map describes the location of a hidden chest known for its enchanted contents." },
  { number: 26, leadsTo: "ruins", coordinates: "G9-Q3", flavorText: "Inside of this map describes the location of the ruins of a once-powerful civilization." },
  { number: 27, leadsTo: "chest", coordinates: "F7-Q3", flavorText: "Inside of this map describes the location of a hidden chest known for its enchanted contents." },
  { number: 28, leadsTo: "relic", coordinates: "H11-Q2", flavorText: "Inside of this map describes the location of an ancient relic, famed for its curse-breaking capabilities." },
  { number: 29, leadsTo: "chest", coordinates: "J7-Q1", flavorText: "Inside of this map describes the location of a secretive chest concealed within a rugged landscape." },
  { number: 30, leadsTo: "ruins", coordinates: "I4-Q4", flavorText: "Inside of this map describes the location of the ruins where history whispers through the stones." },
  { number: 31, leadsTo: "chest", coordinates: "F10-Q4", flavorText: "Inside of this map describes the location of a secretive chest concealed within a rugged landscape." },
  { number: 32, leadsTo: "shrine", coordinates: "I11-Q2", flavorText: "Inside of this map describes the location of a grotto known for its healing energies and sacred aura." },
  { number: 33, leadsTo: "relic", coordinates: "E7-Q1", flavorText: "Inside of this map describes the location of a rare relic, said to possess magical properties." },
  { number: 34, leadsTo: "chest", coordinates: "F3-Q2", flavorText: "Inside of this map describes the location of a secretive chest concealed within a rugged landscape." },
  { number: 35, leadsTo: "shrine", coordinates: "B11-Q1", flavorText: "Inside of this map describes the location of a grotto known for its healing energies and sacred aura." },
  { number: 36, leadsTo: "ruins", coordinates: "C5-Q2", flavorText: "Inside of this map describes the location of long-forgotten ruins, filled with relics of the past." },
  { number: 37, leadsTo: "chest", coordinates: "F8-Q3", flavorText: "Inside of this map describes the location of a chest rumored to contain the wealth of ancient royalties." },
  { number: 38, leadsTo: "ruins", coordinates: "B8-Q1", flavorText: "Inside of this map describes the location of long-forgotten ruins, filled with relics of the past." },
  { number: 39, leadsTo: "chest", coordinates: "E7-Q4", flavorText: "Inside of this map describes the location of a chest rumored to contain the wealth of ancient royalties." },
  { number: 40, leadsTo: "ruins", coordinates: "G2-Q3", flavorText: "Inside of this map describes the location of the ruins of a great battle, with artifacts left untouched." },
  { number: 41, leadsTo: "chest", coordinates: "G5-Q4", flavorText: "Inside of this map describes the location of the hiding place of a treasure chest in an ancient setting." },
  { number: 42, leadsTo: "chest", coordinates: "H9-Q1", flavorText: "Inside of this map describes the location of the hiding place of a treasure chest in an ancient setting." },
  { number: 43, leadsTo: "relic", coordinates: "C10-Q3", flavorText: "Inside of this map describes the location of a mysterious relic that holds the key to untold power." },
  { number: 44, leadsTo: "ruins", coordinates: "D8-Q1", flavorText: "Inside of this map describes the location of the ruins said to be haunted by spirits of the past." },
  { number: 45, leadsTo: "shrine", coordinates: "F10-Q3", flavorText: "Inside of this map describes the location of a sacred grotto where wishes are said to come true." },
  { number: 46, leadsTo: "chest", coordinates: "D4-Q2", flavorText: "Inside of this map describes the location of a treasure chest, hidden from the eyes of the ordinary." },
];

const OLD_MAPS_LINK = "https://www.rootsofthewild.com/oldmaps";
/** TotK-style old map icon for embeds (Zelda Wiki). */
const OLD_MAP_ICON_URL = "https://cdn.wikimg.net/en/zeldawiki/images/8/85/TotK_Old_Map_Icon.png";
/** Border image for map embeds (matches other bot embeds). */
const MAP_EMBED_BORDER_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";

function getRandomOldMap() {
  return OLD_MAPS[Math.floor(Math.random() * OLD_MAPS.length)];
}

function getOldMapByNumber(number) {
  return OLD_MAPS.find((m) => m.number === number) || null;
}

module.exports = {
  OLD_MAPS,
  OLD_MAPS_LINK,
  OLD_MAP_ICON_URL,
  MAP_EMBED_BORDER_URL,
  getRandomOldMap,
  getOldMapByNumber,
};
