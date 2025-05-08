import { captureException } from "@sentry/node";
import { MessageEmbed, WebhookClient } from "discord.js";
import { v4 } from "uuid";

import { logHandler } from "./logHandler";

/**
 * Formats an error into an embed and sends it to the developer debug webhook.
 *
 * @param {Error} err The error.
 * @param {string} context A description of where the error occurred.
 * @returns {string} The UUID tied to the error.
 */
export const errorHandler = async (
  err: unknown,
  context: string
): Promise<string> => {
  const error = err as Error;
  logHandler.log("error", `There was an error in the ${context}:`);
  logHandler.log(
    "error",
    JSON.stringify(
      { errorMessage: error.message, errorStack: error.stack },
      null,
      2
    )
  );

  captureException(error);

  const errorId = v4();

  const errorEmbed = new MessageEmbed();
  errorEmbed.setTitle(`RuuBot had a ${context} error!`);
  errorEmbed.setColor("DARK_RED");
  errorEmbed.setDescription(error.message.substring(0, 4000));
  errorEmbed.addField(
    "Stack Trace:",
    `\`\`\`${error.stack?.slice(0, 1000)}\`\`\``
  );
  errorEmbed.addField("Error ID:", errorId);
  errorEmbed.setTimestamp();

  const webhook = new WebhookClient({ url: process.env.DEBUG_HOOK as string });

  await webhook.send({ embeds: [errorEmbed] });

  return `The ${context} logic had an error. Please contact the developer with this ID: \`${errorId}\``;
};
