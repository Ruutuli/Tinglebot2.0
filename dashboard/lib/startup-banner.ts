/**
 * Fancy startup banner for Tinglebot Dashboard
 * Displays on server startup with server information
 */

import { cyan, green, yellow, magenta, bold, dim } from "colorette";

export function printStartupBanner() {
  const port = process.env.PORT || "6001";
  const nodeEnv = process.env.NODE_ENV || "development";
  const timestamp = new Date().toLocaleString();

  console.log("\n");
  console.log(`${cyan("═".repeat(60))}`);
  console.log(`${bold(magenta("  TINGLEBOT DASHBOARD"))}`);
  console.log(`${cyan("═".repeat(60))}`);
  console.log(`${bold("🚀 Server Status:")} ${green("● ONLINE")}`);
  console.log(`${bold("🌐 Environment:")}   ${yellow(nodeEnv.toUpperCase())}`);
  console.log(`${bold("🔌 Port:")}          ${cyan(port)}`);
  console.log(`${bold("⏰ Started:")}       ${dim(timestamp)}`);
  console.log(`${bold("📦 Runtime:")}       ${cyan(`Node.js ${process.version}`)}`);
  console.log(`${cyan("═".repeat(60))}`);
  console.log(`${bold(green("✓"))} ${green("Tinglebot Dashboard initialized successfully")}`);
  console.log(`${cyan("═".repeat(60))}\n`);
}
