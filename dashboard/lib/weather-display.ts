/**
 * Weather display helpers for the dashboard.
 * Aligned with weatherService.js OVERLAY_MAPPING, weatherData.js, and seasonsData.js.
 * Used for correct banner + overlay images and precip → icon (Clear/Cloudy/Rain/Storm) mapping.
 */

function encodePublicFilename(filename: string): string {
  // Defensive: some CDNs/proxies mishandle special characters in the raw path.
  // Next/Node will still decode this back to the real filename in /public.
  return `/${encodeURIComponent(filename)}`;
}

/** Precipitation/special condition → overlay filename (ROOTS-{name}.png). Special takes priority over precip. */
export const OVERLAY_MAPPING: Record<string, string> = {
  Rain: "rain",
  "Light Rain": "rain",
  "Heavy Rain": "rain",
  Thunderstorm: "thunderstorm",
  Snow: "snow",
  "Light Snow": "snow",
  "Heavy Snow": "snow",
  Blizzard: "blizzard",
  Sleet: "sleet",
  Hail: "hail",
  Fog: "fog",
  Cloudy: "cloudy",
  "Partly cloudy": "cloudy",
  Thundersnow: "thundersnow",
  "Cinder Storm": "cinderstorm",
  "Blight Rain": "blightrain",
  "Heat Lightning": "heatlightning",
  Rainbow: "rainbow",
  "Flower Bloom": "flowerbloom",
  "Fairy Circle": "fairycircle",
  "Meteor Shower": "meteorshower",
  Jubilee: "jubilee",
  Drought: "drought",
  "Lightning Storm": "thunderstorm",
  "Rock Slide": "rockslide",
};

/** Village → default banner (first of 1/2/3). Assets under /assets/banners/. */
export const BANNER_MAP: Record<string, string> = {
  Rudania: "/assets/banners/Rudania1.png",
  Inariko: "/assets/banners/Inariko1.png",
  Vhintl: "/assets/banners/Vhintl1.png",
};

/** Village → crest icon in /assets/icons/. */
export const VILLAGE_CREST_MAP: Record<string, string> = {
  Rudania: `/assets/icons/${encodeURIComponent("[RotW] village crest_rudania_.png")}`,
  Inariko: `/assets/icons/${encodeURIComponent("[RotW] village crest_inariko_.png")}`,
  Vhintl: `/assets/icons/${encodeURIComponent("[RotW] village crest_vhintl_.png")}`,
};

export function getVillageCrestPath(village: string | null | undefined): string | null {
  if (!village || typeof village !== "string") return null;
  const v = village.trim();
  const path = VILLAGE_CREST_MAP[v];
  if (path) return path;
  const lower = v.toLowerCase();
  if (lower === "rudania") return VILLAGE_CREST_MAP.Rudania;
  if (lower === "inariko") return VILLAGE_CREST_MAP.Inariko;
  if (lower === "vhintl") return VILLAGE_CREST_MAP.Vhintl;
  return null;
}

/** Season → filename in /assets/seasons/. Supports Spring/Summer/Fall/Winter, Autumn→fall. */
const SEASON_TO_IMAGE: Record<string, string> = {
  Spring: "spring",
  Summer: "summer",
  Fall: "fall",
  Winter: "winter",
  Autumn: "fall",
  spring: "spring",
  summer: "summer",
  fall: "fall",
  winter: "winter",
};

/**
 * Path for season image in /assets/seasons/ (spring.png, summer.png, fall.png, winter.png).
 * Returns null for "—" or unknown season.
 */
export function getSeasonImagePath(season: string | null | undefined): string | null {
  if (!season || typeof season !== "string" || season.trim() === "—") return null;
  const key = season.trim();
  const file = SEASON_TO_IMAGE[key] ?? SEASON_TO_IMAGE[key.toLowerCase()];
  if (!file) return null;
  return `/assets/seasons/${file}.png`;
}

/** Weather SVG types: Weather={type}, Glowing={bool}.svg in public/. */
export const WEATHER_SVG_TYPES = ["Clear", "Cloudy", "Rain", "Storm"] as const;
export type PrecipIconType = (typeof WEATHER_SVG_TYPES)[number];

/**
 * weatherData.js precipitations (40–58) → Weather SVG type.
 * SVGs: Weather=Clear|Cloudy|Rain|Storm, Glowing=false|true.svg
 */
