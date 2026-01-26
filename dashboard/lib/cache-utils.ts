/**
 * Cache utility functions for client-side caching
 * Provides consistent caching patterns with versioning and expiration
 */

export interface CacheData<T> {
  version: string;
  timestamp: number;
  data: T;
}

export interface CacheOptions {
  version?: string;
  expiry?: number; // milliseconds
  key: string;
}

const DEFAULT_VERSION = "1.0";
const DEFAULT_EXPIRY = 1000 * 60 * 30; // 30 minutes

/**
 * Get cached data from localStorage
 * Returns null if cache is missing, expired, or invalid
 */
export function getCachedData<T>(options: CacheOptions): T | null {
  const { key, version = DEFAULT_VERSION, expiry = DEFAULT_EXPIRY } = options;

  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const parsed: CacheData<T> = JSON.parse(cached);

    // Check version match
    if (parsed.version !== version) {
      localStorage.removeItem(key);
      return null;
    }

    // Check expiry
    if (parsed.timestamp && Date.now() - parsed.timestamp > expiry) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch (e) {
    // Invalid cache data, remove it
    console.warn(`Failed to read cache for key "${key}":`, e);
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore removal errors
    }
    return null;
  }
}

/**
 * Save data to localStorage cache
 */
export function setCachedData<T>(options: CacheOptions, data: T): boolean {
  const { key, version = DEFAULT_VERSION } = options;

  try {
    const cacheData: CacheData<T> = {
      version,
      timestamp: Date.now(),
      data,
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
    return true;
  } catch (e) {
    // localStorage might be full or unavailable
    console.warn(`Failed to save cache for key "${key}":`, e);
    return false;
  }
}

/**
 * Clear cached data
 */
export function clearCache(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`Failed to clear cache for key "${key}":`, e);
  }
}

/**
 * Check if cache exists and is valid (without reading the data)
 */
export function isCacheValid(options: CacheOptions): boolean {
  const { key, version = DEFAULT_VERSION, expiry = DEFAULT_EXPIRY } = options;

  try {
    const cached = localStorage.getItem(key);
    if (!cached) return false;

    const parsed: CacheData<unknown> = JSON.parse(cached);

    // Check version match
    if (parsed.version !== version) {
      return false;
    }

    // Check expiry
    if (parsed.timestamp && Date.now() - parsed.timestamp > expiry) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
