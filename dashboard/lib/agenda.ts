/**
 * Agenda job scheduler setup
 * Handles MongoDB-backed job scheduling for Character of the Week rotation
 */

import Agenda from "agenda";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";

function getMongoUri(): string {
  const uri =
    process.env.MONGODB_TINGLEBOT_URI ||
    process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_TINGLEBOT_URI or MONGODB_URI must be defined. Add to your .env file."
    );
  }
  return uri;
}

// Create Agenda instance
let agendaInstance: Agenda | null = null;
let isAgendaReady = false;

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
    isAgendaReady = true;
  });
  
  agendaInstance.on("error", (error) => {
    logger.error("agenda", `Agenda error: ${error.message}`);
  });
  
  agendaInstance.on("start", (job) => {
    // Only log job starts in debug mode
  });
  
  agendaInstance.on("complete", (job) => {
    // Only log job completions in debug mode
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
 * Start Agenda scheduler and wait for it to be ready
 * Returns a promise that resolves when Agenda is ready to use
 */
export async function startAgenda(): Promise<void> {
  const agenda = await getAgenda();
  
  // Check if already ready
  if (isAgendaReady) {
    return;
  }
  
  return new Promise<void>((resolve) => {
    let resolved = false;
    
    // Set up timeout (don't fail, just log warning)
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        logger.warn("agenda", "Agenda ready event timed out after 15s, but continuing...");
        resolve();
      }
    }, 15000);
    
    // Function to clean up and resolve
    const onReady = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        isAgendaReady = true;
        resolve();
      }
    };
    
    // Set up ready listener before starting
    agenda.once("ready", onReady);
    
    // Start Agenda (this returns immediately, but we wait for "ready" event)
    agenda.start().catch((err) => {
      logger.warn("agenda", `Agenda start() error: ${err instanceof Error ? err.message : String(err)}`);
      // Continue waiting for ready event
    });
  });
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

/**
 * Wait for Agenda to be ready (useful before scheduling jobs)
 */
export async function waitForAgendaReady(): Promise<void> {
  if (isAgendaReady) {
    return;
  }
  
  const agenda = await getAgenda();
  
  return new Promise<void>((resolve) => {
    if (isAgendaReady) {
      resolve();
      return;
    }
    
    const timeout = setTimeout(() => {
      logger.warn("agenda", "Waiting for Agenda ready timed out, proceeding anyway...");
      resolve();
    }, 10000);
    
    agenda.once("ready", () => {
      clearTimeout(timeout);
      isAgendaReady = true;
      resolve();
    });
  });
}
