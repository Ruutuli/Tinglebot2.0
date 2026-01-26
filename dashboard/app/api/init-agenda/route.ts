/**
 * API route to initialize Agenda scheduler
 * This should be called once on server startup
 * For Railway deployment, this can be called via a startup script or health check
 */

import { NextResponse } from "next/server";
import { initializeAgenda, isAgendaInitialized } from "@/lib/init-agenda";
import { logger } from "@/utils/logger";

/**
 * POST /api/init-agenda
 * Initialize Agenda scheduler and Character of the Week system
 */
export async function POST() {
  try {
    if (isAgendaInitialized()) {
      return NextResponse.json({
        success: true,
        message: "Agenda already initialized",
      });
    }
    
    await initializeAgenda();
    
    return NextResponse.json({
      success: true,
      message: "Agenda initialized successfully",
    });
  } catch (error) {
    logger.error(
      "api/init-agenda",
      `Failed to initialize Agenda: ${error instanceof Error ? error.message : String(error)}`
    );
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to initialize Agenda",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/init-agenda
 * Check if Agenda is initialized
 */
export async function GET() {
  return NextResponse.json({
    initialized: isAgendaInitialized(),
  });
}
