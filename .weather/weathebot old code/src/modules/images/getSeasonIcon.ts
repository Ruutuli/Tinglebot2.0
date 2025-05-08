import { join } from "path";

import { AttachmentData } from "../../interfaces/commands/AttachmentData";
import { Season } from "../../interfaces/weather/names/Season";

/**
 * Module to generate the season icon attachment.
 *
 * @param {Season} season The season.
 * @returns {AttachmentData} The icon attachment data.
 */
export const getSeasonIcon = (season: Season): AttachmentData => {
  const fileName = `${season.toLowerCase()}.png`;
  const filePath = join(process.cwd(), "src", "assets", "seasons", fileName);
  return {
    attachmentString: `attachment://${fileName}`,
    filePath,
  };
};
