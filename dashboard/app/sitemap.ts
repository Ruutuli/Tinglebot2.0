// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import { MetadataRoute } from "next";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type ChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

type SitemapEntryConfig = {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
};

// ============================================================================
// ------------------- Constants & Config -------------------
// ============================================================================

import { getAppUrl } from "@/lib/config";

const DEFAULT_BASE_URL = "http://localhost:6001";

const SITEMAP_ENTRIES: SitemapEntryConfig[] = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/profile", changeFrequency: "weekly", priority: 0.8 },
  { path: "/characters/create", changeFrequency: "weekly", priority: 0.8 },
  { path: "/characters/my-ocs", changeFrequency: "daily", priority: 0.9 },
  { path: "/models/characters", changeFrequency: "daily", priority: 0.7 },
  { path: "/models/items", changeFrequency: "weekly", priority: 0.6 },
  { path: "/models/monsters", changeFrequency: "weekly", priority: 0.6 },
  { path: "/models/villages", changeFrequency: "weekly", priority: 0.6 },
];

// ============================================================================
// ------------------- Pure Helpers -------------------
// ============================================================================

// createEntry -
// Creates a sitemap entry from a path, change frequency, and priority
const createEntry = (
  baseUrl: string,
  config: SitemapEntryConfig
): MetadataRoute.Sitemap[0] => {
  const url = config.path.startsWith("http") 
    ? config.path 
    : config.path === "" 
      ? baseUrl 
      : `${baseUrl}${config.path}`;
  
  return {
    url,
    lastModified: new Date(),
    changeFrequency: config.changeFrequency,
    priority: config.priority,
  };
};

// ============================================================================
// ------------------- Component Export -------------------
// ============================================================================

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAppUrl();
  
  return SITEMAP_ENTRIES.map((entry) => createEntry(baseUrl, entry));
}
