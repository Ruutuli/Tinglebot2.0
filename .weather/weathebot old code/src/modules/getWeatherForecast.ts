import { temperatures } from "../data/weather/temperatures";
import { winds } from "../data/weather/winds";
import { RegionName } from "../interfaces/weather/names/RegionName";
import { WeatherForecast } from "../interfaces/weather/WeatherForecast";
import { errorHandler } from "../utils/errorHandler";

import { getRandomValue } from "./getRandomValue";
import { getPrecipitation } from "./weather/getPrecipitation";
import { getRegionRestrictions } from "./weather/getRegionRestrictions";
import { getSeason } from "./weather/getSeason";
import { getSpecial } from "./weather/getSpecial";

/**
 * Generates a weather forecast for the specified region, using the current
 * date to determine the season.
 *
 * @param {RegionName} region The name of the region to forecast for.
 * @returns {WeatherForecast | null} The weather forecast.
 */
export const getWeatherForecast = (
  region: RegionName
): WeatherForecast | null => {
  try {
    const season = getSeason();
    const allowedWeather = getRegionRestrictions(region, season);

    if (!allowedWeather) {
      return null;
    }

    const tempName = getRandomValue(allowedWeather.temps);
    const temperature = temperatures.find((el) => el.name === tempName);
    const windName = getRandomValue(allowedWeather.wind, "low");
    const wind = winds.find((el) => el.name === windName);

    if (!temperature || !wind) {
      return null;
    }

    const precipitation = getPrecipitation(allowedWeather, tempName, windName);
    const special = getSpecial(
      allowedWeather,
      tempName,
      windName,
      precipitation?.name
    );

    return { region, season, temperature, wind, precipitation, special };
  } catch (err) {
    errorHandler(err, "get weather forecast");
    return null;
  }
};
