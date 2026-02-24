import { NextResponse } from "next/server";
import { discordApiRequest } from "@/lib/discord";

export const dynamic = "force-dynamic";

const GUILD_ID = process.env.GUILD_ID || "";

const ROLE_IDS = {
  rudania: "630837341124034580",
  inariko: "631507660524486657",
  vhintl: "631507736508629002",
  traveler: "788137818135330837",
  resident: "788137728943325185",
  inactive: "788148064182730782",
} as const;

type RoleCounts = {
  rudania: number;
  inariko: number;
  vhintl: number;
  traveler: number;
  resident: number;
  inactive: number;
  totalMembers: number;
};

type GuildMember = {
  roles: string[];
  user?: {
    bot?: boolean;
  };
};

const memberStatsCache: {
  data: RoleCounts | null;
  expiresAt: number;
} = {
  data: null,
  expiresAt: 0,
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchGuildMembers(): Promise<GuildMember[]> {
  if (!GUILD_ID) {
    console.error("GUILD_ID not configured");
    return [];
  }

  const allMembers: GuildMember[] = [];
  let after: string | undefined;
  const limit = 1000;

  // Discord API pagination - fetch all members
  while (true) {
    const endpoint = after
      ? `guilds/${GUILD_ID}/members?limit=${limit}&after=${after}`
      : `guilds/${GUILD_ID}/members?limit=${limit}`;

    const members = await discordApiRequest<GuildMember[]>(endpoint, "GET");

    if (!members || members.length === 0) {
      break;
    }

    allMembers.push(...members);

    if (members.length < limit) {
      break;
    }

    // Get the last member's user ID for pagination
    const lastMember = members[members.length - 1] as GuildMember & { user?: { id?: string } };
    after = lastMember?.user?.id;

    if (!after) {
      break;
    }
  }

  return allMembers;
}

function countMembersByRole(members: GuildMember[]): RoleCounts {
  const counts: RoleCounts = {
    rudania: 0,
    inariko: 0,
    vhintl: 0,
    traveler: 0,
    resident: 0,
    inactive: 0,
    totalMembers: 0,
  };

  for (const member of members) {
    // Skip bots
    if (member.user?.bot) continue;

    counts.totalMembers++;

    const roles = member.roles || [];

    if (roles.includes(ROLE_IDS.rudania)) counts.rudania++;
    if (roles.includes(ROLE_IDS.inariko)) counts.inariko++;
    if (roles.includes(ROLE_IDS.vhintl)) counts.vhintl++;
    if (roles.includes(ROLE_IDS.traveler)) counts.traveler++;
    if (roles.includes(ROLE_IDS.resident)) counts.resident++;
    if (roles.includes(ROLE_IDS.inactive)) counts.inactive++;
  }

  return counts;
}

export async function GET() {
  try {
    const now = Date.now();

    // Return cached data if still valid
    if (memberStatsCache.data && memberStatsCache.expiresAt > now) {
      const response = NextResponse.json(memberStatsCache.data);
      response.headers.set(
        "Cache-Control",
        "public, s-maxage=300, stale-while-revalidate=600"
      );
      return response;
    }

    // Fetch fresh data
    const members = await fetchGuildMembers();
    const counts = countMembersByRole(members);

    // Update cache
    memberStatsCache.data = counts;
    memberStatsCache.expiresAt = now + CACHE_TTL_MS;

    const response = NextResponse.json(counts);
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600"
    );

    return response;
  } catch (error) {
    console.error(
      "Error fetching member stats:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      { error: "Failed to fetch member stats" },
      { status: 500 }
    );
  }
}
