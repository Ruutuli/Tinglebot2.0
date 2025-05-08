import { scheduleJob } from "node-schedule";

import { WeatherCache } from "../interfaces/WeatherCache";
import { errorHandler } from "../utils/errorHandler";
import { logHandler } from "../utils/logHandler";

import { generateWeatherEmbed } from "./generateWeatherEmbed";
import { getWeatherForecast } from "./getWeatherForecast";

/**
 * Schedules a CRON job for sending weather forecasts to the appropriate channels.
 *
 * @param {WeatherCache} CACHE The weather cache.
 */
export const scheduleForecasts = (CACHE: WeatherCache) => {
  logHandler.log("info", "Scheduling weather forecasts...");
  // Run daily at 5AM PST to get 8AM EST.
  scheduleJob("0 0 5 * * *", async () => {
    try {
      CACHE.Rudania = getWeatherForecast("Rudania");
      CACHE.Inariko = getWeatherForecast("Inariko");
      CACHE.Vhintl = getWeatherForecast("Vhintl");

      const rudania = await generateWeatherEmbed(CACHE.Rudania);
      await CACHE.channels.Rudania.send(rudania);
      const inariko = await generateWeatherEmbed(CACHE.Inariko);
      await CACHE.channels.Inariko.send(inariko);
      const vhintl = await generateWeatherEmbed(CACHE.Vhintl);
      await CACHE.channels.Vhintl.send(vhintl);
    } catch (err) {
      const errorId = await errorHandler(err, "scheduled forecast");
      await CACHE.channels.Rudania.send(errorId);
    }
  });
};
