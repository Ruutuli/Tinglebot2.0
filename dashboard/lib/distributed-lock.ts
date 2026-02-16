/**
 * MongoDB-based distributed lock for cross-process coordination.
 * Used to ensure only one process runs init/scheduling when multiple instances start.
 */

import mongoose from "mongoose";
import type { Collection } from "mongodb";
import { logger } from "@/utils/logger";

const LOCKS_COLLECTION = "agendaInitLocks";
const LOCK_TTL_MS = 120_000; // 2 minutes - enough for init + job scheduling

interface LockDocument {
  _id: string;
  lockedUntil: Date;
}

/**
 * Try to acquire a distributed lock. Returns true if we got it, false if another process holds it.
 * Lock expires automatically after ttlMs to avoid stale locks if a process crashes.
 */
export async function tryAcquireLock(
  key: string,
  ttlMs: number = LOCK_TTL_MS
): Promise<boolean> {
  const conn = mongoose.connection;
  if (conn.readyState !== 1 || !conn.db) {
    logger.warn("distributed-lock", `DB not connected, cannot acquire lock "${key}"`);
    return false;
  }

  const collection = conn.db.collection(LOCKS_COLLECTION) as Collection<LockDocument>;
  const lockedUntil = new Date(Date.now() + ttlMs);

  try {
    try {
      await collection.insertOne({ _id: key, lockedUntil });
      logger.info("distributed-lock", `Acquired lock "${key}" (first claim)`);
      return true;
    } catch (e: unknown) {
      const err = e as { code?: number };
      if (err.code === 11000) {
        // Duplicate key - lock exists, try to claim if expired
        const result = await collection.findOneAndUpdate(
          { _id: key, lockedUntil: { $lt: new Date() } },
          { $set: { lockedUntil } },
          { returnDocument: "after" }
        );
        if (result) {
          logger.info("distributed-lock", `Acquired lock "${key}" (claimed expired lock)`);
          return true;
        }
        return false;
      }
      throw e;
    }
  } catch (error) {
    logger.error(
      "distributed-lock",
      `Failed to acquire lock "${key}": ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Release a lock. Call in finally block after work is done.
 */
export async function releaseLock(key: string): Promise<void> {
  try {
    const conn = mongoose.connection;
    if (conn.readyState !== 1 || !conn.db) return;

    const collection = conn.db.collection(LOCKS_COLLECTION) as Collection<LockDocument>;
    const result = await collection.deleteOne({ _id: key });
    if (result.deletedCount > 0) {
      logger.info("distributed-lock", `Released lock "${key}"`);
    }
  } catch (error) {
    logger.warn(
      "distributed-lock",
      `Failed to release lock "${key}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
