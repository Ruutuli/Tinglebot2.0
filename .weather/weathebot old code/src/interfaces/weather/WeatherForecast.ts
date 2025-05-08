import { RegionName } from "./names/RegionName";
import { Season } from "./names/Season";
import { Precipitation } from "./Precipitation";
import { Special } from "./Special";
import { Temperature } from "./Temperature";
import { Wind } from "./Wind";

export interface WeatherForecast {
  region: RegionName;
  season: Season;
  temperature: Temperature;
  wind: Wind;
  precipitation: Precipitation | null;
  special: Special | null;
}
