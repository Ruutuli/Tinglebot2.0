import { MessageEmbed, MessagePayload } from "discord.js";

import { WeatherForecast } from "../interfaces/weather/WeatherForecast";

import { generateBanner } from "./images/generateBanner";
import { getSeasonIcon } from "./images/getSeasonIcon";

/**
 * Parses a weather forecast into a Discord message embed.
 *
 * @param {WeatherForecast} forecast The forecast to parse.
 * @returns {MessageEmbed} A Discord message embed.
 */
export const generateWeatherEmbed = async (
  forecast: WeatherForecast | null
): Promise<MessagePayload["options"]> => {
  if (!forecast) {
    const embed = new MessageEmbed()
      .setTitle("Error")
      .setDescription("No forecast was generated.");
    return { embeds: [embed] };
  }

  const weatherEmbed = new MessageEmbed();
  weatherEmbed.setTitle(`${forecast.region}'s Daily Weather Forecast`);

  let emoteString = forecast.temperature.emote + forecast.wind.emote;

  weatherEmbed.addField(
    "Temperature",
    `${forecast.temperature.fahrenheit}°F / ${forecast.temperature.celsius}°C [${forecast.temperature.name}]`
  );
  weatherEmbed.addField(
    "Wind",
    `${forecast.wind.name} [${forecast.wind.lowSpeed} - ${forecast.wind.highSpeed}kph]`
  );

  if (forecast.precipitation) {
    weatherEmbed.addField("Precipitation", `${forecast.precipitation.name}`);
    emoteString += forecast.precipitation.emote;
  }
  if (forecast.special) {
    weatherEmbed.addField("Description", `${forecast.special.description}`);
    emoteString += forecast.special.emote;
  }
  weatherEmbed.setDescription(emoteString);

  const seasonIcon = getSeasonIcon(forecast.season);
  weatherEmbed.setThumbnail(seasonIcon.attachmentString);
  const banner = await generateBanner(forecast);
  weatherEmbed.setImage(banner.attachmentString);

  switch (forecast.region) {
    case "Rudania":
      weatherEmbed.setColor("RED");
      break;
    case "Inariko":
      weatherEmbed.setColor("BLUE");
      break;
    case "Vhintl":
      weatherEmbed.setColor("GREEN");
      break;
  }

  return {
    embeds: [weatherEmbed],
    files: [seasonIcon.filePath, banner.filePath],
  };
};
