import { Client } from "discord.js";

import { WeatherCache } from "../interfaces/WeatherCache";

import { onInteraction } from "./handlers/onInteraction";
import { onReady } from "./handlers/onReady";

/**
 * Mounts listeners for the Discord gateway events.
 *
 * @param {Client} BOT The bot's discord instance.
 * @param { WeatherCache } CACHE The cache of weather data.
 */
export const handleEvents = (BOT: Client, CACHE: WeatherCache) => {
  BOT.on("ready", async () => await onReady(BOT, CACHE));

  BOT.on(
    "interactionCreate",
    async (interaction) => await onInteraction(interaction, CACHE)
  );
};