export const PRECIPITATION_TO_WEATHER_SVG: Record<string, PrecipIconType> = {
  Sunny: "Clear",
  Rainbow: "Clear",
  Cloudy: "Cloudy",
  "Partly cloudy": "Cloudy",
  Fog: "Cloudy",
  Rain: "Rain",
  "Light Rain": "Rain",
  "Heavy Rain": "Rain",
  "Sun Shower": "Rain",
  Blizzard: "Storm",
  "Cinder Storm": "Storm",
  Hail: "Storm",
  "Heat Lightning": "Storm",
  "Heavy Snow": "Storm",
  "Light Snow": "Storm",
  Sleet: "Storm",
  Snow: "Storm",
  Thundersnow: "Storm",
  Thunderstorm: "Storm",
};

/** Specials / other labels → SVG type (fallback when not in PRECIPITATION_TO_WEATHER_SVG). */
const OTHER_TO_ICON: Record<string, PrecipIconType> = {
  "Meteor Shower": "Clear",
  Drought: "Clear",
  "Fairy Circle": "Clear",
  Jubilee: "Clear",
  "Blight Rain": "Rain",
  Muggy: "Rain",
  Flood: "Rain",
  "Lightning Storm": "Storm",
  Avalanche: "Storm",
  "Rock Slide": "Storm",
  "Flower Bloom": "Cloudy",
};

/**
 * Resolve overlay path for a condition label (precipitation or special).
 * Returns public path like /assets/overlays/ROOTS-rain.png or null if no mapping.
 */
export function getOverlayForCondition(label: string | null | undefined): string | null {
  if (!label || typeof label !== "string") return null;
  const name = OVERLAY_MAPPING[label.trim()];
  if (!name) return null;
  return `/assets/overlays/ROOTS-${name}.png`;
}

/**
 * Get overlay for weather doc: special takes priority over precipitation.
 * Matches weatherService generateBanner logic.
 */
export function getOverlayForWeather(doc: {
  special?: { label?: string } | null;
  precipitation?: { label?: string } | null;
}): string | null {
  const special = doc.special?.label;
  if (special) {
    const o = getOverlayForCondition(special);
    if (o) return o;
  }
  return getOverlayForCondition(doc.precipitation?.label ?? null);
}

/**
 * Banner URL for village. Uses first banner (Rudania1, Inariko1, Vhintl1).
 */
export function getBannerForVillage(village: string): string {
  const v = village?.trim();
  if (!v) return BANNER_MAP.Rudania;
  const path = BANNER_MAP[v];
  return path ?? BANNER_MAP.Rudania;
}

/**
 * Map precipitation/special label to Weather SVG type (Clear|Cloudy|Rain|Storm).
 * Uses PRECIPITATION_TO_WEATHER_SVG (weatherData.js 40–58) then OTHER_TO_ICON, then regex fallbacks.
 */
export function precipLabelToIconType(label: string | null | undefined): PrecipIconType {
  if (!label || typeof label !== "string") return "Clear";
  const k = label.trim();
  const precip = PRECIPITATION_TO_WEATHER_SVG[k];
  if (precip) return precip;
  const other = OTHER_TO_ICON[k];
  if (other) return other;
  const match = Object.entries(PRECIPITATION_TO_WEATHER_SVG).find(([key]) => key.toLowerCase() === k.toLowerCase());
  if (match) return match[1];
  const lower = k.toLowerCase();
  if (lower === "sunny" || lower === "rainbow") return "Clear";
  if (["cloudy", "fog", "partly cloudy"].includes(lower)) return "Cloudy";
  if (lower.includes("rain") || lower.includes("shower") || lower === "muggy" || lower === "flood") return "Rain";
  if (
    lower.includes("storm") ||
    lower.includes("snow") ||
    lower.includes("thunder") ||
    lower.includes("hail") ||
    lower.includes("sleet") ||
    lower.includes("blizzard") ||
    lower.includes("cinder")
  )
    return "Storm";
  return "Clear";
}

/**
 * Which SVG types use Glowing=true for this precipitation.
 * Sun Shower / Rainbow = both Clear and Rain (sun + rain).
 */
export function getActiveSvgTypesForPrecip(label: string | null | undefined): PrecipIconType[] {
  if (!label || typeof label !== "string") return [];
  const k = label.trim();
  if (k === "—" || !k) return [];
  if (k === "Sun Shower" || k === "Rainbow") return ["Clear", "Rain"];
  const single = precipLabelToIconType(k);
  return [single];
}

/** Path for Weather={type}, Glowing={bool}.svg. */
export function getWeatherSvgPath(type: PrecipIconType, glowing: boolean): string {
  return encodePublicFilename(`Weather=${type}, Glowing=${glowing}.svg`);
}
