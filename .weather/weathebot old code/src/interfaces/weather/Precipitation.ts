import { PrecipitationName } from "./names/PrecipitationName";
import { TemperatureName } from "./names/TemperatureName";
import { WindName } from "./names/WindName";

export interface Precipitation {
  name: PrecipitationName;
  temps: TemperatureName[] | "any";
  winds: WindName[] | "any";
  emote: string;
}
