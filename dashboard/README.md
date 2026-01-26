# Tinglebot Dashboard

A modern, scalable dashboard for Tinglebot - your Zelda Discord bot. Built with Next.js 14, TypeScript, and Tailwind CSS, featuring a TOTK/BOTW-inspired theme.

## Features

- 🎨 Modern, stylish UI with TOTK/BOTW-inspired theme
- 📱 Fully responsive design (mobile, tablet, desktop)
- 🔐 Discord OAuth authentication
- 🧭 Scalable navigation system with search
- 📊 Dashboard overview with stats and activity feed
- 🎯 Modular, component-based architecture

## Getting Started

### Prerequisites

- Node.js 20+ 
- npm, yarn, pnpm, or bun

### Installation

1. Install dependencies:

```bash
npm install
```

### Running the Development Server

To start the development server, run:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser to see the dashboard.

The page will auto-update as you edit files.

### Discord OAuth Setup (Optional)

To enable Discord login functionality:

1. Create a `.env.local` file in the project root
2. Add your Discord OAuth credentials:

```env
NEXT_PUBLIC_DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
NEXT_PUBLIC_DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
```

3. Get your credentials from the [Discord Developer Portal](https://discord.com/developers/applications)

**Note:** The dashboard UI works without Discord OAuth configured - you just won't be able to log in until you set it up.

## Project Structure

```
tinglebot-dashboard/
├── app/                    # Next.js app router pages
│   ├── (dashboard)/       # Dashboard route group
│   └── api/               # API routes
├── components/             # React components
│   ├── layout/            # Layout components (Sidebar, TopBar)
│   ├── features/          # Feature-specific components
│   └── ui/                # shadcn/ui components
├── config/                # Configuration files
│   └── navigation.ts     # Navigation configuration
├── lib/                   # Utility libraries
│   ├── auth/              # Authentication utilities
│   └── navigation/        # Navigation utilities
└── types/                 # TypeScript type definitions
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
