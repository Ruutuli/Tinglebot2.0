/**
 * Character of the Week rotation job definition
 * Runs every Sunday at 05:00 UTC (midnight EST)
 */

import type { Job } from "agenda";
import { getAgenda, waitForAgendaReady } from "@/lib/agenda";
import { rotateCharacterOfWeek } from "@/lib/character-of-week";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";

const JOB_NAME = "character-of-week-rotation";
const JOB_SCHEDULE = "0 5 * * 0"; // Every Sunday at 05:00 UTC (midnight EST)

/**
 * Job handler. Locking and same-week idempotency live inside rotateCharacterOfWeek.
 */
async function handleRotation(job: Job) {
  await connect();
  try {
    await rotateCharacterOfWeek("Weekly rotation");
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
 * Cancels any existing jobs with this name first to prevent duplicates when
 * init runs from multiple processes (e.g. instrumentation + API route, or multiple replicas).
 */
export async function defineRotationJob(): Promise<void> {
  // Wait for Agenda to be ready before scheduling jobs
  await waitForAgendaReady();
  
  const agenda = await getAgenda();
  
  // Cancel any existing jobs - prevents duplicates when init runs from multiple processes
  const cancelled = await agenda.cancel({ name: JOB_NAME });
  if (cancelled) {
    logger.info("character-of-week-rotation", `Cancelled ${cancelled} existing job(s) before re-scheduling`);
  }
  
  // Define the job
  agenda.define(JOB_NAME, handleRotation);
  
  // Schedule the job to run every Sunday at 05:00 UTC
  await agenda.every(JOB_SCHEDULE, JOB_NAME);
}

/**
 * Manually trigger the rotation job (for testing or manual execution)
 */
export async function triggerRotationJob(): Promise<void> {
  const agenda = await getAgenda();
  await agenda.now(JOB_NAME, {});
}
