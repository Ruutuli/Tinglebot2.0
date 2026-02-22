"use client";

import { useCallback, useEffect, useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import { syncAllFields, type ItemFormData as SyncItemFormData } from "@/lib/item-field-sync";
import { ArrayFieldInput } from "./components/ArrayFieldInput";
import { BooleanField } from "./components/BooleanField";
import { NumberField } from "./components/NumberField";
import { TextField } from "./components/TextField";
import { ToggleButton } from "./components/ToggleButton";
import { ToggleGrid } from "./components/ToggleGrid";
import { SelectField } from "./components/SelectField";
import { MultiSelectField } from "./components/MultiSelectField";
import { CraftingMaterialsField } from "./components/CraftingMaterialsField";
import { getItemId } from "./utils/id";

type Item = {
  _id: string;
  itemName: string;
  image?: string;
  imageType?: string;
  emoji?: string;
  itemRarity?: number;
  category?: string[];
  categoryGear?: string;
  type?: string[];
  subtype?: string[];
  recipeTag?: string[];
  element?: string;
  buyPrice?: number;
  sellPrice?: number;
  modifierHearts?: number;
  staminaRecovered?: number;
  stackable?: boolean;
  maxStackSize?: number;
  craftingMaterial?: Array<{ _id: string; itemName: string; quantity: number }>;
  staminaToCraft?: number | null;
  crafting?: boolean;
  craftingJobs?: string[];
  gathering?: boolean;
  looting?: boolean;
  vending?: boolean;
  traveling?: boolean;
  exploring?: boolean;
  obtain?: string[];
  gatheringJobs?: string[];
  lootingJobs?: string[];
  specialWeather?: {
    muggy?: boolean;
    flowerbloom?: boolean;
    fairycircle?: boolean;
    jubilee?: boolean;
    meteorShower?: boolean;
    rockslide?: boolean;
    avalanche?: boolean;
  };
  petPerk?: boolean;
  petperkobtain?: string[];
  petprey?: boolean;
  petforage?: boolean;
  lgpetprey?: boolean;
  petmon?: boolean;
  petchu?: boolean;
  petfirechu?: boolean;
  peticechu?: boolean;
  petelectricchu?: boolean;
  locations?: string[];
  centralHyrule?: boolean;
  eldin?: boolean;
  faron?: boolean;
  gerudo?: boolean;
  hebra?: boolean;
  lanayru?: boolean;
  pathOfScarletLeaves?: boolean;
  leafDewWay?: boolean;
  adventurer?: boolean;
  artist?: boolean;
  beekeeper?: boolean;
  blacksmith?: boolean;
  cook?: boolean;
  craftsman?: boolean;
  farmer?: boolean;
  fisherman?: boolean;
  forager?: boolean;
  gravekeeper?: boolean;
  guard?: boolean;
  maskMaker?: boolean;
  rancher?: boolean;
  herbalist?: boolean;
  hunter?: boolean;
  hunterLooting?: boolean;
  mercenary?: boolean;
  miner?: boolean;
  researcher?: boolean;
  scout?: boolean;
  weaver?: boolean;
  witch?: boolean;
  allJobs?: string[];
  entertainerItems?: boolean;
  divineItems?: boolean;
  monsterList?: string[];
  blackBokoblin?: boolean;
  blueBokoblin?: boolean;
  cursedBokoblin?: boolean;
  goldenBokoblin?: boolean;
  silverBokoblin?: boolean;
  bokoblin?: boolean;
  electricChuchuLarge?: boolean;
  fireChuchuLarge?: boolean;
  iceChuchuLarge?: boolean;
  chuchuLarge?: boolean;
  electricChuchuMedium?: boolean;
  fireChuchuMedium?: boolean;
  iceChuchuMedium?: boolean;
  chuchuMedium?: boolean;
  electricChuchuSmall?: boolean;
  fireChuchuSmall?: boolean;
  iceChuchuSmall?: boolean;
  chuchuSmall?: boolean;
  blackHinox?: boolean;
  blueHinox?: boolean;
  hinox?: boolean;
  electricKeese?: boolean;
  fireKeese?: boolean;
  iceKeese?: boolean;
  keese?: boolean;
  blackLizalfos?: boolean;
  blueLizalfos?: boolean;
  cursedLizalfos?: boolean;
  electricLizalfos?: boolean;
  fireBreathLizalfos?: boolean;
  goldenLizalfos?: boolean;
  iceBreathLizalfos?: boolean;
  silverLizalfos?: boolean;
  lizalfos?: boolean;
  blueManedLynel?: boolean;
  goldenLynel?: boolean;
  silverLynel?: boolean;
  whiteManedLynel?: boolean;
  lynel?: boolean;
  blackMoblin?: boolean;
  blueMoblin?: boolean;
  cursedMoblin?: boolean;
  goldenMoblin?: boolean;
  silverMoblin?: boolean;
  moblin?: boolean;
  molduga?: boolean;
  molduking?: boolean;
  forestOctorok?: boolean;
  rockOctorok?: boolean;
  skyOctorok?: boolean;
  snowOctorok?: boolean;
  treasureOctorok?: boolean;
  waterOctorok?: boolean;
  frostPebblit?: boolean;
  igneoPebblit?: boolean;
  stonePebblit?: boolean;
  stalizalfos?: boolean;
  stalkoblin?: boolean;
  stalmoblin?: boolean;
  stalnox?: boolean;
  frostTalus?: boolean;
  igneoTalus?: boolean;
  luminousTalus?: boolean;
  rareTalus?: boolean;
  stoneTalus?: boolean;
  blizzardWizzrobe?: boolean;
  electricWizzrobe?: boolean;
  fireWizzrobe?: boolean;
  iceWizzrobe?: boolean;
  meteoWizzrobe?: boolean;
  thunderWizzrobe?: boolean;
  likeLike?: boolean;
  evermean?: boolean;
  gibdo?: boolean;
  horriblin?: boolean;
  gloomHands?: boolean;
  bossBokoblin?: boolean;
  mothGibdo?: boolean;
  littleFrox?: boolean;
  yigaBlademaster?: boolean;
  yigaFootsoldier?: boolean;
  normalBokoblin?: boolean;
  normalGibdo?: boolean;
  normalHinox?: boolean;
  normalHorriblin?: boolean;
  normalKeese?: boolean;
  normalLizalfos?: boolean;
  normalLynel?: boolean;
  normalMoblin?: boolean;
  [key: string]: unknown;
};

type ItemFormData = Partial<Item>;

type ItemChanges = {
  [key: string]: { original: unknown; current: unknown };
};

type ItemEditorFormProps = {
  item: Item;
  items?: Array<{ _id: string; itemName: string }>;
  fieldOptions?: {
    category: string[];
    type: string[];
    categoryGear: string[];
    subtype: string[];
    element: string[];
  };
  onSave: (itemId: string, updates: Partial<ItemFormData>) => Promise<void>;
  saving: boolean;
  onClose: () => void;
};

type TabValue = "basics" | "classification" | "crafting" | "activities" | "weather" | "pet" | "locations" | "jobs" | "monsters";

const TABS: Array<{ value: TabValue; label: string; icon: string }> = [
  { value: "basics", label: "Basics", icon: "fa-tag" },
  { value: "classification", label: "Classification", icon: "fa-layer-group" },
  { value: "crafting", label: "Crafting", icon: "fa-hammer" },
  { value: "activities", label: "Activities", icon: "fa-compass" },
  { value: "weather", label: "Weather", icon: "fa-cloud-sun" },
  { value: "pet", label: "Pet Perks", icon: "fa-paw" },
  { value: "locations", label: "Locations", icon: "fa-map" },
  { value: "jobs", label: "Jobs", icon: "fa-briefcase" },
  { value: "monsters", label: "Monsters", icon: "fa-dragon" },
];

export function ItemEditorForm({ item, items = [], fieldOptions = { category: [], type: [], categoryGear: [], subtype: [], element: ["none", "fire", "ice", "electric", "tech"] }, onSave, saving, onClose }: ItemEditorFormProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("basics");
  const [formData, setFormData] = useState<ItemFormData>(() => ({
    itemName: item.itemName || "",
    image: item.image || "",
    imageType: item.imageType || "",
    emoji: item.emoji || "",
    itemRarity: item.itemRarity ?? 1,
    category: item.category || [],
    categoryGear: item.categoryGear || "",
    type: item.type || [],
    subtype: item.subtype || [],
    recipeTag: item.recipeTag || [],
    element: item.element || "none",
    buyPrice: item.buyPrice ?? 0,
    sellPrice: item.sellPrice ?? 0,
    modifierHearts: item.modifierHearts ?? 0,
    staminaRecovered: item.staminaRecovered ?? 0,
    stackable: item.stackable ?? false,
    maxStackSize: item.maxStackSize ?? 10,
    craftingMaterial: item.craftingMaterial || [],
    staminaToCraft: item.staminaToCraft ?? null,
    crafting: item.crafting ?? false,
    craftingJobs: item.craftingJobs || [],
    gathering: item.gathering ?? false,
    looting: item.looting ?? false,
    vending: item.vending ?? false,
    traveling: item.traveling ?? false,
    exploring: item.exploring ?? false,
    obtain: item.obtain || [],
    gatheringJobs: item.gatheringJobs || [],
    lootingJobs: item.lootingJobs || [],
    specialWeather: item.specialWeather || {
      muggy: false,
      flowerbloom: false,
      fairycircle: false,
      jubilee: false,
      meteorShower: false,
      rockslide: false,
      avalanche: false,
    },
    petPerk: item.petPerk ?? false,
    petperkobtain: item.petperkobtain || [],
    petprey: item.petprey ?? false,
    petforage: item.petforage ?? false,
    lgpetprey: item.lgpetprey ?? false,
    petmon: item.petmon ?? false,
    petchu: item.petchu ?? false,
    petfirechu: item.petfirechu ?? false,
    peticechu: item.peticechu ?? false,
    petelectricchu: item.petelectricchu ?? false,
    locations: item.locations || [],
    centralHyrule: item.centralHyrule ?? false,
    eldin: item.eldin ?? false,
    faron: item.faron ?? false,
    gerudo: item.gerudo ?? false,
    hebra: item.hebra ?? false,
    lanayru: item.lanayru ?? false,
    pathOfScarletLeaves: item.pathOfScarletLeaves ?? false,
    leafDewWay: item.leafDewWay ?? false,
    adventurer: item.adventurer ?? false,
    artist: item.artist ?? false,
    beekeeper: item.beekeeper ?? false,
    blacksmith: item.blacksmith ?? false,
    cook: item.cook ?? false,
    craftsman: item.craftsman ?? false,
    farmer: item.farmer ?? false,
    fisherman: item.fisherman ?? false,
    forager: item.forager ?? false,
    gravekeeper: item.gravekeeper ?? false,
    guard: item.guard ?? false,
    maskMaker: item.maskMaker ?? false,
    rancher: item.rancher ?? false,
    herbalist: item.herbalist ?? false,
    hunter: item.hunter ?? false,
    hunterLooting: item.hunterLooting ?? false,
    mercenary: item.mercenary ?? false,
    miner: item.miner ?? false,
    researcher: item.researcher ?? false,
    scout: item.scout ?? false,
    weaver: item.weaver ?? false,
    witch: item.witch ?? false,
    allJobs: item.allJobs || [],
    entertainerItems: item.entertainerItems ?? false,
    divineItems: item.divineItems ?? false,
    monsterList: item.monsterList || [],
    blackBokoblin: item.blackBokoblin ?? false,
    blueBokoblin: item.blueBokoblin ?? false,
    cursedBokoblin: item.cursedBokoblin ?? false,
    goldenBokoblin: item.goldenBokoblin ?? false,
    silverBokoblin: item.silverBokoblin ?? false,
    bokoblin: item.bokoblin ?? false,
    electricChuchuLarge: item.electricChuchuLarge ?? false,
    fireChuchuLarge: item.fireChuchuLarge ?? false,
    iceChuchuLarge: item.iceChuchuLarge ?? false,
    chuchuLarge: item.chuchuLarge ?? false,
    electricChuchuMedium: item.electricChuchuMedium ?? false,
    fireChuchuMedium: item.fireChuchuMedium ?? false,
    iceChuchuMedium: item.iceChuchuMedium ?? false,
    chuchuMedium: item.chuchuMedium ?? false,
    electricChuchuSmall: item.electricChuchuSmall ?? false,
    fireChuchuSmall: item.fireChuchuSmall ?? false,
    iceChuchuSmall: item.iceChuchuSmall ?? false,
    chuchuSmall: item.chuchuSmall ?? false,
    blackHinox: item.blackHinox ?? false,
    blueHinox: item.blueHinox ?? false,
    hinox: item.hinox ?? false,
    electricKeese: item.electricKeese ?? false,
    fireKeese: item.fireKeese ?? false,
    iceKeese: item.iceKeese ?? false,
    keese: item.keese ?? false,
    blackLizalfos: item.blackLizalfos ?? false,
    blueLizalfos: item.blueLizalfos ?? false,
    cursedLizalfos: item.cursedLizalfos ?? false,
    electricLizalfos: item.electricLizalfos ?? false,
    fireBreathLizalfos: item.fireBreathLizalfos ?? false,
    goldenLizalfos: item.goldenLizalfos ?? false,
    iceBreathLizalfos: item.iceBreathLizalfos ?? false,
    silverLizalfos: item.silverLizalfos ?? false,
    lizalfos: item.lizalfos ?? false,
    blueManedLynel: item.blueManedLynel ?? false,
    goldenLynel: item.goldenLynel ?? false,
    silverLynel: item.silverLynel ?? false,
    whiteManedLynel: item.whiteManedLynel ?? false,
    lynel: item.lynel ?? false,
    blackMoblin: item.blackMoblin ?? false,
    blueMoblin: item.blueMoblin ?? false,
    cursedMoblin: item.cursedMoblin ?? false,
    goldenMoblin: item.goldenMoblin ?? false,
    silverMoblin: item.silverMoblin ?? false,
    moblin: item.moblin ?? false,
    molduga: item.molduga ?? false,
    molduking: item.molduking ?? false,
    forestOctorok: item.forestOctorok ?? false,
    rockOctorok: item.rockOctorok ?? false,
    skyOctorok: item.skyOctorok ?? false,
    snowOctorok: item.snowOctorok ?? false,
    treasureOctorok: item.treasureOctorok ?? false,
    waterOctorok: item.waterOctorok ?? false,
    frostPebblit: item.frostPebblit ?? false,
    igneoPebblit: item.igneoPebblit ?? false,
    stonePebblit: item.stonePebblit ?? false,
    stalizalfos: item.stalizalfos ?? false,
    stalkoblin: item.stalkoblin ?? false,
    stalmoblin: item.stalmoblin ?? false,
    stalnox: item.stalnox ?? false,
    frostTalus: item.frostTalus ?? false,
    igneoTalus: item.igneoTalus ?? false,
    luminousTalus: item.luminousTalus ?? false,
    rareTalus: item.rareTalus ?? false,
    stoneTalus: item.stoneTalus ?? false,
    blizzardWizzrobe: item.blizzardWizzrobe ?? false,
    electricWizzrobe: item.electricWizzrobe ?? false,
    fireWizzrobe: item.fireWizzrobe ?? false,
    iceWizzrobe: item.iceWizzrobe ?? false,
    meteoWizzrobe: item.meteoWizzrobe ?? false,
    thunderWizzrobe: item.thunderWizzrobe ?? false,
    likeLike: item.likeLike ?? false,
    evermean: item.evermean ?? false,
    gibdo: item.gibdo ?? false,
    horriblin: item.horriblin ?? false,
    gloomHands: item.gloomHands ?? false,
    bossBokoblin: item.bossBokoblin ?? false,
    mothGibdo: item.mothGibdo ?? false,
    littleFrox: item.littleFrox ?? false,
    yigaBlademaster: item.yigaBlademaster ?? false,
    yigaFootsoldier: item.yigaFootsoldier ?? false,
    normalBokoblin: item.normalBokoblin ?? false,
    normalGibdo: item.normalGibdo ?? false,
    normalHinox: item.normalHinox ?? false,
    normalHorriblin: item.normalHorriblin ?? false,
    normalKeese: item.normalKeese ?? false,
    normalLizalfos: item.normalLizalfos ?? false,
    normalLynel: item.normalLynel ?? false,
    normalMoblin: item.normalMoblin ?? false,
  }));

  const [originalData] = useState<ItemFormData>({ ...formData });
  const [changes, setChanges] = useState<ItemChanges>({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Track Changes
  useEffect(() => {
    const newChanges: ItemChanges = {};
    (Object.keys(formData) as Array<keyof ItemFormData>).forEach((key) => {
      const formValue = formData[key];
      const origValue = originalData[key];
      
      if (JSON.stringify(formValue) !== JSON.stringify(origValue)) {
        newChanges[key] = {
          original: origValue,
          current: formValue,
        };
      }
    });
    setChanges(newChanges);
  }, [formData, originalData]);

  // Validation
  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.itemName?.trim()) {
      errors.itemName = "Item name is required";
    }

    if (formData.itemRarity !== undefined && (formData.itemRarity < 1 || formData.itemRarity > 5)) {
      errors.itemRarity = "Rarity must be between 1 and 5";
    }

    if (formData.buyPrice !== undefined && formData.buyPrice < 0) {
      errors.buyPrice = "Buy price cannot be negative";
    }

    if (formData.sellPrice !== undefined && formData.sellPrice < 0) {
      errors.sellPrice = "Sell price cannot be negative";
    }

    if (formData.maxStackSize !== undefined && formData.maxStackSize < 1) {
      errors.maxStackSize = "Max stack size must be at least 1";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // Handle Save
  const handleSaveClick = useCallback(() => {
    if (Object.keys(changes).length === 0) {
      return;
    }

    if (!validate()) {
      return;
    }

    setShowConfirmModal(true);
  }, [changes, validate]);

  // Confirm Save
  const handleConfirmSave = useCallback(async () => {
    setShowConfirmModal(false);
    const updates: Partial<ItemFormData> = {};
    Object.keys(changes).forEach((key) => {
      updates[key as keyof ItemFormData] = formData[key as keyof ItemFormData];
    });
    await onSave(getItemId(item._id), updates);
  }, [changes, formData, item._id, onSave]);

  // Reset Changes
  const handleReset = useCallback(() => {
    setFormData({ ...originalData });
    setValidationErrors({});
  }, [originalData]);

  // Field Change Handlers
  const handleFieldChange = useCallback((field: keyof ItemFormData, value: unknown) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      
      const fieldName = typeof field === 'string' ? field : String(field);
      const syncResult = syncAllFields(updated as SyncItemFormData, fieldName, value);
      
      if (syncResult.updated) {
        const synced = { ...updated };
        Object.entries(syncResult.changes).forEach(([key, change]) => {
          synced[key as keyof ItemFormData] = change.to as never;
        });
        return synced;
      }
      
      return updated;
    });
    
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [validationErrors]);

  const hasChanges = Object.keys(changes).length > 0;
  const hasErrors = Object.keys(validationErrors).length > 0;

  const getFieldDisplayName = (field: string): string => {
    const fieldMap: Record<string, string> = {
      itemName: "Item Name",
      image: "Image URL",
      imageType: "Image Type",
      emoji: "Emoji",
      itemRarity: "Rarity Level",
      category: "Category",
      categoryGear: "Category Gear",
      type: "Type",
      subtype: "Subtype",
      recipeTag: "Recipe Tag",
      element: "Element",
      buyPrice: "Buy Price",
      sellPrice: "Sell Price",
      modifierHearts: "Hearts Restored",
      staminaRecovered: "Stamina Restored",
      stackable: "Can Stack",
      maxStackSize: "Max Stack Size",
      craftingMaterial: "Crafting Materials",
      staminaToCraft: "Stamina to Craft",
      crafting: "Craftable",
      craftingJobs: "Crafting Jobs",
      gathering: "Gathering",
      looting: "Looting",
      vending: "Vending",
      traveling: "Traveling",
      exploring: "Exploring",
      obtain: "Obtain Methods",
      gatheringJobs: "Gathering Jobs",
      lootingJobs: "Looting Jobs",
      specialWeather: "Special Weather",
      petPerk: "Pet Perk",
      petperkobtain: "Pet Perk Obtain",
      petprey: "Pet Prey",
      petforage: "Pet Forage",
      lgpetprey: "Large Pet Prey",
      petmon: "Pet Monster",
      petchu: "Pet Chuchu",
      petfirechu: "Pet Fire Chuchu",
      peticechu: "Pet Ice Chuchu",
      petelectricchu: "Pet Electric Chuchu",
      locations: "Locations",
      centralHyrule: "Central Hyrule",
      eldin: "Eldin",
      faron: "Faron",
      gerudo: "Gerudo",
      hebra: "Hebra",
      lanayru: "Lanayru",
      pathOfScarletLeaves: "Path of Scarlet Leaves",
      leafDewWay: "Leaf Dew Way",
      allJobs: "All Jobs",
      entertainerItems: "Entertainer Items",
      divineItems: "Divine Items",
      monsterList: "Monster List",
    };
    return fieldMap[field] || field;
  };

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case "basics":
        return (
          <div className="space-y-6">
            {/* Identity & Display */}
            <div>
              <h4 className="text-base font-semibold text-[var(--totk-light-ocher)] mb-4 pb-2 border-b border-[var(--totk-dark-ocher)]">
                Identity & Display
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextField
                  label="Item Name *"
                  value={formData.itemName || ""}
                  onChange={(v) => handleFieldChange("itemName", v)}
                  helpText="The name players see in-game"
                  isChanged={!!changes.itemName}
                  error={validationErrors.itemName}
                  required
                />
                <TextField
                  label="Image URL"
                  value={formData.image || ""}
                  onChange={(v) => handleFieldChange("image", v)}
                  helpText="URL or path to the item image"
                  isChanged={!!changes.image}
                />
                <TextField
                  label="Image Type"
                  value={formData.imageType || ""}
                  onChange={(v) => handleFieldChange("imageType", v)}
                  helpText="Type of image (e.g., PNG, JPG)"
                  isChanged={!!changes.imageType}
                />
                <TextField
                  label="Emoji"
                  value={formData.emoji || ""}
                  onChange={(v) => handleFieldChange("emoji", v)}
                  helpText="Emoji for Discord display (optional - Discord only)"
                  isChanged={!!changes.emoji}
                  placeholder="e.g., 🍎"
                />
              </div>
            </div>

            {/* Pricing */}
            <div>
              <h4 className="text-base font-semibold text-[var(--totk-light-ocher)] mb-4 pb-2 border-b border-[var(--totk-dark-ocher)]">
                Pricing
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NumberField
                  label="Buy Price"
                  value={formData.buyPrice ?? 0}
                  onChange={(v) => handleFieldChange("buyPrice", v)}
                  helpText="How much shops charge to buy this item (in tokens)"
                  isChanged={!!changes.buyPrice}
                  error={validationErrors.buyPrice}
                  min={0}
                />
                <NumberField
                  label="Sell Price"
                  value={formData.sellPrice ?? 0}
                  onChange={(v) => handleFieldChange("sellPrice", v)}
                  helpText="How much players get when selling this item (in tokens)"
                  isChanged={!!changes.sellPrice}
                  error={validationErrors.sellPrice}
                  min={0}
                />
              </div>
            </div>

            {/* Effects */}
            <div>
              <h4 className="text-base font-semibold text-[var(--totk-light-ocher)] mb-4 pb-2 border-b border-[var(--totk-dark-ocher)]">
                Effects
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NumberField
                  label={formData.categoryGear === "Armor" || formData.categoryGear === "Weapon" ? "Modifier" : "Hearts Restored"}
                  value={formData.modifierHearts ?? 0}
                  onChange={(v) => handleFieldChange("modifierHearts", v)}
                  helpText={formData.categoryGear === "Armor" || formData.categoryGear === "Weapon" 
                    ? "Modifier value for this armor/weapon" 
                    : "Health restored when this item is used"}
                  isChanged={!!changes.modifierHearts}
                />
                <NumberField
                  label="Stamina Restored"
                  value={formData.staminaRecovered ?? 0}
                  onChange={(v) => handleFieldChange("staminaRecovered", v)}
                  helpText="Stamina restored when this item is used"
                  isChanged={!!changes.staminaRecovered}
                />
              </div>
            </div>

            {/* Stack Rules */}
            <div>
              <h4 className="text-base font-semibold text-[var(--totk-light-ocher)] mb-4 pb-2 border-b border-[var(--totk-dark-ocher)]">
                Stack Rules
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BooleanField
                  label="Can Stack?"
                  value={formData.stackable ?? false}
                  onChange={(v) => handleFieldChange("stackable", v)}
                  helpText="Can players hold multiple in one inventory slot?"
                  isChanged={!!changes.stackable}
                />
                <NumberField
                  label="Max Stack Size"
                  value={formData.maxStackSize ?? 10}
                  onChange={(v) => handleFieldChange("maxStackSize", v)}
                  helpText="Maximum items per stack (if stackable)"
                  isChanged={!!changes.maxStackSize}
                  error={validationErrors.maxStackSize}
                  min={1}
                  disabled={!formData.stackable}
                />
              </div>
            </div>
          </div>
        );

      case "classification":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberField
              label="Rarity Level"
              value={formData.itemRarity ?? 1}
              onChange={(v) => handleFieldChange("itemRarity", v)}
              helpText="Rarity from 1 (common) to 5 (rarest)"
              isChanged={!!changes.itemRarity}
              error={validationErrors.itemRarity}
              min={1}
              max={5}
            />
            <MultiSelectField
              label="Category"
              value={formData.category || []}
              options={fieldOptions.category}
              onChange={(v) => handleFieldChange("category", v)}
              helpText="Categories this item belongs to"
              isChanged={!!changes.category}
            />
            <SelectField
              label="Category Gear"
              value={formData.categoryGear || ""}
              options={fieldOptions.categoryGear}
              onChange={(v) => handleFieldChange("categoryGear", v)}
              helpText="Gear category (e.g., Armor, Weapon)"
              isChanged={!!changes.categoryGear}
            />
            <MultiSelectField
              label="Type"
              value={formData.type || []}
              options={fieldOptions.type}
              onChange={(v) => handleFieldChange("type", v)}
              helpText="Item types (e.g., Material, Food)"
              isChanged={!!changes.type}
            />
            <MultiSelectField
              label="Subtype"
              value={formData.subtype || []}
              options={fieldOptions.subtype}
              onChange={(v) => handleFieldChange("subtype", v)}
              helpText="Item subtypes (e.g., Head, Bow)"
              isChanged={!!changes.subtype}
            />
            <SelectField
              label="Element"
              value={formData.element || "none"}
              options={fieldOptions.element}
              onChange={(v) => handleFieldChange("element", v)}
              helpText="Elemental type for weapons/armor (fire, ice, electric, tech, none)"
              isChanged={!!changes.element}
            />
            <ArrayFieldInput
              label="Recipe Tag"
              value={formData.recipeTag || []}
              onChange={(v) => handleFieldChange("recipeTag", v)}
              helpText="Recipe tags (comma-separated)"
              isChanged={!!changes.recipeTag}
            />
          </div>
        );

      case "crafting":
        return (
          <div className="space-y-4">
            <div className="p-3 rounded border border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
              <p className="text-xs text-[var(--totk-grey-200)]">
                <i className="fa-solid fa-info-circle mr-1.5 text-[var(--totk-light-green)]" aria-hidden="true" />
                <strong>Auto-sync:</strong> When you enable job flags with CRAFTING perk, they automatically populate the crafting jobs and tags arrays.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BooleanField
                label="Craftable"
                value={formData.crafting ?? false}
                onChange={(v) => handleFieldChange("crafting", v)}
                helpText="Can this item be crafted?"
                isChanged={!!changes.crafting}
              />
              <NumberField
                label="Stamina to Craft"
                value={formData.staminaToCraft ?? 0}
                onChange={(v) => handleFieldChange("staminaToCraft", v)}
                helpText="Stamina required to craft this item"
                isChanged={!!changes.staminaToCraft}
              />
            </div>
            <div className="pt-6 mt-6 border-t-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <i className="fa-solid fa-magic text-[var(--totk-light-green)] text-lg" aria-hidden="true" />
                <h5 className="text-base font-bold text-[var(--totk-light-green)]">Auto-Populated Fields</h5>
                <span className="text-xs text-[var(--totk-grey-200)]">(Read-only)</span>
              </div>
              <ArrayFieldInput
                label="Crafting Jobs"
                value={formData.craftingJobs || []}
                onChange={(v) => handleFieldChange("craftingJobs", v)}
                helpText="Jobs that can craft this item (auto-populated from job flags)"
                isChanged={!!changes.craftingJobs}
                autoPopulated={true}
                readOnly={true}
              />
            </div>
            <CraftingMaterialsField
              label="Crafting Materials"
              value={formData.craftingMaterial || []}
              items={items}
              onChange={(v) => handleFieldChange("craftingMaterial", v)}
              helpText="Items and quantities required to craft this item"
              isChanged={!!changes.craftingMaterial}
            />
          </div>
        );

      case "activities":
        return (
          <div className="space-y-6">
            <div className="p-4 rounded-lg border-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
              <div className="flex items-start gap-2">
                <i className="fa-solid fa-info-circle text-[var(--totk-light-green)] text-lg mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-[var(--totk-light-green)] mb-1">Auto-sync Enabled</p>
                  <p className="text-xs text-[var(--totk-grey-200)]">
                    Toggle activity flags below to automatically populate the obtain methods array. Auto-populated fields are read-only.
                  </p>
                </div>
              </div>
            </div>
            
            <ToggleGrid
              options={[
                { key: "gathering", label: "Gathering", helpText: "Can be obtained through gathering" },
                { key: "looting", label: "Looting", helpText: "Can be obtained through looting" },
                { key: "crafting", label: "Crafting", helpText: "Can be obtained through crafting" },
                { key: "vending", label: "Vending", helpText: "Can be obtained from vending machines" },
                { key: "traveling", label: "Traveling", helpText: "Can be obtained while traveling" },
                { key: "exploring", label: "Exploring", helpText: "Can be obtained while exploring" },
              ]}
              values={{
                gathering: formData.gathering ?? false,
                looting: formData.looting ?? false,
                crafting: formData.crafting ?? false,
                vending: formData.vending ?? false,
                traveling: formData.traveling ?? false,
                exploring: formData.exploring ?? false,
              }}
              onChange={(key, value) => handleFieldChange(key as keyof ItemFormData, value)}
              changes={{
                gathering: !!changes.gathering,
                looting: !!changes.looting,
                crafting: !!changes.crafting,
                vending: !!changes.vending,
                traveling: !!changes.traveling,
                exploring: !!changes.exploring,
              }}
              columns={3}
            />
            <div className="pt-6 mt-6 border-t-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <i className="fa-solid fa-magic text-[var(--totk-light-green)] text-lg" aria-hidden="true" />
                <h5 className="text-base font-bold text-[var(--totk-light-green)]">Auto-Populated Fields</h5>
                <span className="text-xs text-[var(--totk-grey-200)]">(Read-only)</span>
              </div>
              <ArrayFieldInput
                label="Obtain Methods"
                value={formData.obtain || []}
                onChange={(v) => handleFieldChange("obtain", v)}
                helpText="Ways to obtain this item (auto-populated from activity flags including crafting)"
                isChanged={!!changes.obtain}
                autoPopulated={true}
                readOnly={true}
              />
            </div>
            
            {/* Tags Section */}
            <div className="pt-6 mt-6 border-t-2 border-[var(--totk-dark-ocher)]/30">
              <h4 className="text-base font-semibold text-[var(--totk-light-ocher)] mb-4 pb-2 border-b border-[var(--totk-dark-ocher)]">
                Tags
              </h4>
              <ToggleGrid
                options={[
                  { key: "entertainerItems", label: "Entertainer Items", helpText: "Item for entertainers" },
                  { key: "divineItems", label: "Divine Items", helpText: "Divine or sacred item" },
                ]}
                values={{
                  entertainerItems: formData.entertainerItems ?? false,
                  divineItems: formData.divineItems ?? false,
                }}
                onChange={(key, value) => handleFieldChange(key as keyof ItemFormData, value)}
                changes={{
                  entertainerItems: !!changes.entertainerItems,
                  divineItems: !!changes.divineItems,
                }}
                columns={2}
              />
            </div>
          </div>
        );

      case "weather":
        return (
          <div className="space-y-6">
            <div className="p-4 rounded-lg border-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
              <div className="flex items-start gap-2">
                <i className="fa-solid fa-info-circle text-[var(--totk-light-green)] text-lg mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-[var(--totk-light-green)] mb-1">Auto-sync Enabled</p>
                  <p className="text-xs text-[var(--totk-grey-200)]">
                    Toggle weather conditions below to automatically populate the obtain methods and tags arrays.
                  </p>
                </div>
              </div>
            </div>
            
            <ToggleGrid
              options={[
                { key: "muggy", label: "Muggy", helpText: "Available during muggy weather" },
                { key: "flowerbloom", label: "Flower Bloom", helpText: "Available during flower bloom" },
                { key: "fairycircle", label: "Fairy Circle", helpText: "Available near fairy circles" },
                { key: "jubilee", label: "Jubilee", helpText: "Available during jubilee events" },
                { key: "meteorShower", label: "Meteor Shower", helpText: "Available during meteor showers" },
                { key: "rockslide", label: "Rockslide", helpText: "Available during rockslides" },
                { key: "avalanche", label: "Avalanche", helpText: "Available during avalanches" },
              ]}
              values={{
                muggy: formData.specialWeather?.muggy ?? false,
                flowerbloom: formData.specialWeather?.flowerbloom ?? false,
                fairycircle: formData.specialWeather?.fairycircle ?? false,
                jubilee: formData.specialWeather?.jubilee ?? false,
                meteorShower: formData.specialWeather?.meteorShower ?? false,
                rockslide: formData.specialWeather?.rockslide ?? false,
                avalanche: formData.specialWeather?.avalanche ?? false,
              }}
              onChange={(key, value) => handleFieldChange("specialWeather", { ...formData.specialWeather, [key]: value })}
              changes={changes.specialWeather ? { muggy: true, flowerbloom: true, fairycircle: true, jubilee: true, meteorShower: true, rockslide: true, avalanche: true } : {}}
              columns={3}
            />
          </div>
        );

      case "pet":
        return (
          <div className="space-y-6">
            <div className="p-4 rounded-lg border-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
              <div className="flex items-start gap-2">
                <i className="fa-solid fa-info-circle text-[var(--totk-light-green)] text-lg mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-[var(--totk-light-green)] mb-1">Auto-sync Enabled</p>
                  <p className="text-xs text-[var(--totk-grey-200)]">
                    Toggle pet flags below to automatically populate the pet perk obtain array.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
              <ToggleGrid
                options={[
                  { key: "petPerk", label: "Pet Perk", helpText: "Has pet perk benefits" },
                  { key: "petprey", label: "Pet Prey", helpText: "Can be obtained as pet prey" },
                  { key: "petforage", label: "Pet Forage", helpText: "Can be foraged by pets" },
                  { key: "lgpetprey", label: "Large Pet Prey", helpText: "Can be obtained as large pet prey" },
                  { key: "petmon", label: "Pet Monster", helpText: "Related to pet monsters" },
                ]}
                values={{
                  petPerk: formData.petPerk ?? false,
                  petprey: formData.petprey ?? false,
                  petforage: formData.petforage ?? false,
                  lgpetprey: formData.lgpetprey ?? false,
                  petmon: formData.petmon ?? false,
                }}
                onChange={(key, value) => handleFieldChange(key as keyof ItemFormData, value)}
                changes={{
                  petPerk: !!changes.petPerk,
                  petprey: !!changes.petprey,
                  petforage: !!changes.petforage,
                  lgpetprey: !!changes.lgpetprey,
                  petmon: !!changes.petmon,
                }}
                columns={3}
                groupTitle="Pet Types"
              />
              
              <ToggleGrid
                options={[
                  { key: "petchu", label: "Pet Chuchu", helpText: "Related to pet chuchus" },
                  { key: "petfirechu", label: "Pet Fire Chuchu", helpText: "Related to pet fire chuchus" },
                  { key: "peticechu", label: "Pet Ice Chuchu", helpText: "Related to pet ice chuchus" },
                  { key: "petelectricchu", label: "Pet Electric Chuchu", helpText: "Related to pet electric chuchus" },
                ]}
                values={{
                  petchu: formData.petchu ?? false,
                  petfirechu: formData.petfirechu ?? false,
                  peticechu: formData.peticechu ?? false,
                  petelectricchu: formData.petelectricchu ?? false,
                }}
                onChange={(key, value) => handleFieldChange(key as keyof ItemFormData, value)}
                changes={{
                  petchu: !!changes.petchu,
                  petfirechu: !!changes.petfirechu,
                  peticechu: !!changes.peticechu,
                  petelectricchu: !!changes.petelectricchu,
                }}
                columns={4}
                groupTitle="Chuchu Variants"
              />
            </div>
            <div className="pt-6 mt-6 border-t-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <i className="fa-solid fa-magic text-[var(--totk-light-green)] text-lg" aria-hidden="true" />
                <h5 className="text-base font-bold text-[var(--totk-light-green)]">Auto-Populated Fields</h5>
                <span className="text-xs text-[var(--totk-grey-200)]">(Read-only)</span>
              </div>
              <ArrayFieldInput
                label="Pet Perk Obtain"
                value={formData.petperkobtain || []}
                onChange={(v) => handleFieldChange("petperkobtain", v)}
                helpText="Ways pets can obtain this (auto-populated from pet flags)"
                isChanged={!!changes.petperkobtain}
                autoPopulated={true}
                readOnly={true}
              />
            </div>
          </div>
        );

      case "locations":
        return (
          <div className="space-y-6">
            <div className="p-4 rounded-lg border-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
              <div className="flex items-start gap-2">
                <i className="fa-solid fa-info-circle text-[var(--totk-light-green)] text-lg mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-[var(--totk-light-green)] mb-1">Auto-sync Enabled</p>
                  <p className="text-xs text-[var(--totk-grey-200)]">
                    Toggle location flags below to automatically populate the locations and location tags arrays.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
              <ToggleGrid
                options={[
                  { key: "centralHyrule", label: "Central Hyrule", helpText: "Found in Central Hyrule" },
                  { key: "eldin", label: "Eldin", helpText: "Found in Eldin region" },
                  { key: "faron", label: "Faron", helpText: "Found in Faron region" },
                  { key: "gerudo", label: "Gerudo", helpText: "Found in Gerudo region" },
                  { key: "hebra", label: "Hebra", helpText: "Found in Hebra region" },
                  { key: "lanayru", label: "Lanayru", helpText: "Found in Lanayru region" },
                ]}
                values={{
                  centralHyrule: formData.centralHyrule ?? false,
                  eldin: formData.eldin ?? false,
                  faron: formData.faron ?? false,
                  gerudo: formData.gerudo ?? false,
                  hebra: formData.hebra ?? false,
                  lanayru: formData.lanayru ?? false,
                }}
                onChange={(key, value) => handleFieldChange(key as keyof ItemFormData, value)}
                changes={{
                  centralHyrule: !!changes.centralHyrule,
                  eldin: !!changes.eldin,
                  faron: !!changes.faron,
                  gerudo: !!changes.gerudo,
                  hebra: !!changes.hebra,
                  lanayru: !!changes.lanayru,
                }}
                columns={3}
                groupTitle="Regions"
              />
              
              <ToggleGrid
                options={[
                  { key: "pathOfScarletLeaves", label: "Path of Scarlet Leaves", helpText: "Found on Path of Scarlet Leaves" },
                  { key: "leafDewWay", label: "Leaf Dew Way", helpText: "Found on Leaf Dew Way" },
                ]}
                values={{
                  pathOfScarletLeaves: formData.pathOfScarletLeaves ?? false,
                  leafDewWay: formData.leafDewWay ?? false,
                }}
                onChange={(key, value) => handleFieldChange(key as keyof ItemFormData, value)}
                changes={{
                  pathOfScarletLeaves: !!changes.pathOfScarletLeaves,
                  leafDewWay: !!changes.leafDewWay,
                }}
                columns={2}
                groupTitle="Special Paths"
              />
            </div>
            <div className="pt-6 mt-6 border-t-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <i className="fa-solid fa-magic text-[var(--totk-light-green)] text-lg" aria-hidden="true" />
                <h5 className="text-base font-bold text-[var(--totk-light-green)]">Auto-Populated Fields</h5>
                <span className="text-xs text-[var(--totk-grey-200)]">(Read-only)</span>
              </div>
              <ArrayFieldInput
                label="Locations"
                value={formData.locations || []}
                onChange={(v) => handleFieldChange("locations", v)}
                helpText="Locations where this item can be found (auto-populated from location flags)"
                isChanged={!!changes.locations}
                autoPopulated={true}
                readOnly={true}
              />
            </div>
          </div>
        );

      case "jobs":
        // Group jobs by their perk type (GATHERING, CRAFTING, LOOTING, etc.)
        const jobGroups = [
          {
            title: "Gathering Jobs",
            jobs: [
              { key: "farmer", label: "Farmer" },
              { key: "forager", label: "Forager" },
              { key: "herbalist", label: "Herbalist" },
              { key: "hunter", label: "Hunter" },
              { key: "fisherman", label: "Fisherman" },
              { key: "rancher", label: "Rancher" },
              { key: "miner", label: "Miner" },
              { key: "beekeeper", label: "Beekeeper" },
            ],
          },
          {
            title: "Crafting Jobs",
            jobs: [
              { key: "artist", label: "Artist" },
              { key: "cook", label: "Cook" },
              { key: "craftsman", label: "Craftsman" },
              { key: "witch", label: "Witch" },
              { key: "researcher", label: "Researcher" },
              { key: "blacksmith", label: "Blacksmith" },
              { key: "maskMaker", label: "Mask Maker" },
              { key: "weaver", label: "Weaver" },
            ],
          },
          {
            title: "Looting Jobs",
            jobs: [
              { key: "adventurer", label: "Adventurer" },
              { key: "gravekeeper", label: "Gravekeeper" },
              { key: "guard", label: "Guard" },
              { key: "mercenary", label: "Mercenary" },
              { key: "scout", label: "Scout" },
              { key: "hunterLooting", label: "Hunter (Looting)" },
            ],
          },
        ];
        
        // Build values and changes objects for all jobs
        const allJobKeys = jobGroups.flatMap(group => group.jobs.map(job => job.key));
        const jobValues = allJobKeys.reduce((acc, key) => {
          acc[key] = (formData[key as keyof ItemFormData] as boolean) ?? false;
          return acc;
        }, {} as Record<string, boolean>);
        
        const jobChanges = allJobKeys.reduce((acc, key) => {
          acc[key] = !!changes[key];
          return acc;
        }, {} as Record<string, boolean>);
        
        return (
          <div className="space-y-6">
            <div className="p-4 rounded-lg border-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
              <div className="flex items-start gap-2">
                <i className="fa-solid fa-info-circle text-[var(--totk-light-green)] text-lg mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-[var(--totk-light-green)] mb-1">Auto-sync Enabled</p>
                  <p className="text-xs text-[var(--totk-grey-200)]">
                    When you enable a job flag, it automatically adds the job to the appropriate arrays (gatheringJobs, lootingJobs, craftingJobs) and updates related tags. Auto-populated fields are read-only.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
              {jobGroups.map((group) => (
                <ToggleGrid
                  key={group.title}
                  options={group.jobs}
                  values={jobValues}
                  onChange={(key, value) => handleFieldChange(key as keyof ItemFormData, value)}
                  changes={jobChanges}
                  columns={4}
                  groupTitle={group.title}
                />
              ))}
            </div>
              <div className="pt-6 mt-6 border-t-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <i className="fa-solid fa-magic text-[var(--totk-light-green)] text-lg" aria-hidden="true" />
                  <h5 className="text-base font-bold text-[var(--totk-light-green)]">Auto-Populated Fields</h5>
                  <span className="text-xs text-[var(--totk-grey-200)]">(Read-only)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ArrayFieldInput
                    label="All Jobs"
                    value={formData.allJobs || []}
                    onChange={(v) => handleFieldChange("allJobs", v)}
                    helpText="Jobs that benefit from this item (auto-populated from job flags)"
                    isChanged={!!changes.allJobs}
                    autoPopulated={true}
                    readOnly={true}
                  />
                  <ArrayFieldInput
                    label="Gathering Jobs"
                    value={formData.gatheringJobs || []}
                    onChange={(v) => handleFieldChange("gatheringJobs", v)}
                    helpText="Jobs that can gather this item (auto-populated from job flags)"
                    isChanged={!!changes.gatheringJobs}
                    autoPopulated={true}
                    readOnly={true}
                  />
                  <ArrayFieldInput
                    label="Looting Jobs"
                    value={formData.lootingJobs || []}
                    onChange={(v) => handleFieldChange("lootingJobs", v)}
                    helpText="Jobs that can loot this item (auto-populated from job flags)"
                    isChanged={!!changes.lootingJobs}
                    autoPopulated={true}
                    readOnly={true}
                  />
                  <ArrayFieldInput
                    label="Crafting Jobs"
                    value={formData.craftingJobs || []}
                    onChange={(v) => handleFieldChange("craftingJobs", v)}
                    helpText="Jobs that can craft this item (auto-populated from job flags)"
                    isChanged={!!changes.craftingJobs}
                    autoPopulated={true}
                    readOnly={true}
                  />
                </div>
              </div>
            </div>
        );

      case "monsters":
        return (
          <div className="space-y-6">
            <div className="p-4 rounded-lg border-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
              <div className="flex items-start gap-2">
                <i className="fa-solid fa-info-circle text-[var(--totk-light-green)] text-lg mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-[var(--totk-light-green)] mb-1">Auto-sync Enabled</p>
                  <p className="text-xs text-[var(--totk-grey-200)]">
                    When you enable a monster flag, it automatically adds the monster name to the monsterList array. Auto-populated fields are read-only.
                  </p>
                </div>
              </div>
            </div>
            
            {[
              {
                title: "Bokoblin Variants",
                monsters: [
                  { key: "blackBokoblin", label: "Black Bokoblin" },
                  { key: "blueBokoblin", label: "Blue Bokoblin" },
                  { key: "cursedBokoblin", label: "Cursed Bokoblin" },
                  { key: "goldenBokoblin", label: "Golden Bokoblin" },
                  { key: "silverBokoblin", label: "Silver Bokoblin" },
                  { key: "bokoblin", label: "Bokoblin" },
                  { key: "normalBokoblin", label: "Normal Bokoblin" },
                ],
              },
              {
                title: "Chuchu Variants",
                monsters: [
                  { key: "electricChuchuLarge", label: "Electric Chuchu (Large)" },
                  { key: "fireChuchuLarge", label: "Fire Chuchu (Large)" },
                  { key: "iceChuchuLarge", label: "Ice Chuchu (Large)" },
                  { key: "chuchuLarge", label: "Chuchu (Large)" },
                  { key: "electricChuchuMedium", label: "Electric Chuchu (Medium)" },
                  { key: "fireChuchuMedium", label: "Fire Chuchu (Medium)" },
                  { key: "iceChuchuMedium", label: "Ice Chuchu (Medium)" },
                  { key: "chuchuMedium", label: "Chuchu (Medium)" },
                  { key: "electricChuchuSmall", label: "Electric Chuchu (Small)" },
                  { key: "fireChuchuSmall", label: "Fire Chuchu (Small)" },
                  { key: "iceChuchuSmall", label: "Ice Chuchu (Small)" },
                  { key: "chuchuSmall", label: "Chuchu (Small)" },
                ],
              },
              {
                title: "Hinox Variants",
                monsters: [
                  { key: "blackHinox", label: "Black Hinox" },
                  { key: "blueHinox", label: "Blue Hinox" },
                  { key: "hinox", label: "Hinox" },
                ],
              },
              {
                title: "Keese Variants",
                monsters: [
                  { key: "electricKeese", label: "Electric Keese" },
                  { key: "fireKeese", label: "Fire Keese" },
                  { key: "iceKeese", label: "Ice Keese" },
                  { key: "keese", label: "Keese" },
                ],
              },
              {
                title: "Lizalfos Variants",
                monsters: [
                  { key: "blackLizalfos", label: "Black Lizalfos" },
                  { key: "blueLizalfos", label: "Blue Lizalfos" },
                  { key: "cursedLizalfos", label: "Cursed Lizalfos" },
                  { key: "electricLizalfos", label: "Electric Lizalfos" },
                  { key: "fireBreathLizalfos", label: "Fire Breath Lizalfos" },
                  { key: "goldenLizalfos", label: "Golden Lizalfos" },
                  { key: "iceBreathLizalfos", label: "Ice Breath Lizalfos" },
                  { key: "silverLizalfos", label: "Silver Lizalfos" },
                  { key: "lizalfos", label: "Lizalfos" },
                ],
              },
              {
                title: "Lynel Variants",
                monsters: [
                  { key: "blueManedLynel", label: "Blue-Maned Lynel" },
                  { key: "goldenLynel", label: "Golden Lynel" },
                  { key: "silverLynel", label: "Silver Lynel" },
                  { key: "whiteManedLynel", label: "White-Maned Lynel" },
                  { key: "lynel", label: "Lynel" },
                ],
              },
              {
                title: "Moblin Variants",
                monsters: [
                  { key: "blackMoblin", label: "Black Moblin" },
                  { key: "blueMoblin", label: "Blue Moblin" },
                  { key: "cursedMoblin", label: "Cursed Moblin" },
                  { key: "goldenMoblin", label: "Golden Moblin" },
                  { key: "silverMoblin", label: "Silver Moblin" },
                  { key: "moblin", label: "Moblin" },
                ],
              },
              {
                title: "Other Monsters",
                monsters: [
                  { key: "molduga", label: "Molduga" },
                  { key: "molduking", label: "Molduking" },
                  { key: "forestOctorok", label: "Forest Octorok" },
                  { key: "rockOctorok", label: "Rock Octorok" },
                  { key: "skyOctorok", label: "Sky Octorok" },
                  { key: "snowOctorok", label: "Snow Octorok" },
                  { key: "treasureOctorok", label: "Treasure Octorok" },
                  { key: "waterOctorok", label: "Water Octorok" },
                  { key: "frostPebblit", label: "Frost Pebblit" },
                  { key: "igneoPebblit", label: "Igneo Pebblit" },
                  { key: "stonePebblit", label: "Stone Pebblit" },
                  { key: "stalizalfos", label: "Stalizalfos" },
                  { key: "stalkoblin", label: "Stalkoblin" },
                  { key: "stalmoblin", label: "Stalmoblin" },
                  { key: "stalnox", label: "Stalnox" },
                  { key: "frostTalus", label: "Frost Talus" },
                  { key: "igneoTalus", label: "Igneo Talus" },
                  { key: "luminousTalus", label: "Luminous Talus" },
                  { key: "rareTalus", label: "Rare Talus" },
                  { key: "stoneTalus", label: "Stone Talus" },
                  { key: "blizzardWizzrobe", label: "Blizzard Wizzrobe" },
                  { key: "electricWizzrobe", label: "Electric Wizzrobe" },
                  { key: "fireWizzrobe", label: "Fire Wizzrobe" },
                  { key: "iceWizzrobe", label: "Ice Wizzrobe" },
                  { key: "meteoWizzrobe", label: "Meteo Wizzrobe" },
                  { key: "thunderWizzrobe", label: "Thunder Wizzrobe" },
                  { key: "likeLike", label: "Like Like" },
                  { key: "evermean", label: "Evermean" },
                  { key: "gibdo", label: "Gibdo" },
                  { key: "horriblin", label: "Horriblin" },
                  { key: "gloomHands", label: "Gloom Hands" },
                  { key: "bossBokoblin", label: "Boss Bokoblin" },
                  { key: "mothGibdo", label: "Moth Gibdo" },
                  { key: "littleFrox", label: "Little Frox" },
                  { key: "yigaBlademaster", label: "Yiga Blademaster" },
                  { key: "yigaFootsoldier", label: "Yiga Footsoldier" },
                  { key: "normalBokoblin", label: "Normal Bokoblin" },
                  { key: "normalGibdo", label: "Normal Gibdo" },
                  { key: "normalHinox", label: "Normal Hinox" },
                  { key: "normalHorriblin", label: "Normal Horriblin" },
                  { key: "normalKeese", label: "Normal Keese" },
                  { key: "normalLizalfos", label: "Normal Lizalfos" },
                  { key: "normalLynel", label: "Normal Lynel" },
                  { key: "normalMoblin", label: "Normal Moblin" },
                ],
              },
            ].map((group) => {
              const monsterValues = group.monsters.reduce((acc, { key }) => {
                acc[key] = (formData[key as keyof ItemFormData] as boolean) ?? false;
                return acc;
              }, {} as Record<string, boolean>);
              
              const monsterChanges = group.monsters.reduce((acc, { key }) => {
                acc[key] = !!changes[key];
                return acc;
              }, {} as Record<string, boolean>);
              
              return (
                <ToggleGrid
                  key={group.title}
                  options={group.monsters}
                  values={monsterValues}
                  onChange={(key, value) => handleFieldChange(key as keyof ItemFormData, value)}
                  changes={monsterChanges}
                  columns={group.monsters.length > 10 ? 4 : 3}
                  groupTitle={group.title}
                />
              );
            })}
            
            <div className="pt-6 mt-6 border-t-2 border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <i className="fa-solid fa-magic text-[var(--totk-light-green)] text-lg" aria-hidden="true" />
                <h5 className="text-base font-bold text-[var(--totk-light-green)]">Auto-Populated Fields</h5>
                <span className="text-xs text-[var(--totk-grey-200)]">(Read-only)</span>
              </div>
              <ArrayFieldInput
                label="Monster List"
                value={formData.monsterList || []}
                onChange={(v) => handleFieldChange("monsterList", v)}
                helpText="List of associated monsters (auto-populated from monster flags)"
                isChanged={!!changes.monsterList}
                autoPopulated={true}
                readOnly={true}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-[var(--totk-brown)] border-b-2 border-[var(--totk-dark-ocher)] pb-4 mb-4 -mx-6 -mt-6 px-6 pt-6 shadow-lg">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-xl font-bold text-[var(--totk-light-ocher)]">
              {formData.itemName || "Unnamed Item"}
            </h3>
            <p className="text-xs text-[var(--totk-grey-200)] mt-1">
              Item ID: {item._id}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hasChanges && (
              <span className="text-xs text-[var(--totk-light-green)] px-2 py-1 rounded bg-[var(--totk-light-green)]/10 whitespace-nowrap">
                {Object.keys(changes).length} change{Object.keys(changes).length !== 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={handleSaveClick}
              disabled={!hasChanges || hasErrors || saving}
              className="rounded-md bg-[var(--totk-mid-ocher)] px-4 py-2 text-sm font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {saving ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true" />
                  Saving...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-floppy-disk mr-2" aria-hidden="true" />
                  Save Changes
                </>
              )}
            </button>
            {hasChanges && (
              <button
                onClick={handleReset}
                disabled={saving}
                className="rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-4 py-2 text-sm font-bold text-[var(--botw-pale)] transition-colors hover:bg-[var(--totk-dark-ocher)] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <i className="fa-solid fa-rotate-left mr-2" aria-hidden="true" />
                Reset
              </button>
            )}
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-4 py-2 text-sm font-bold text-[var(--botw-pale)] transition-colors hover:bg-[var(--totk-dark-ocher)] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Close
            </button>
          </div>
        </div>
        <Tabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as TabValue)}
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="pb-4 pt-6 min-w-0">{renderTabContent()}</div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        open={showConfirmModal}
        onOpenChange={setShowConfirmModal}
        title="Confirm Changes"
        description={`Are you sure you want to save changes to "${formData.itemName || "this item"}"?`}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-[var(--botw-pale)] mb-2">
              You're changing the following fields:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-[var(--totk-grey-200)] max-h-60 overflow-y-auto">
              {Object.entries(changes).slice(0, 20).map(([field, change]) => (
                <li key={field}>
                  <strong className="text-[var(--totk-light-ocher)]">
                    {getFieldDisplayName(field)}
                  </strong>
                  : {String(change.original)} → {String(change.current)}
                </li>
              ))}
              {Object.keys(changes).length > 20 && (
                <li className="text-[var(--totk-grey-200)] italic">
                  ... and {Object.keys(changes).length - 20} more fields
                </li>
              )}
            </ul>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-[var(--totk-dark-ocher)]">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-5 py-2.5 text-sm font-bold text-[var(--botw-pale)] transition-colors hover:bg-[var(--totk-dark-ocher)] min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSave}
              className="rounded-md bg-[var(--totk-light-green)] px-5 py-2.5 text-sm font-bold text-[var(--botw-warm-black)] transition-colors hover:bg-[var(--totk-mid-green)] min-h-[44px]"
            >
              <i className="fa-solid fa-check mr-2" aria-hidden="true" />
              Yes, Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
