/**
 * Old Maps #1–#46 (same data as bot/data/oldMaps.js). Dashboard deploys without the bot package;
 * keep this file in sync when bot/data/oldMaps.js changes.
 */
export type OldMapEntry = { number: number; leadsTo: string; coordinates: string };

const OLD_MAPS: OldMapEntry[] = [
  { number: 1, leadsTo: "grotto", coordinates: "G9-Q1" },
  { number: 2, leadsTo: "chest", coordinates: "F7-Q4" },
  { number: 3, leadsTo: "ruins", coordinates: "H10-Q4" },
  { number: 4, leadsTo: "chest", coordinates: "C11-Q4" },
  { number: 5, leadsTo: "relic", coordinates: "G5-Q3" },
  { number: 6, leadsTo: "ruins", coordinates: "F4-Q2" },
  { number: 7, leadsTo: "chest", coordinates: "H9-Q3" },
  { number: 8, leadsTo: "ruins", coordinates: "E5-Q1" },
  { number: 9, leadsTo: "chest", coordinates: "E10-Q1" },
  { number: 10, leadsTo: "grotto", coordinates: "E4-Q3" },
  { number: 11, leadsTo: "ruins", coordinates: "D10-Q2" },
  { number: 12, leadsTo: "chest", coordinates: "D8-Q4" },
  { number: 13, leadsTo: "grotto", coordinates: "I2-Q4" },
  { number: 14, leadsTo: "chest", coordinates: "D2-Q2" },
  { number: 15, leadsTo: "ruins", coordinates: "E9-Q1" },
  { number: 16, leadsTo: "ruins", coordinates: "G3-Q2" },
  { number: 17, leadsTo: "ruins", coordinates: "H6-Q1" },
  { number: 18, leadsTo: "chest", coordinates: "H3-Q3" },
  { number: 19, leadsTo: "chest", coordinates: "E9-Q2" },
  { number: 20, leadsTo: "grotto", coordinates: "E10-Q3" },
  { number: 21, leadsTo: "chest", coordinates: "I4-Q1" },
  { number: 22, leadsTo: "chest", coordinates: "G9-Q4" },
  { number: 23, leadsTo: "ruins", coordinates: "I7-Q2" },
  { number: 24, leadsTo: "grotto", coordinates: "E6-Q4" },
  { number: 25, leadsTo: "chest", coordinates: "H2-Q4" },
  { number: 26, leadsTo: "ruins", coordinates: "I3-Q3" },
  { number: 27, leadsTo: "chest", coordinates: "G7-Q3" },
  { number: 28, leadsTo: "relic", coordinates: "H11-Q1" },
  { number: 29, leadsTo: "chest", coordinates: "I8-Q1" },
  { number: 30, leadsTo: "ruins", coordinates: "I4-Q4" },
  { number: 31, leadsTo: "chest", coordinates: "F10-Q3" },
  { number: 32, leadsTo: "grotto", coordinates: "I11-Q2" },
  { number: 33, leadsTo: "relic", coordinates: "E7-Q1" },
  { number: 34, leadsTo: "chest", coordinates: "F3-Q2" },
  { number: 35, leadsTo: "grotto", coordinates: "B11-Q2" },
  { number: 36, leadsTo: "ruins", coordinates: "G8-Q2" },
  { number: 37, leadsTo: "chest", coordinates: "F8-Q3" },
  { number: 38, leadsTo: "ruins", coordinates: "B8-Q4" },
  { number: 39, leadsTo: "chest", coordinates: "E7-Q4" },
  { number: 40, leadsTo: "ruins", coordinates: "H2-Q3" },
  { number: 41, leadsTo: "chest", coordinates: "G5-Q4" },
  { number: 42, leadsTo: "chest", coordinates: "H9-Q1" },
  { number: 43, leadsTo: "relic", coordinates: "F8-Q4" },
  { number: 44, leadsTo: "ruins", coordinates: "D8-Q1" },
  { number: 45, leadsTo: "grotto", coordinates: "F10-Q3" },
  { number: 46, leadsTo: "chest", coordinates: "D4-Q4" },
];

export function getOldMapByNumber(number: number): OldMapEntry | null {
  return OLD_MAPS.find((m) => m.number === number) ?? null;
}
