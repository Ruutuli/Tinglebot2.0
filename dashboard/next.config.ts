import type { NextConfig } from "next";
import path from "path";
import webpack from "webpack";

// Get the absolute path to the project root
// process.cwd() should be the project root when running from the correct directory
const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  output: "standalone",
  // Don't log map tile image requests in dev (reduces console noise)
  logging: {
    incomingRequests: {
      ignore: [/\/api\/images\/maps\/squares\//],
    },
  },
  async rewrites() {
    return [
      // Allow using a non-API redirect URI in Discord settings/env while
      // still handling it via the existing route handlers under /api.
      { source: "/auth/discord", destination: "/api/auth/discord" },
      { source: "/auth/discord/callback", destination: "/api/auth/discord/callback" },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.pinimg.com",
      },
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
      {
        protocol: "https",
        hostname: "media.discordapp.net",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "cdn.wikimg.net",
      },
    ],
  },
  // Set turbopack root to the project directory explicitly
  turbopack: {
    root: projectRoot,
  },
  // Explicitly set webpack context and resolve root to the project directory
  webpack: (config, { isServer }) => {
    // Ensure webpack resolves modules from the project directory, not parent directories
    config.context = projectRoot;
    if (config.resolve) {
      // Set resolve modules to only look in project's node_modules first
      config.resolve.modules = [
        path.resolve(projectRoot, "node_modules"),
        ...(config.resolve.modules?.filter((m: string) => 
          !m.includes("node_modules") || m === "node_modules"
        ) || []),
      ];
      // Prevent resolving from parent directories by setting resolveRoot
      if (!config.resolve.roots) {
        config.resolve.roots = [projectRoot];
      }
    }
    
    // Ignore villageModule which may not exist in the dashboard codebase
    // This prevents webpack from trying to bundle it during build
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /villageModule/,
        contextRegExp: /models/,
      }),
      // Ignore aws4 - it's an optional dependency of MongoDB that webpack tries to resolve
      // but isn't needed for basic MongoDB operations
      new webpack.IgnorePlugin({
        resourceRegExp: /^aws4$/,
      })
    );
    return config;
  },
};

export default nextConfig;
