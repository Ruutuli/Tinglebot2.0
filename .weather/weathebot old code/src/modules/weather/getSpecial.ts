import { specials } from "../../data/weather/specials";
import { PrecipitationName } from "../../interfaces/weather/names/PrecipitationName";
import { TemperatureName } from "../../interfaces/weather/names/TemperatureName";
import { WindName } from "../../interfaces/weather/names/WindName";
import { RegionRestriction } from "../../interfaces/weather/regions/RegionRestriction";
import { Special } from "../../interfaces/weather/Special";
import { getRandomValue } from "../getRandomValue";

/**
 * Module to get a special weather event for a region. Checks if the temp, wind, and precipitation
 * allow for a special event. If so, has a 30% chance to trigger one.
 *
 * @param {RegionRestriction} options The allowed weather for the region + season.
 * @param {TemperatureName} temp The current temperature.
 * @param {WindName} wind The current wind.
 * @param {PrecipitationName | undefined} precipitation The current precipitation.
 * @returns {Special | null} The special event, or null if there are no valid forecasts.
 */
export const getSpecial = (
  options: RegionRestriction,
  temp: TemperatureName,
  wind: WindName,
  precipitation: PrecipitationName | undefined
): Special | null => {
  const restrictedSpecial = specials.filter((el) =>
    options.special.includes(el.name)
  );
  const validSpecials = precipitation
    ? restrictedSpecial.filter(
        (el) =>
          (el.temps.includes(temp) || el.temps === "any") &&
          (el.winds.includes(wind) || el.winds === "any") &&
          (el.precipitations.includes(precipitation) ||
            el.precipitations === "any")
      )
    : restrictedSpecial.filter(
        (el) =>
          (el.temps.includes(temp) || el.temps === "any") &&
          (el.winds.includes(wind) || el.winds === "any")
      );

  if (!validSpecials.length) {
    return null;
  }

  const shouldSpecialTrigger = Math.floor(Math.random() * 100) < 30;

  if (!shouldSpecialTrigger) {
    return null;
  }

  return getRandomValue(validSpecials);
};
