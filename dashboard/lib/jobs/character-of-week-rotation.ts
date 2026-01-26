/**
 * Character of the Week rotation job definition
 * Runs every Sunday at 05:00 UTC (midnight EST)
 */

import type { Job } from "agenda";
import { getAgenda, waitForAgendaReady } from "@/lib/agenda";
import { rotateCharacterOfWeek } from "@/lib/character-of-week";
import { logger } from "@/utils/logger";

const JOB_NAME = "character-of-week-rotation";
const JOB_SCHEDULE = "0 5 * * 0"; // Every Sunday at 05:00 UTC (midnight EST)

/**
 * Job handler function
 */
async function handleRotation(job: Job) {
  try {
    logger.info("character-of-week-rotation", "Starting weekly rotation job");
    await rotateCharacterOfWeek("Weekly rotation");
    logger.success("character-of-week-rotation", "Weekly rotation completed successfully");
  } catch (error) {
    logger.error(
      "character-of-week-rotation",
      `Rotation job failed: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error; // Re-throw to mark job as failed
  }
}

/**
 * Define and schedule the Character of the Week rotation job
 */
export async function defineRotationJob(): Promise<void> {
  // Wait for Agenda to be ready before scheduling jobs
  await waitForAgendaReady();
  
  const agenda = await getAgenda();
  
  // Define the job
  agenda.define(JOB_NAME, handleRotation);
  
  // Schedule the job to run every Sunday at 05:00 UTC
  await agenda.every(JOB_SCHEDULE, JOB_NAME);
  
  logger.success(
    "character-of-week-rotation",
    `Scheduled ${JOB_NAME} to run ${JOB_SCHEDULE}`
  );
}

/**
 * Manually trigger the rotation job (for testing or manual execution)
 */
export async function triggerRotationJob(): Promise<void> {
  const agenda = await getAgenda();
  await agenda.now(JOB_NAME);
  logger.info("character-of-week-rotation", "Manually triggered rotation job");
}
