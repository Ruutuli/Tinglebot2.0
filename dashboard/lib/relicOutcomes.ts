/**
 * Re-export getAppraisalText from bot/data/relicOutcomes.js for dashboard API routes.
 * Resolved via webpack alias @/bot/relicOutcomes so the bundler can statically resolve it
 * (Turbopack/Next do not resolve dynamic require(path.join(...)) paths).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const botRelic = require("@/bot/relicOutcomes") as {
  getAppraisalText: (relicName: string) => string | null;
};

export function getAppraisalText(relicName: string): string | null {
  return botRelic.getAppraisalText(relicName);
}
