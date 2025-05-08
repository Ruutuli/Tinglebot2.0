/**
 * Module to select a random value from an array.
 *
 * @param {any[]} array The array to select from.
 * @param {"low" | "high"} weight Optional parameter to prefer lower or higher values.
 * @returns {any} The selected value.
 */
export const getRandomValue = <T>(array: T[], weight?: "low" | "high"): T => {
  let random = Math.floor(Math.random() * array.length);
  switch (weight) {
    case "low":
      random = Math.min(
        Math.floor(Math.random() * array.length),
        Math.floor(Math.random() * array.length),
        Math.floor(Math.random() * array.length)
      );
      break;
    case "high":
      random = Math.max(
        Math.floor(Math.random() * array.length),
        Math.floor(Math.random() * array.length),
        Math.floor(Math.random() * array.length)
      );
  }
  return array[random];
};
