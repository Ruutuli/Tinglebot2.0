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

    // Initialize Agenda scheduler (non-blocking)
    // Don't await - let it initialize in the background so server can start
    import("./lib/init-agenda")
      .then(({ initializeAgenda }) => initializeAgenda())
      .catch((error) => {
        console.error("Failed to initialize Agenda:", error);
        // Don't throw - allow server to start even if Agenda init fails
      });
  }
}
