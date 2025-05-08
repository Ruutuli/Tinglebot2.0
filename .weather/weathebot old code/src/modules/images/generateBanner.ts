import { AttachmentData } from "../../interfaces/commands/AttachmentData";
import { WeatherForecast } from "../../interfaces/weather/WeatherForecast";

import { getBannerImage } from "./getBannerImage";
import { getOverlayImage } from "./getOverlayImage";
import { overlayImages } from "./overlayImages";

/**
 * Generates the banner image. If an overlay is available, constructs a new banner image by overlaying the overlay on the banner.
 * Otherwise, returns the banner itself.
 *
 * @param {WeatherForecast} forecast The weather forecast.
 * @returns {AttachmentData} The banner image attachment data.
 */
export const generateBanner = async (
  forecast: WeatherForecast
): Promise<AttachmentData> => {
  const background = getBannerImage(forecast.region);
  const overlayQuery =
    forecast.special?.name === "Blight Rain"
      ? "Blight Rain"
      : forecast.precipitation?.name;

  if (!overlayQuery) {
    return background;
  }

  const overlayPath = getOverlayImage(overlayQuery);

  if (!overlayPath) {
    return background;
  }

  const overlay = await overlayImages(background.filePath, overlayPath);

  return overlay;
};
