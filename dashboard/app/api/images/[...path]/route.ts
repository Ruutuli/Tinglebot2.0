import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { logger } from "@/utils/logger";

/**
 * GET /api/images/[...path] - Serve images from public directory or proxy from GCS.
 * Map square tiles (maps/squares/*) are never stored locally; they are always served from GCS.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const imagePath = resolvedParams.path.join("/");
    
    // If it's a GCS URL path, proxy it
    if (imagePath.startsWith("https://") || imagePath.startsWith("http://")) {
      try {
        const response = await fetch(imagePath);
        if (!response.ok) {
          return new NextResponse("Image not found", { status: 404 });
        }
        const imageBuffer = await response.arrayBuffer();
        const contentType = response.headers.get("content-type") || "image/png";
        
        return new NextResponse(imageBuffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      } catch (error) {
        logger.debug(
          "api/images/[...path] GET",
          `Error fetching external image: ${error instanceof Error ? error.message : String(error)}`
        );
        return new NextResponse("Error fetching image", { status: 500 });
      }
    }

    // Map square tiles are never stored locally – serve from GCS only (no filesystem check)
    if (imagePath.startsWith("maps/squares/")) {
      const segments = imagePath.split("/");
      const urlsToTry: string[] = [];
      urlsToTry.push(segments.map(s => encodeURIComponent(s)).join("/"));
      // Fallback: flat layout maps/squares/<filename>.png (e.g. .../MAP_0002s_0002s_0000_CIRCLE-RUDANIA-CYAN_G7.png)
      if (segments.length >= 3 && segments[0] === "maps" && segments[1] === "squares") {
        const filename = segments[segments.length - 1];
        urlsToTry.push(`maps/squares/${encodeURIComponent(filename)}`);
      }
      for (const encodedPath of urlsToTry) {
        const gcsUrl = `https://storage.googleapis.com/tinglebot/${encodedPath}`;
        try {
          const response = await fetch(gcsUrl, { cache: "no-store" });
          if (response.ok) {
            const imageBuffer = await response.arrayBuffer();
            const contentType = response.headers.get("content-type") || getContentType(path.extname(imagePath).toLowerCase());
            return new NextResponse(imageBuffer, {
              headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
          }
        } catch (error) {
          logger.debug(
            "api/images/[...path] GET",
            `Error fetching map image from GCS (${gcsUrl}): ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      return new NextResponse("Image not found", { status: 404 });
    }
    
    // Try to serve from public directory
    const publicPath = path.join(process.cwd(), "public", imagePath);
    
    // Check if file exists
    if (!fs.existsSync(publicPath)) {
      // Try with "Items" prefix if it's an item image (for paths like "ROTW_material_ancient_gear.png")
      const itemsPath = path.join(process.cwd(), "public", "Items", imagePath);
      if (fs.existsSync(itemsPath)) {
        const fileBuffer = fs.readFileSync(itemsPath);
        const ext = path.extname(itemsPath).toLowerCase();
        const contentType = getContentType(ext);
        
        return new NextResponse(fileBuffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
      
      // If not found locally, try fetching from GCS
      // Images from database are stored at https://storage.googleapis.com/tinglebot/{path}
      const encodedPath = imagePath.split("/").map(segment => encodeURIComponent(segment)).join("/");
      const gcsUrl = `https://storage.googleapis.com/tinglebot/${encodedPath}`;
      try {
        const response = await fetch(gcsUrl);
        if (response.ok) {
          const imageBuffer = await response.arrayBuffer();
          const contentType = response.headers.get("content-type") || getContentType(path.extname(imagePath).toLowerCase());
          
          return new NextResponse(imageBuffer, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        }
      } catch (error) {
        logger.debug(
          "api/images/[...path] GET",
          `Error fetching image from GCS (${gcsUrl}): ${error instanceof Error ? error.message : String(error)}`
        );
        // Fall through to 404
      }
      
      return new NextResponse("Image not found", { status: 404 });
    }
    
    // Read and serve the file
    const fileBuffer = fs.readFileSync(publicPath);
    const ext = path.extname(publicPath).toLowerCase();
    const contentType = getContentType(ext);
    
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    logger.error(
      "api/images/[...path] GET",
      `Error serving image: ${error instanceof Error ? error.message : String(error)}`
    );
    return new NextResponse("Internal server error", { status: 500 });
  }
}

function getContentType(ext: string): string {
  const contentTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  return contentTypes[ext] || "application/octet-stream";
}
