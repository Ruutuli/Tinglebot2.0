/**
 * Next.js Instrumentation Hook
 * This file runs once when the server starts
 * Used to initialize Agenda scheduler and display startup banner
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Only run on Node.js runtime (not Edge)
    
    // Display fancy startup banner
    try {
      const { printStartupBanner } = await import("./lib/startup-banner");
      printStartupBanner();
    } catch (error) {
      console.error("Failed to display startup banner:", error);
    }

    // Initialize Agenda scheduler
    try {
      const { initializeAgenda } = await import("./lib/init-agenda");
      await initializeAgenda();
    } catch (error) {
      console.error("Failed to initialize Agenda:", error);
      // Don't throw - allow server to start even if Agenda init fails
    }
  }
}
