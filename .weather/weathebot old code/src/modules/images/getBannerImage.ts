import { join } from "path";

import { AttachmentData } from "../../interfaces/commands/AttachmentData";
import { RegionName } from "../../interfaces/weather/names/RegionName";

/**
 * Selects one of the random banner images from the banner folder.
 *
 * @param {RegionName} region The name of the region.
 * @returns {AttachmentData} The banner image attachment data.
 */
export const getBannerImage = (region: RegionName): AttachmentData => {
  const fileName = `${region}${Math.ceil(Math.random() * 3)}.png`;
  const filePath = join(process.cwd(), "src", "assets", "banners", fileName);
  return {
    attachmentString: `attachment://${fileName}`,
    filePath,
  };
};
