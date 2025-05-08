import { NewsChannel, TextChannel } from "discord.js";

import { WeatherForecast } from "./weather/WeatherForecast";

export interface WeatherCache {
  Rudania: WeatherForecast | null;
  Inariko: WeatherForecast | null;
  Vhintl: WeatherForecast | null;
  channels: {
    Rudania: TextChannel | NewsChannel;
    Inariko: TextChannel | NewsChannel;
    Vhintl: TextChannel | NewsChannel;
  };
}
