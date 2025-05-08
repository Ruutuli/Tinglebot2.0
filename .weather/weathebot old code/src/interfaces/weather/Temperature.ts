import { TemperatureName } from "./names/TemperatureName";

export interface Temperature {
  fahrenheit: number;
  celsius: number;
  name: TemperatureName;
  emote: string;
}
