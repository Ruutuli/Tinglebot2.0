import { PrecipitationName } from "../names/PrecipitationName";
import { Season } from "../names/Season";
import { SpecialName } from "../names/SpecialName";
import { TemperatureName } from "../names/TemperatureName";
import { WindName } from "../names/WindName";

export interface RegionRestriction {
  season: Season;
  temps: TemperatureName[];
  wind: WindName[];
  precipitation: PrecipitationName[];
  special: SpecialName[];
}
