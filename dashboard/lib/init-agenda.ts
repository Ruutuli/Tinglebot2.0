/**
 * Initialize Agenda and Character of the Week system
 * Sets up jobs and ensures a Character of the Week exists
 */

import { startAgenda } from "@/lib/agenda";
import { defineRotationJob } from "@/lib/jobs/character-of-week-rotation";
import { getCurrentCharacterOfWeek, rotateCharacterOfWeek } from "@/lib/character-of-week";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";

let isInitialized = false;

/**
 * Initialize Agenda scheduler and Character of the Week system
 * This should be called once on server startup
 */
export async function initializeAgenda(): Promise<void> {
  if (isInitialized) {
    logger.warn("init-agenda", "Agenda already initialized, skipping");
    return;
  }
  
  try {
    logger.info("init-agenda", "Initializing Agenda scheduler...");
    
    // Ensure database connection
    await connect();
    
    // Start Agenda
    await startAgenda();
    
    // Define and schedule the rotation job
    await defineRotationJob();
    
    // Check if Character of the Week exists, create/rotate if needed
    await ensureCharacterOfWeekExists();
    
    isInitialized = true;
    logger.success("init-agenda", "Agenda initialization completed");
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
      logger.info("init-agenda", "No Character of the Week found, creating initial one...");
      await rotateCharacterOfWeek("Initial setup");
      logger.success("init-agenda", "Initial Character of the Week created");
      return;
    }
    
    // Check if current Character of the Week has expired
    const now = new Date();
    const endDate = new Date(current.endDate);
    
    if (now >= endDate) {
      logger.info(
        "init-agenda",
        `Current Character of the Week expired (ended ${endDate.toISOString()}), rotating...`
      );
      await rotateCharacterOfWeek("Startup rotation (expired)");
      logger.success("init-agenda", "Character of the Week rotated on startup");
    } else {
      logger.info(
        "init-agenda",
        `Character of the Week exists: ${current.characterName} (ends ${endDate.toISOString()})`
      );
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
