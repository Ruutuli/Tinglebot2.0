/* ============================================================================ */
/* ------------------- Document Meta ------------------- */
/* ============================================================================ */

import type { Metadata, Viewport } from "next";
import Script from "next/script";

import "@/app/globals.css";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { TopBar, TOP_BAR_HEIGHT } from "@/components/layout/top-bar";

/* [layout.tsx]✨ Page metadata - */
export const metadata: Metadata = {
  title: {
    default: "Tinglebot Dashboard",
    template: "%s | Tinglebot Dashboard",
  },
  description: "Tingle, Tingle! Kooloo-Limpah! Welcome to the Tinglebot Dashboard - your comprehensive management interface for the Tinglebot Discord bot. Create and manage characters, track quests and tokens, browse models, and access all bot-related features. Companion dashboard for the Roots of the Wild Discord community. Visit https://rootsofthewild.com/ for more information.",
  keywords: ["tinglebot", "discord bot", "dashboard", "roots of the wild", "zelda", "rpg", "character management"],
  authors: [{ name: "Tinglebot" }],
  creator: "Tinglebot",
  publisher: "Tinglebot",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:6001"),
  alternates: {
    canonical: "/",
  },
  other: {
    "referrer": "origin-when-cross-origin",
  },
  category: "Discord Bot Dashboard",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Tinglebot Dashboard",
    title: "Tinglebot Dashboard",
    description: "Tingle, Tingle! Kooloo-Limpah! Welcome to the Tinglebot Dashboard - your comprehensive management interface for the Tinglebot Discord bot. Create and manage characters, track quests and tokens, browse models, and access all bot-related features. Companion dashboard for the Roots of the Wild Discord community. Visit https://rootsofthewild.com/ for more information.",
    images: [
      {
        url: "/tingle_icon.png",
        width: 512,
        height: 512,
        alt: "Tinglebot Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Tinglebot Dashboard",
    description: "Tingle, Tingle! Kooloo-Limpah! Welcome to the Tinglebot Dashboard - your comprehensive management interface for the Tinglebot Discord bot. Create and manage characters, track quests and tokens, browse models, and access all bot-related features. Companion dashboard for the Roots of the Wild Discord community. Visit https://rootsofthewild.com/ for more information.",
    images: ["/tingle_icon.png"],
  },
  icons: {
    icon: [
      { url: "/tingle_icon.png", sizes: "any" },
      { url: "/tingle_icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/tingle_icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/tingle_icon.png",
  },
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // Add verification codes here if needed
  },
};

/* [layout.tsx]✨ Viewport configuration - */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1f5d50" },
    { media: "(prefers-color-scheme: dark)", color: "#1f5d50" },
  ],
};

/* ============================================================================ */
/* ------------------- Critical Layout ------------------- */
/* ============================================================================ */

/* [layout.tsx]🧱 Root layout shell - */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <SidebarProvider>
          <TopBar />
          <div
            className="flex flex-col"
            style={{
              minHeight: "100vh",
              paddingTop: TOP_BAR_HEIGHT,
            }}
          >
            <DashboardShell>{children}</DashboardShell>
          </div>
        </SidebarProvider>
        <Script
          crossOrigin="anonymous"
          src="https://kit.fontawesome.com/262000d25d.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
