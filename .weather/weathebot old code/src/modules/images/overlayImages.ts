import { join } from "path";

import sharp from "sharp";

import { AttachmentData } from "../../interfaces/commands/AttachmentData";

/**
 * Module to combine an overlay and a banner.
 *
 * @param {string} banner The file path for the banner.
 * @param {string} overlay The file path for the overlay.
 * @returns {AttachmentData} The attachment data for the new banner.
 */
export const overlayImages = async (
  banner: string,
  overlay: string
): Promise<AttachmentData> => {
  await sharp(banner)
    .composite([{ input: overlay, gravity: "center" }])
    .toFile(join(process.cwd(), "src", "assets", "overlay.png"));
  return {
    attachmentString: `attachment://overlay.png`,
    filePath: join(process.cwd(), "src", "assets", "overlay.png"),
  };
};
