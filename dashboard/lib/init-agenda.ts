/**
 * Initialize Agenda and Character of the Week system
 * Sets up jobs and ensures a Character of the Week exists
 * Uses a distributed lock so only one process runs init when multiple instances start
 */

import { startAgenda } from "@/lib/agenda";
import { defineRotationJob } from "@/lib/jobs/character-of-week-rotation";
import { getCurrentCharacterOfWeek, rotateCharacterOfWeek } from "@/lib/character-of-week";
import { connect } from "@/lib/db";
import { tryAcquireLock, releaseLock } from "@/lib/distributed-lock";
import { logger } from "@/utils/logger";

const INIT_LOCK_KEY = "character-of-week-init";

let isInitialized = false;

/**
 * Initialize Agenda scheduler and Character of the Week system
 * This should be called once on server startup.
 * Uses MongoDB distributed lock to prevent duplicate init across multiple processes/replicas.
 */
export async function initializeAgenda(): Promise<void> {
  if (isInitialized) {
    logger.warn("init-agenda", "Agenda already initialized (this process), skipping");
    return;
  }

  try {
    // Ensure database connection (required for distributed lock)
    await connect();

    // Only one process should run init - others skip gracefully
    const acquired = await tryAcquireLock(INIT_LOCK_KEY);
    if (!acquired) {
      logger.info("init-agenda", "Another process is initializing Agenda, skipping");
      return;
    }

    try {
      await startAgenda();
      await defineRotationJob();
      await ensureCharacterOfWeekExists();
      isInitialized = true;
    } finally {
      await releaseLock(INIT_LOCK_KEY);
    }
  } catch (error) {
    logger.error(
      "init-agenda",
      `Failed to initialize Agenda: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Ensure a Character of the Week exists
 * If none exists or rotation is needed, create/rotate automatically
 */
async function ensureCharacterOfWeekExists(): Promise<void> {
  try {
    const current = await getCurrentCharacterOfWeek();
    
    if (!current) {
      await rotateCharacterOfWeek("Initial setup");
      return;
    }
    
    // Check if current Character of the Week has expired
    const now = new Date();
    const endDate = new Date(current.endDate);
    
    if (now >= endDate) {
      await rotateCharacterOfWeek("Startup rotation (expired)");
    }
  } catch (error) {
    logger.error(
      "init-agenda",
      `Error ensuring Character of the Week exists: ${error instanceof Error ? error.message : String(error)}`
    );
    // Don't throw - allow server to start even if this fails
  }
}

/**
 * Check if Agenda is initialized
 */
export function isAgendaInitialized(): boolean {
  return isInitialized;
}
