import { Interaction } from "discord.js";

import { CommandList } from "../../commands/_CommandList";
import { WeatherCache } from "../../interfaces/WeatherCache";

/**
 * Handles the INTERACTION_CREATE event from Discord. Checks if the interaction is
 * an application command, and if there is a matching command, and runs it.
 *
 * @param {Interaction} interaction The interaction payload from Discord.
 * @param { WeatherCache } CACHE The cache of weather data.
 */
export const onInteraction = async (
  interaction: Interaction,
  CACHE: WeatherCache
) => {
  if (!interaction.isCommand()) {
    return;
  }

  const target = CommandList.find(
    (command) => command.data.name === interaction.commandName
  );

  if (!target) {
    await interaction.reply(`Command ${interaction.commandName} not found.`);
    return;
  }

  await target.run(interaction, CACHE);
};
