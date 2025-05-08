import { precipitations } from "../../data/weather/precipitations";
import { TemperatureName } from "../../interfaces/weather/names/TemperatureName";
import { WindName } from "../../interfaces/weather/names/WindName";
import { Precipitation } from "../../interfaces/weather/Precipitation";
import { RegionRestriction } from "../../interfaces/weather/regions/RegionRestriction";
import { getRandomValue } from "../getRandomValue";

/**
 *
 * @param {RegionRestriction} options The allowed weather for the region + season.
 * @param {TemperatureName} temp The current temperature.
 * @param {WindName} wind The current wind.
 * @returns {Precipitation | null} The precipitation, or null if there are no valid forecasts.
 */
export const getPrecipitation = (
  options: RegionRestriction,
  temp: TemperatureName,
  wind: WindName
): Precipitation | null => {
  const restrictedPrecipitation = precipitations.filter((el) =>
    options.precipitation.includes(el.name)
  );
  const validPrecipitations = restrictedPrecipitation.filter(
    (el) =>
      (el.temps.includes(temp) || el.temps === "any") &&
      (el.winds.includes(wind) || el.winds === "any")
  );

  if (!validPrecipitations.length) {
    return null;
  }

  return getRandomValue(validPrecipitations);
};
