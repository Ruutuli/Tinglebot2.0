import { Client } from "discord.js";

import { WeatherCache } from "../interfaces/WeatherCache";
import { logHandler } from "../utils/logHandler";

/**
 * Module to fetch the configured channels for sending weather forecasts.
 *
 * @param {Client} BOT The bot's Discord instance.
 * @returns {WeatherCache["channels"]} The configured channels for sending weather forecasts.
 */
export const loadChannels = async (
  BOT: Client
): Promise<WeatherCache["channels"]> => {
  try {
    const guildId = process.env.HOME_GUILD_ID as string;
    const rudaniaId = process.env.RUDANIA_ID as string;
    const inarikoId = process.env.INARIKO_ID as string;
    const vhintlId = process.env.VHINTL_ID as string;

    const guild = await BOT.guilds.fetch(guildId);
    const Rudania = await guild.channels.fetch(rudaniaId);
    const Inariko = await guild.channels.fetch(inarikoId);
    const Vhintl = await guild.channels.fetch(vhintlId);

    if (
      !guild ||
      !Rudania ||
      !Inariko ||
      !Vhintl ||
      !("send" in Rudania && "send" in Inariko && "send" in Vhintl)
    ) {
      logHandler.log("error", "Cannot locate the forecast channels!");
      process.exit(1);
    }

    return { Rudania, Inariko, Vhintl };
  } catch (err) {
    logHandler.log("error", err);
    process.exit(1);
  }
};
