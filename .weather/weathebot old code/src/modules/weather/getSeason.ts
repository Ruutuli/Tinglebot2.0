import { Season } from "../../interfaces/weather/names/Season";

/**
 * Module to get the season based on today's date.
 * Winter: Dec 21 - March 20.
 * Spring: March 21 - June 20.
 * Summer: June 21st - September 22.
 * Fall: September 23 - December 21.
 *
 * @returns {Season} The season name.
 */
export const getSeason = (): Season => {
  const date = new Date();
  const month = date.getMonth();
  const day = date.getDate();

  if (month < 2 || (month === 2 && day < 21) || (month === 11 && day > 20)) {
    return "Winter";
  }
  if (month < 5 || (month === 5 && day < 21)) {
    return "Spring";
  }
  if (month < 8 || (month === 8 && day < 23)) {
    return "Summer";
  }
  return "Fall";
};
