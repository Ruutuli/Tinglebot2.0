import { SlashCommandBuilder } from "@discordjs/builders";

import { ForecastChoices } from "../config/ForecastChoices";
import { Command } from "../interfaces/commands/Command";
import { RegionName } from "../interfaces/weather/names/RegionName";
import { generateWeatherEmbed } from "../modules/generateWeatherEmbed";
import { getWeatherForecast } from "../modules/getWeatherForecast";
import { errorHandler } from "../utils/errorHandler";

export const forecast: Command = {
  data: new SlashCommandBuilder()
    .setName("forecast")
    .setDescription("Get the weather forecast for a specific region.")
    .addStringOption((option) =>
      option
        .setName("region")
        .setDescription("The region to get a forecast for.")
        .setRequired(true)
        .addChoices(ForecastChoices)
    ),
  run: async (interaction, CACHE) => {
    try {
      await interaction.deferReply();
      const region = interaction.options.getString(
        "region",
        true
      ) as RegionName;
      const forecast = CACHE[region] || getWeatherForecast(region);
      const response = await generateWeatherEmbed(forecast);
      await interaction.editReply(response);
    } catch (err) {
      const response = await errorHandler(err, "forecast command");
      await interaction.editReply(response);
    }
  },
};
