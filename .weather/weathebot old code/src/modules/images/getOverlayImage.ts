import { join } from "path";

import { PrecipitationName } from "../../interfaces/weather/names/PrecipitationName";
import { SpecialName } from "../../interfaces/weather/names/SpecialName";

/**
 * Checks if the current weather conditions have an overlay.
 *
 * @param {SpecialName | PrecipitationName} name The name of the weather condition to look for.
 * @returns {string | null} The file path to the overlay, or null if there is no overlay.
 */
export const getOverlayImage = (
  name: SpecialName | PrecipitationName
): string | null => {
  let fileName = null;
  switch (name) {
    case "Blight Rain":
      fileName = "ROOTS-blightrain.png";
      break;
    case "Blizzard":
      fileName = "ROOTS-blizzard.png";
      break;
    case "Cinder Storm":
      fileName = "ROOTS-cinderstorm.png";
      break;
    case "Cloudy":
    case "Partly Cloudy":
      fileName = "ROOTS-cloudy.png";
      break;
    case "Fog":
      fileName = "ROOTS-fog.png";
      break;
    case "Hail":
      fileName = "ROOTS-hail.png";
      break;
    case "Heat Lightning":
      fileName = "ROOTS-heatlightning.png";
      break;
    case "Rain":
    case "Light Rain":
    case "Heavy Rain":
      fileName = "ROOTS-rain.png";
      break;
    case "Rainbow":
      fileName = "ROOTS-rainbow.png";
      break;
    case "Sleet":
      fileName = "ROOTS-sleet.png";
      break;
    case "Snow":
    case "Light Snow":
    case "Heavy Snow":
      fileName = "ROOTS-snow.png";
      break;
    case "Thundersnow":
      fileName = "ROOTS-thundersnow.png";
      break;
    case "Thunderstorm":
      fileName = "ROOTS-thunderstorm.png";
      break;
  }
  if (!fileName) {
    return null;
  }

  const filePath = join(process.cwd(), "src", "assets", "overlays", fileName);
  return filePath;
};
