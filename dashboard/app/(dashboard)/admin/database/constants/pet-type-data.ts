/**
 * Pet type → roll combination and description.
 * Must stay in sync with bot/modules/petModule.js petTypeData.
 */
export const PET_TYPE_DATA: Record<
  string,
  { rollCombination: string[]; description: string }
> = {
  Chuchu: {
    rollCombination: ["petprey", "petforage", "petchu"],
    description:
      "Special creatures that can access unique resources and use their special abilities.",
  },
  FireChuchu: {
    rollCombination: ["petprey", "petforage", "petchu", "petfirechu"],
    description:
      "Fire elemental chuchu that can access fire-based resources and abilities.",
  },
  IceChuchu: {
    rollCombination: ["petprey", "petforage", "petchu", "peticechu"],
    description:
      "Ice elemental chuchu that can access ice-based resources and abilities.",
  },
  ElectricChuchu: {
    rollCombination: ["petprey", "petforage", "petchu", "petelectricchu"],
    description:
      "Electric elemental chuchu that can access electric-based resources and abilities.",
  },
  Conqueror: {
    rollCombination: ["lgpetprey", "petforage"],
    description:
      "Large foragers with the power to dominate their environment and gather a wide array of resources.",
  },
  Explorer: {
    rollCombination: ["petprey", "petforage", "petmon"],
    description:
      "Versatile animals capable of gathering, hunting, and exploring.",
  },
  Forager: {
    rollCombination: ["petforage"],
    description: "Animals that primarily gather plant-based resources.",
  },
  Guardian: {
    rollCombination: ["lgpetprey", "petmon"],
    description: "Large animals with protective and hunting abilities.",
  },
  Hunter: {
    rollCombination: ["lgpetprey"],
    description:
      "Large predators skilled at preying on substantial targets.",
  },
  Nomad: {
    rollCombination: ["petprey", "lgpetprey", "petforage", "petmon"],
    description:
      "Adaptive animals that roam, forage, and hunt, adjusting to different terrains and diets.",
  },
  Omnivore: {
    rollCombination: ["petmon"],
    description: "Adaptable animals with diverse diets and unique traits.",
  },
  Protector: {
    rollCombination: ["petprey"],
    description: "Small predators adept at hunting and scavenging.",
  },
  Prowler: {
    rollCombination: ["petprey", "lgpetprey"],
    description: "Animals that can both hunt and guard with advanced skills.",
  },
  Ranger: {
    rollCombination: ["petprey", "petforage"],
    description:
      "Agile creatures adept at foraging and hunting in various environments.",
  },
  Roamer: {
    rollCombination: ["petforage", "lgpetprey", "petmon"],
    description:
      "Large omnivores that forage and hunt, capable of gathering unique resources.",
  },
  Scavenger: {
    rollCombination: ["petforage", "petmon"],
    description: "Animals that forage and gather unique resources.",
  },
  Sentinel: {
    rollCombination: ["petprey", "lgpetprey", "petmon"],
    description:
      "Powerful protectors and hunters, capable of defending against significant threats.",
  },
  Tracker: {
    rollCombination: ["petprey", "petmon"],
    description:
      "Predators with heightened tracking and hunting capabilities.",
  },
};
