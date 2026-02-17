/**
 * Google Cloud Storage Upload Service
 * Handles uploading OC character images (icons and app art) to GCS buckets
 */

import { Storage, Bucket } from "@google-cloud/storage";
import { logger } from "@/utils/logger";
import { v4 as uuidv4 } from "uuid";

interface GCSConfig {
  projectId: string;
  bucketName: string;
  keyFilePath?: string;
  credentials?: string;
  publicUrl?: string;
  region?: string;
}

interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  makePublic?: boolean;
}

interface UploadResult {
  url: string;
  path: string;
  size: number;
}

class GCSUploadService {
  private storage: Storage | null = null;
  private bucket: Bucket | null = null;
  private config: GCSConfig | null = null;
  private publicUrlBase: string = "";

  /**
   * Initialize GCS client and bucket
   */
  private initialize(): void {
    if (this.storage && this.bucket) {
      return; // Already initialized
    }

    // Support both GCP_* and GCS_* prefixes for compatibility
    const projectId = process.env.GCP_PROJECT_ID || process.env.GCS_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
    const bucketName = process.env.GCP_BUCKET_NAME || process.env.GCS_BUCKET_NAME;
    const keyFilePath = process.env.GCS_KEY_FILE_PATH;
    const credentialsJson = process.env.GCS_CREDENTIALS;
    const publicUrl = process.env.GCS_PUBLIC_URL || process.env.GCP_PUBLIC_URL;

    if (!projectId || !bucketName) {
      throw new Error(
        "GCS configuration missing: GCP_PROJECT_ID (or GCS_PROJECT_ID) and GCP_BUCKET_NAME (or GCS_BUCKET_NAME) are required"
      );
    }

    this.config = {
      projectId,
      bucketName,
      keyFilePath,
      credentials: credentialsJson,
      publicUrl,
    };

    // Initialize Storage client
    if (keyFilePath) {
      // Option 1: Use key file path
      this.storage = new Storage({
        projectId,
        keyFilename: keyFilePath,
      });
    } else if (credentialsJson) {
      // Option 2: Use credentials JSON string
      try {
        const credentials = JSON.parse(credentialsJson);
        this.storage = new Storage({
          projectId,
          credentials,
        });
      } catch (error) {
        throw new Error(
          `Failed to parse GCS_CREDENTIALS: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else if (
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.GOOGLE_CLIENT_EMAIL
    ) {
      // Option 3: Construct credentials from individual Google service account fields
      const credentials = {
        type: "service_account",
        project_id: projectId,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID || "",
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL || "",
      };
      this.storage = new Storage({
        projectId,
        credentials,
      });
    } else {
      // Option 4: Use default credentials (for environments like GCP, Cloud Run, etc.)
      this.storage = new Storage({
        projectId,
      });
    }

    // Get bucket reference
    this.bucket = this.storage.bucket(bucketName);

    // Set public URL base
    if (publicUrl) {
      this.publicUrlBase = publicUrl.endsWith("/")
        ? publicUrl.slice(0, -1)
        : publicUrl;
    } else {
      // Default to standard GCS public URL format
      this.publicUrlBase = `https://storage.googleapis.com/${bucketName}`;
    }
  }

  /**
   * Generate a unique file path for an OC image
   * Format matches old system:
   * - Icons: character-icons/{uuidv4()}{fileExtension}
   * - AppArt: character-appart/{uuidv4()}{fileExtension}
   */
  private generateFilePath(
    userId: string,
    characterId: string | null,
    type: "icon" | "appArt",
    originalFilename: string
  ): string {
    const uuid = uuidv4();
    const ext = originalFilename.split(".").pop() || "png";
    const fileExtension = ext ? `.${ext}` : ".png";
    
    // Match old folder structure
    if (type === "icon") {
      return `character-icons/${uuid}${fileExtension}`;
    } else {
      return `character-appart/${uuid}${fileExtension}`;
    }
  }

  /**
   * Upload a file to GCS
   */
  async uploadFile(
    file: globalThis.File | Buffer,
    userId: string,
    characterId: string | null,
    type: "icon" | "appArt",
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    try {
      this.initialize();

      if (!this.bucket) {
        throw new Error("GCS bucket not initialized");
      }

      // Convert File to Buffer if needed
      let buffer: Buffer;
      let filename: string;
      let contentType: string;

      if (file instanceof File) {
        buffer = Buffer.from(await file.arrayBuffer());
        filename = file.name;
        contentType = file.type || options.contentType || "image/png";
      } else {
        buffer = file;
        filename = `upload-${Date.now()}.png`;
        contentType = options.contentType || "image/png";
      }

      // Generate file path
      const filePath = this.generateFilePath(userId, characterId, type, filename);

      // Create GCS file reference
      const gcsFile = this.bucket.file(filePath);

      // Upload options
      const uploadOptions: {
        metadata: {
          contentType: string;
          metadata?: Record<string, string>;
        };
        resumable: boolean;
        public?: boolean;
      } = {
        metadata: {
          contentType,
          ...(options.metadata && { metadata: options.metadata }),
        },
        resumable: false, // Use simple upload for smaller files
      };

      // Upload buffer to GCS
      await gcsFile.save(buffer, uploadOptions);

      // Make file public if requested
      // Note: Skip if uniform bucket-level access is enabled (bucket policy controls access)
      if (options.makePublic !== false) {
        // Default to making files public for OC images
        try {
          await gcsFile.makePublic();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          // Only log as warning if it's not the uniform bucket-level access error (expected behavior)
          if (!errorMessage.includes("uniform bucket-level access")) {
            logger.warn(
              "gcsUploadService",
              `Failed to make file public: ${errorMessage}`
            );
          }
          // Continue even if making public fails - URL will work if bucket has public access
        }
      }

      // Construct public URL
      const url = `${this.publicUrlBase}/${filePath}`;

      return {
        url,
        path: filePath,
        size: buffer.length,
      };
    } catch (error) {
      logger.error(
        "gcsUploadService",
        `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Upload multiple files (icon and appArt)
   */
  async uploadCharacterImages(
    iconFile: globalThis.File | Buffer,
    appArtFile: globalThis.File | Buffer,
    userId: string,
    characterId: string | null
  ): Promise<{ icon: UploadResult; appArt: UploadResult }> {
    const [icon, appArt] = await Promise.all([
      this.uploadFile(iconFile, userId, characterId, "icon"),
      this.uploadFile(appArtFile, userId, characterId, "appArt"),
    ]);

    return { icon, appArt };
  }

  /**
   * Upload expedition path image (drawn by user). Overwrites existing.
   * Path: maps/path-images/{partyId}/{squareId}.png
   */
  async uploadPathImage(
    file: globalThis.File | Buffer,
    partyId: string,
    squareId: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    try {
      this.initialize();
      if (!this.bucket) throw new Error("GCS bucket not initialized");

      const safePartyId = String(partyId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "unknown";
      const safeSquareId = String(squareId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "A1";
      const filePath = `maps/path-images/${safePartyId}/${safeSquareId}.png`;

      let buffer: Buffer;
      let contentType: string;
      if (file instanceof File) {
        buffer = Buffer.from(await file.arrayBuffer());
        contentType = file.type || options.contentType || "image/png";
      } else {
        buffer = file;
        contentType = options.contentType || "image/png";
      }

      const gcsFile = this.bucket.file(filePath);
      await gcsFile.save(buffer, {
        metadata: {
          contentType,
          ...(options.metadata && { metadata: options.metadata }),
        },
        resumable: false,
      });

      if (options.makePublic !== false) {
        try {
          await gcsFile.makePublic();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("uniform bucket-level access")) {
            logger.warn("gcsUploadService", `Failed to make path image public: ${msg}`);
          }
        }
      }

      const url = `${this.publicUrlBase}/${filePath}`;
      return { url, path: filePath, size: buffer.length };
    } catch (error) {
      logger.error(
        "gcsUploadService",
        `Failed to upload path image: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Upload relic art image for Library Archives. Path: relics/{relicId}.png
   * relicId is the MongoDB _id (string) to avoid collisions.
   */
  async uploadRelicImage(
    file: globalThis.File | Buffer,
    relicId: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    try {
      this.initialize();
      if (!this.bucket) throw new Error("GCS bucket not initialized");

      const safeId = String(relicId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "relic";
      const filePath = `relics/${safeId}.png`;

      let buffer: Buffer;
      let contentType: string;
      if (file instanceof File) {
        buffer = Buffer.from(await file.arrayBuffer());
        contentType = file.type || options.contentType || "image/png";
      } else {
        buffer = file;
        contentType = options.contentType || "image/png";
      }

      const gcsFile = this.bucket.file(filePath);
      await gcsFile.save(buffer, {
        metadata: {
          contentType,
          ...(options.metadata && { metadata: options.metadata }),
        },
        resumable: false,
      });

      if (options.makePublic !== false) {
        try {
          await gcsFile.makePublic();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("uniform bucket-level access")) {
            logger.warn("gcsUploadService", `Failed to make relic image public: ${msg}`);
          }
        }
      }

      const url = `${this.publicUrlBase}/${filePath}`;
      return { url, path: filePath, size: buffer.length };
    } catch (error) {
      logger.error(
        "gcsUploadService",
        `Failed to upload relic image: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Delete a file from GCS
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      this.initialize();

      if (!this.bucket) {
        throw new Error("GCS bucket not initialized");
      }

      const gcsFile = this.bucket.file(filePath);
      await gcsFile.delete();
    } catch (error) {
      logger.error(
        "gcsUploadService",
        `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Check if GCS is configured
   */
  isConfigured(): boolean {
    try {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.GCS_PROJECT_ID ||
        process.env.GOOGLE_PROJECT_ID;
      const bucketName = process.env.GCP_BUCKET_NAME || process.env.GCS_BUCKET_NAME;
      return !!(projectId && bucketName);
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const gcsUploadService = new GCSUploadService();
export type { UploadResult, UploadOptions };
