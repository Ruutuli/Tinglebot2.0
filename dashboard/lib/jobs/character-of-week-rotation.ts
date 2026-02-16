/**
 * Character of the Week rotation job definition
 * Runs every Sunday at 05:00 UTC (midnight EST)
 */

import type { Job } from "agenda";
import { getAgenda, waitForAgendaReady } from "@/lib/agenda";
import { rotateCharacterOfWeek } from "@/lib/character-of-week";
import { connect } from "@/lib/db";
import { tryAcquireLock, releaseLock } from "@/lib/distributed-lock";
import { logger } from "@/utils/logger";

const JOB_NAME = "character-of-week-rotation";
const JOB_SCHEDULE = "0 5 * * 0"; // Every Sunday at 05:00 UTC (midnight EST)
const ROTATION_LOCK_KEY = "character-of-week-rotation-run";
const ROTATION_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes - enough for one rotation

/**
 * Job handler function. Uses a distributed lock so only one instance runs the rotation
 * even if multiple Agenda workers pick up the job (e.g. duplicate job entries).
 */
async function handleRotation(job: Job) {
  await connect(); // Ensure DB connection for lock
  const acquired = await tryAcquireLock(ROTATION_LOCK_KEY, ROTATION_LOCK_TTL_MS);
  if (!acquired) {
    logger.info(
      "character-of-week-rotation",
      "Another instance is running rotation, skipping (idempotency)"
    );
    return;
  }

  try {
    await rotateCharacterOfWeek("Weekly rotation");
  } catch (error) {
    logger.error(
      "character-of-week-rotation",
      `Rotation job failed: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error; // Re-throw to mark job as failed
  } finally {
    await releaseLock(ROTATION_LOCK_KEY);
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
