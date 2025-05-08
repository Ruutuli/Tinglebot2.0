import { inarikoSeasons } from "../../data/weather/regions/inarikoSeasons";
import { rudaniaSeasons } from "../../data/weather/regions/rudaniaSeasons";
import { vhintlSeasons } from "../../data/weather/regions/vhintlSeasons";
import { RegionName } from "../../interfaces/weather/names/RegionName";
import { Season } from "../../interfaces/weather/names/Season";
import { RegionRestriction } from "../../interfaces/weather/regions/RegionRestriction";

/**
 * Module to get the allowed weather for a region based on the season.
 * Will throw an error if the data is not found.
 *
 * @param {RegionName} region The name of the region.
 * @param {Season} season The season.
 * @returns {RegionRestriction} The allowed weather for the region.
 */
export const getRegionRestrictions = (
  region: RegionName,
  season: Season
): RegionRestriction | null => {
  let restrictions = null;
  switch (region) {
    case "Rudania":
      restrictions = rudaniaSeasons;
      break;
    case "Inariko":
      restrictions = inarikoSeasons;
      break;
    case "Vhintl":
      restrictions = vhintlSeasons;
      break;
    default:
      return null;
  }

  const seasonalRestriction = restrictions.find((el) => el.season === season);

  if (!seasonalRestriction) {
    return null;
  }

  return seasonalRestriction;
};
