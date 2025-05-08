import { RewriteFrames } from "@sentry/integrations";
import * as Sentry from "@sentry/node";
import { Client } from "discord.js";

import { IntentOptions } from "./config/IntentOptions";
import { handleEvents } from "./events/handleEvents";
import { WeatherCache } from "./interfaces/WeatherCache";
import { getWeatherForecast } from "./modules/getWeatherForecast";
import { loadChannels } from "./modules/loadChannels";
import { errorHandler } from "./utils/errorHandler";

(async () => {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    integrations: [
      new RewriteFrames({
        root: global.__dirname,
      }),
    ],
  });

  const BOT = new Client({ intents: IntentOptions });

  const CACHE: WeatherCache = {
    Rudania: getWeatherForecast("Rudania"),
    Inariko: getWeatherForecast("Inariko"),
    Vhintl: getWeatherForecast("Vhintl"),
    channels: await loadChannels(BOT),
  };

  handleEvents(BOT, CACHE);

  await BOT.login(process.env.DISCORD_TOKEN as string).catch(
    async (err) => await errorHandler(err, "login")
  );
})();
