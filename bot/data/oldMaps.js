/**
 * Old Maps (Map #1–#46): what the map leads to and coordinates (from ROTW_exploring_2023 - maps.csv).
 * When a player finds an old map (e.g. in ruins), we pick one at random, give "Map #N",
 * and DM expedition members with the map's location.
 * More info: https://www.rootsofthewild.com/oldmaps
 */
const OLD_MAPS = [
  { number: 1, leadsTo: "shrine", coordinates: "G9-Q1" },
  { number: 2, leadsTo: "chest", coordinates: "F7-Q4" },
  { number: 3, leadsTo: "ruins", coordinates: "H10-Q4" },
  { number: 4, leadsTo: "chest", coordinates: "C11-Q4" },
  { number: 5, leadsTo: "relic", coordinates: "G5-Q3" },
  { number: 6, leadsTo: "ruins", coordinates: "F4-Q2" },
  { number: 7, leadsTo: "chest", coordinates: "H9-Q3" },
  { number: 8, leadsTo: "ruins", coordinates: "E5-Q1" },
  { number: 9, leadsTo: "chest", coordinates: "E10-Q1" },
  { number: 10, leadsTo: "shrine", coordinates: "E4-Q3" },
  { number: 11, leadsTo: "ruins", coordinates: "D10-Q2" },
  { number: 12, leadsTo: "chest", coordinates: "D8-Q4" },
  { number: 13, leadsTo: "shrine", coordinates: "I2-Q4" },
  { number: 14, leadsTo: "chest", coordinates: "D2-Q2" },
  { number: 15, leadsTo: "ruins", coordinates: "E9-Q1" },
  { number: 16, leadsTo: "ruins", coordinates: "G3-Q2" },
  { number: 17, leadsTo: "ruins", coordinates: "H6-Q1" },
  { number: 18, leadsTo: "chest", coordinates: "H3-Q3" },
  { number: 19, leadsTo: "chest", coordinates: "E9-Q2" },
  { number: 20, leadsTo: "shrine", coordinates: "E10-Q3" },
  { number: 21, leadsTo: "chest", coordinates: "I4-Q1" },
  { number: 22, leadsTo: "chest", coordinates: "G9-Q4" },
  { number: 23, leadsTo: "ruins", coordinates: "I7-Q2" },
  { number: 24, leadsTo: "shrine", coordinates: "E6-Q4" },
  { number: 25, leadsTo: "chest", coordinates: "H2-Q4" },
  { number: 26, leadsTo: "ruins", coordinates: "I3-Q3" },
  { number: 27, leadsTo: "chest", coordinates: "G7-Q3" },
  { number: 28, leadsTo: "relic", coordinates: "H11-Q1" },
  { number: 29, leadsTo: "chest", coordinates: "I8-Q1" },
  { number: 30, leadsTo: "ruins", coordinates: "I4-Q4" },
  { number: 31, leadsTo: "chest", coordinates: "F10-Q3" },
  { number: 32, leadsTo: "shrine", coordinates: "I11-Q2" },
  { number: 33, leadsTo: "relic", coordinates: "E7-Q1" },
  { number: 34, leadsTo: "chest", coordinates: "F3-Q2" },
  { number: 35, leadsTo: "shrine", coordinates: "B11-Q2" },
  { number: 36, leadsTo: "ruins", coordinates: "G8-Q2" },
  { number: 37, leadsTo: "chest", coordinates: "F8-Q3" },
  { number: 38, leadsTo: "ruins", coordinates: "B8-Q4" },
  { number: 39, leadsTo: "chest", coordinates: "E7-Q4" },
  { number: 40, leadsTo: "ruins", coordinates: "H2-Q3" },
  { number: 41, leadsTo: "chest", coordinates: "G5-Q4" },
  { number: 42, leadsTo: "chest", coordinates: "H9-Q1" },
  { number: 43, leadsTo: "relic", coordinates: "F8-Q4" },
  { number: 44, leadsTo: "ruins", coordinates: "D8-Q1" },
  { number: 45, leadsTo: "shrine", coordinates: "F10-Q3" },
  { number: 46, leadsTo: "chest", coordinates: "D4-Q4" },
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
