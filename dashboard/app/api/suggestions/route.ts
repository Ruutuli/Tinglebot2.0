import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { discordApiRequest } from "@/lib/discord";

export const dynamic = "force-dynamic";

const SUGGESTION_CHANNEL_ID = "981223207770144768";
const SUGGESTION_PING_USER_ID = "606128760655183882";
const GUILD_ID = process.env.GUILD_ID;

const LINK_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/gi;
const SCRIPT_REGEX = /<script[^>]*>.*?<\/script>/gi;
const SCRIPT_TAG_REGEX = /<script[^>]*>/gi;
const HTML_TAG_REGEX = /<[^>]*>/gi;

function containsLink(text: string): boolean {
  LINK_REGEX.lastIndex = 0;
  return LINK_REGEX.test(text);
}

function containsScript(text: string): boolean {
  SCRIPT_REGEX.lastIndex = 0;
  SCRIPT_TAG_REGEX.lastIndex = 0;
  return SCRIPT_REGEX.test(text) || SCRIPT_TAG_REGEX.test(text);
}

function containsHtmlTags(text: string): boolean {
  HTML_TAG_REGEX.lastIndex = 0;
  return HTML_TAG_REGEX.test(text);
}

function sanitizeText(text: string): string {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
}

async function verifyGuildMembership(userId: string): Promise<boolean> {
  if (!GUILD_ID) {
    console.error("[Suggestions] GUILD_ID not configured");
    return false;
  }

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("[Suggestions] DISCORD_TOKEN not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
      {
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.ok;
  } catch (error) {
    console.error("[Suggestions] Guild membership check failed:", error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const clientIP =
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";

  try {
    const session = await getSession();
    const user = session.user ?? null;

    if (!user) {
      console.warn("[Suggestions] SECURITY: Unauthenticated submission attempt", {
        ip: clientIP,
        userAgent,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: "Authentication required. Please log in with Discord." },
        { status: 401 }
      );
    }

    if (GUILD_ID && process.env.DISCORD_TOKEN) {
      const isMember = await verifyGuildMembership(user.id);
      if (!isMember) {
        console.warn("[Suggestions] SECURITY: Non-member submission attempt", {
          userId: user.id,
          username: user.username,
          ip: clientIP,
          timestamp: new Date().toISOString(),
        });
        return NextResponse.json(
          { error: "You must be a member of the Discord server to submit suggestions." },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const { category, title, description } = body;

    if (!category || !title || !description) {
      console.warn("[Suggestions] Missing required fields", {
        userId: user.id,
        username: user.username,
        ip: clientIP,
      });
      return NextResponse.json(
        { error: "Missing required fields: category, title, and description are required" },
        { status: 400 }
      );
    }

    if (typeof title !== "string" || typeof description !== "string") {
      return NextResponse.json(
        { error: "Invalid field types" },
        { status: 400 }
      );
    }

    if (title.length > 100) {
      return NextResponse.json(
        { error: "Title must be 100 characters or less" },
        { status: 400 }
      );
    }

    if (description.length > 1000) {
      return NextResponse.json(
        { error: "Description must be 1000 characters or less" },
        { status: 400 }
      );
    }

    if (containsLink(title) || containsLink(description)) {
      console.warn("[Suggestions] SECURITY: Link submission blocked", {
        userId: user.id,
        username: user.username,
        ip: clientIP,
        title,
        descriptionLength: description.length,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: "Links are not allowed in suggestions. Please remove any URLs or website addresses." },
        { status: 400 }
      );
    }

    if (containsScript(title) || containsScript(description)) {
      console.error("[Suggestions] CRITICAL SECURITY: Script injection attempt blocked", {
        userId: user.id,
        username: user.username,
        ip: clientIP,
        title,
        descriptionPreview: description.substring(0, 200),
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: "Script tags are not allowed in suggestions." },
        { status: 400 }
      );
    }

    if (containsHtmlTags(title) || containsHtmlTags(description)) {
      console.warn("[Suggestions] SECURITY: HTML tags blocked", {
        userId: user.id,
        username: user.username,
        ip: clientIP,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: "HTML tags are not allowed in suggestions." },
        { status: 400 }
      );
    }

    const validCategories = ["feature", "improvement", "bug", "event", "other"];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    const sanitizedTitle = sanitizeText(title);
    const sanitizedDescription = sanitizeText(description);

    const categoryLabels: Record<string, string> = {
      feature: "🚀 New Features",
      improvement: "⚡ Server Improvements",
      bug: "🐛 Bug Reports",
      event: "🎉 Event Suggestions",
      other: "📝 Other",
    };

    const categoryColors: Record<string, number> = {
      feature: 0x00a3da,
      improvement: 0x49d59c,
      bug: 0xe74c3c,
      event: 0xf39c12,
      other: 0x9b59b6,
    };

    const formattedDescription = sanitizedDescription
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `> ${line}`)
      .join("\n");

    const truncatedDescription =
      formattedDescription.length > 1024
        ? formattedDescription.substring(0, 1021) + "..."
        : formattedDescription || "> No description provided";

    const embed = {
      title: "💡 New Suggestion Submitted",
      description: "A new anonymous suggestion has been submitted.",
      color: categoryColors[category],
      image: {
        url: "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png",
      },
      fields: [
        {
          name: "__📋 Category__",
          value: `> ${categoryLabels[category]}`,
          inline: true,
        },
        {
          name: "__📝 Title__",
          value: `> **${sanitizedTitle}**`,
          inline: false,
        },
        {
          name: "__📄 Description__",
          value: truncatedDescription,
          inline: false,
        },
        {
          name: "__💭 Want to Suggest Something?__",
          value: "> [Click here to submit your own suggestion!](https://tinglebot.xyz/suggestion-box)",
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: "💡 Note: All suggestions are posted publicly and will be answered in the server.",
      },
    };

    const result = await discordApiRequest(
      `/channels/${SUGGESTION_CHANNEL_ID}/messages`,
      "POST",
      {
        content: `<@${SUGGESTION_PING_USER_ID}>`,
        embeds: [embed],
      }
    );

    if (!result) {
      console.error("[Suggestions] Failed to post to Discord channel");
      return NextResponse.json(
        { error: "Failed to submit suggestion" },
        { status: 500 }
      );
    }

    console.log("[Suggestions] Suggestion submitted successfully", {
      userId: user.id,
      username: user.username,
      category,
      titleLength: sanitizedTitle.length,
      descriptionLength: sanitizedDescription.length,
      ip: clientIP,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Suggestion submitted successfully",
    });
  } catch (error) {
    console.error("[Suggestions] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
