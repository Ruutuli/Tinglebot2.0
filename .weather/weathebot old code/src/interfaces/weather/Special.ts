import { PrecipitationName } from "./names/PrecipitationName";
import { SpecialName } from "./names/SpecialName";
import { TemperatureName } from "./names/TemperatureName";
import { WindName } from "./names/WindName";

export interface Special {
  name: SpecialName;
  temps: TemperatureName[] | "any";
  winds: WindName[] | "any";
  precipitations: PrecipitationName[] | "any";
  description: string;
  emote: string;
}
