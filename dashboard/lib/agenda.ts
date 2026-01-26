/**
 * Agenda job scheduler setup
 * Handles MongoDB-backed job scheduling for Character of the Week rotation
 */

import Agenda from "agenda";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined. Add it to your .env file.");
  }
  return uri;
}

// Create Agenda instance
let agendaInstance: Agenda | null = null;

/**
 * Initialize and return Agenda instance
 * Uses singleton pattern to ensure only one instance exists
 */
export async function getAgenda(): Promise<Agenda> {
  if (agendaInstance) {
    return agendaInstance;
  }
  
  // Ensure database connection
  await connect();
  
  const mongoUri = getMongoUri();
  
  // Create Agenda instance with MongoDB connection
  agendaInstance = new Agenda({
    db: {
      address: mongoUri,
      collection: "agendaJobs",
    },
    processEvery: "30 seconds", // Check for jobs every 30 seconds
    maxConcurrency: 1, // Only process one job at a time
    defaultConcurrency: 1,
  });
  
  // Handle Agenda events
  agendaInstance.on("ready", () => {
    logger.success("agenda", "Agenda scheduler is ready");
  });
  
  agendaInstance.on("error", (error) => {
    logger.error("agenda", `Agenda error: ${error.message}`);
  });
  
  agendaInstance.on("start", (job) => {
    logger.info("agenda", `Job ${job.attrs.name} starting`);
  });
  
  agendaInstance.on("complete", (job) => {
    logger.success("agenda", `Job ${job.attrs.name} completed`);
  });
  
  agendaInstance.on("fail", (error, job) => {
    logger.error(
      "agenda",
      `Job ${job.attrs.name} failed: ${error.message}`
    );
  });
  
  return agendaInstance;
}

/**
 * Start Agenda scheduler
 */
export async function startAgenda(): Promise<void> {
  const agenda = await getAgenda();
  await agenda.start();
  logger.success("agenda", "Agenda scheduler started");
}

/**
 * Stop Agenda scheduler gracefully
 */
export async function stopAgenda(): Promise<void> {
  if (agendaInstance) {
    await agendaInstance.stop();
    agendaInstance = null;
    logger.info("agenda", "Agenda scheduler stopped");
  }
}

/**
 * Get the Agenda instance (may be null if not initialized)
 */
export function getAgendaInstance(): Agenda | null {
  return agendaInstance;
}
