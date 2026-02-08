import { cyan, green, yellow, red, magenta } from "colorette";

// Log level definitions
type LogLevel = "info" | "success" | "warn" | "error" | "debug";

interface LogLevelConfig {
  emoji: string;
  color: (text: string) => string;
  level: string;
}

const LOG_LEVELS: Record<LogLevel, LogLevelConfig> = {
  info: {
    emoji: "ℹ️",
    color: cyan,
    level: "INFO",
  },
  success: {
    emoji: "✅",
    color: green,
    level: "SUCCESS",
  },
  warn: {
    emoji: "⚠️",
    color: yellow,
    level: "WARN",
  },
  error: {
    emoji: "❌",
    color: red,
    level: "ERROR",
  },
  debug: {
    emoji: "🐛",
    color: magenta,
    level: "DEBUG",
  },
};

// Configuration interface
interface LoggerConfig {
  enableTimestamp: boolean;
  environment: "dev" | "prod";
}

// Default configuration
const getDefaultConfig = (): LoggerConfig => {
  // Browser-safe environment detection
  const isBrowser = typeof window !== "undefined";
  const nodeEnv =
    !isBrowser && typeof process !== "undefined" && process.env
      ? process.env.NODE_ENV
      : undefined;

  return {
    enableTimestamp: true,
    environment: nodeEnv === "production" ? "prod" : "dev",
  };
};

let config: LoggerConfig = getDefaultConfig();

// Format timestamp to YYYY-MM-DD HH:mm:ss
const formatTimestamp = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Centralized format function - all formatting logic here
const formatLog = (level: LogLevel, file: string, message: string): string => {
  const levelConfig = LOG_LEVELS[level];
  const timestamp = config.enableTimestamp ? formatTimestamp() : null;

  // Build parts
  const parts: string[] = [];

  // Add timestamp if enabled
  if (timestamp) {
    parts.push(`[${timestamp}]`);
  }

  // Add file (required)
  parts.push(`[${file}]`);

  // Add emoji and colored level with colon
  const levelText = `${levelConfig.emoji} ${levelConfig.level}:`;
  const coloredLevel = levelConfig.color(levelText);
  parts.push(coloredLevel);

  // Add message (unchanged)
  parts.push(message);

  // Join with spaces
  return parts.join(" ");
};

// Check if log level should be shown
const shouldLog = (level: LogLevel): boolean => {
  // In production, hide debug logs
  if (config.environment === "prod" && level === "debug") {
    return false;
  }
  return true;
};

// Logger methods
const createLoggerMethod = (level: LogLevel) => {
  return (file: string, message: string): void => {
    if (!shouldLog(level)) {
      return;
    }

    const formatted = formatLog(level, file, message);
    console.log(formatted);
  };
};

// Export logger object
export const logger = {
  info: createLoggerMethod("info"),
  success: createLoggerMethod("success"),
  warn: createLoggerMethod("warn"),
  error: createLoggerMethod("error"),
  debug: createLoggerMethod("debug"),
};

// Default export for CJS require() from .js models (e.g. UserModel.js)
export default logger;

// Configuration function
export const configureLogger = (newConfig: Partial<LoggerConfig>): void => {
  config = { ...config, ...newConfig };
};

// Export types
export type { LoggerConfig, LogLevel };