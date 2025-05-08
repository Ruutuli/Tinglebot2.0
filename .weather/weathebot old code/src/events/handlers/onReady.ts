import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { Client, WebhookClient } from "discord.js";

import { CommandList } from "../../commands/_CommandList";
import { WeatherCache } from "../../interfaces/WeatherCache";
import { scheduleForecasts } from "../../modules/scheduleForecasts";
import { logHandler } from "../../utils/logHandler";

/**
 * Handler for the READY event from Discord. Logs that the bot is connected,
 * then registers the guild slash commands.
 *
 * @param {Client} BOT The bot's Discord instance.
 * @param {WeatherCache} CACHE The cache of weather data.
 */
export const onReady = async (BOT: Client, CACHE: WeatherCache) => {
  const webhook = new WebhookClient({ url: process.env.DEBUG_HOOK as string });

  await webhook.send("Ruu Bot is online!");
  logHandler.log("info", "Connected to Discord!");

  const rest = new REST({ version: "9" }).setToken(
    process.env.DISCORD_TOKEN as string
  );

  const commandData = CommandList.map((command) => command.data.toJSON());

  await rest.put(
    Routes.applicationGuildCommands(
      BOT.user?.id || "oopsie whoopsie",
      process.env.HOME_GUILD_ID as string
    ),
    { body: commandData }
  );

  logHandler.log("info", "Registered commands!");

  scheduleForecasts(CACHE);
};
