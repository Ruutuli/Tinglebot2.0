import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { connect } from "@/lib/db";

export const dynamic = "force-dynamic";

const GUILD_ID = process.env.GUILD_ID;

async function verifyGuildMembership(userId: string): Promise<boolean> {
  if (!GUILD_ID || !process.env.DISCORD_TOKEN) return true;
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

function trim(str: unknown): string {
  return typeof str === "string" ? str.trim() : "";
}

function numInRange(val: unknown, min: number, max: number): number | null {
  const n = typeof val === "number" ? val : typeof val === "string" ? parseInt(val, 10) : NaN;
  if (Number.isNaN(n) || n < min || n > max) return null;
  return n;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session?.user ?? null;

    if (!user?.id) {
      return NextResponse.json(
        { error: "Authentication required. Please log in with Discord." },
        { status: 401 }
      );
    }

    const isMember = await verifyGuildMembership(user.id);
    if (!isMember) {
      return NextResponse.json(
        { error: "You must be a member of the Roots Discord server to apply." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const discordUsername = trim(body.discordUsername);
    const timePerWeek = trim(body.timePerWeek);
    const conflictHandling = numInRange(body.conflictHandling, 1, 10);
    const comfortableModeratingNsfw = body.comfortableModeratingNsfw === "Yes" || body.comfortableModeratingNsfw === "No" ? body.comfortableModeratingNsfw : null;
    const timezoneAndAvailability = trim(body.timezoneAndAvailability);
    const howLongInGroup = trim(body.howLongInGroup);
    const reprimandingApproach = trim(body.reprimandingApproach);
    const workingAsTeam = trim(body.workingAsTeam);
    const discordModExperience = numInRange(body.discordModExperience, 1, 10);
    const framerExperience = numInRange(body.framerExperience, 1, 10);
    const specialSkills = trim(body.specialSkills);
    const gameMechanicsExperience = trim(body.gameMechanicsExperience);
    const gameMechanicsSystems = trim(body.gameMechanicsSystems ?? "");
    const ideasForMechanics = trim(body.ideasForMechanics);
    const npcExperience = trim(body.npcExperience);
    const npcApproach = trim(body.npcApproach ?? "");
    const comfortableLoreDevelopment = trim(body.comfortableLoreDevelopment);
    const loreTasksEnjoy = trim(body.loreTasksEnjoy ?? "");
    const documentationComfort = trim(body.documentationComfort);
    const documentationExperience = trim(body.documentationExperience ?? "");
    const visualAssetsExperience = trim(body.visualAssetsExperience);
    const visualAssetsTools = trim(body.visualAssetsTools ?? "");
    const visualContentManagement = body.visualContentManagement === "Yes" || body.visualContentManagement === "No" || body.visualContentManagement === "Maybe" ? body.visualContentManagement : null;
    const visualContentDetails = trim(body.visualContentDetails ?? "");
    const socialMediaManagement = body.socialMediaManagement === "Yes" || body.socialMediaManagement === "No" || body.socialMediaManagement === "Maybe" ? body.socialMediaManagement : null;
    const socialMediaDetails = trim(body.socialMediaDetails ?? "");
    const scenarioTraveller = trim(body.scenarioTraveller);
    const scenarioTriggerWarning = trim(body.scenarioTriggerWarning);
    const scenarioNsfwOption = trim(body.scenarioNsfwOption);
    const faqExample1 = trim(body.faqExample1 ?? "");
    const faqExample2 = trim(body.faqExample2 ?? "");
    const faqExample3 = trim(body.faqExample3 ?? "");
    const faqExample4 = trim(body.faqExample4 ?? "");
    const rulesKnowledge = trim(body.rulesKnowledge ?? "");
    const otherComments = trim(body.otherComments ?? "");

    if (!discordUsername) return NextResponse.json({ error: "Discord username is required." }, { status: 400 });
    if (!timePerWeek) return NextResponse.json({ error: "Time per week is required." }, { status: 400 });
    if (conflictHandling == null) return NextResponse.json({ error: "Conflict handling (1–10) is required." }, { status: 400 });
    if (!comfortableModeratingNsfw) return NextResponse.json({ error: "Please answer whether you're comfortable moderating NSFW channels." }, { status: 400 });
    if (!timezoneAndAvailability) return NextResponse.json({ error: "Timezone and availability is required." }, { status: 400 });
    if (!howLongInGroup) return NextResponse.json({ error: "How long you've been in the group is required." }, { status: 400 });
    if (!reprimandingApproach) return NextResponse.json({ error: "Reprimanding approach is required." }, { status: 400 });
    if (!workingAsTeam) return NextResponse.json({ error: "Working as a team is required." }, { status: 400 });
    if (discordModExperience == null) return NextResponse.json({ error: "Discord moderation experience (1–10) is required." }, { status: 400 });
    if (framerExperience == null) return NextResponse.json({ error: "Framer (website) experience (1–10) is required." }, { status: 400 });
    if (!specialSkills) return NextResponse.json({ error: "Special skills is required." }, { status: 400 });
    if (!gameMechanicsExperience) return NextResponse.json({ error: "Game mechanics experience is required." }, { status: 400 });
    if (!ideasForMechanics) return NextResponse.json({ error: "Ideas for mechanics is required." }, { status: 400 });
    if (!npcExperience) return NextResponse.json({ error: "NPC experience is required." }, { status: 400 });
    if (!comfortableLoreDevelopment) return NextResponse.json({ error: "Lore development comfort is required." }, { status: 400 });
    if (!documentationComfort) return NextResponse.json({ error: "Documentation comfort is required." }, { status: 400 });
    if (!visualAssetsExperience) return NextResponse.json({ error: "Visual assets experience is required." }, { status: 400 });
    if (!visualContentManagement) return NextResponse.json({ error: "Visual content management interest is required." }, { status: 400 });
    if (!socialMediaManagement) return NextResponse.json({ error: "Please answer whether you're interested in social media management." }, { status: 400 });
    if (!scenarioTraveller) return NextResponse.json({ error: "Scenario (Traveller) is required." }, { status: 400 });
    if (!scenarioTriggerWarning) return NextResponse.json({ error: "Scenario (trigger warning) is required." }, { status: 400 });
    if (!scenarioNsfwOption) return NextResponse.json({ error: "Scenario (NSFW option) is required." }, { status: 400 });
    if (!faqExample1 || !faqExample2 || !faqExample3 || !faqExample4) return NextResponse.json({ error: "Your response to all 4 FAQ examples is required." }, { status: 400 });
    if (!rulesKnowledge) return NextResponse.json({ error: "Rules knowledge answers are required." }, { status: 400 });

    await connect();

    const ModApplicationModule = await import("@/models/ModApplicationModel.js");
    const ModApplication = ModApplicationModule.default ?? ModApplicationModule;

    const existing = await ModApplication.findOne({
      submitterUserId: user.id,
      status: "pending",
    });
    if (existing) {
      return NextResponse.json(
        { error: "You already have a pending mod application. Wait for a response before submitting again." },
        { status: 400 }
      );
    }

    const doc = await ModApplication.create({
      submitterUserId: user.id,
      submitterDiscordUsername: user.username ?? "",
      discordUsername,
      timePerWeek,
      conflictHandling,
      comfortableModeratingNsfw,
      timezoneAndAvailability,
      howLongInGroup,
      reprimandingApproach,
      workingAsTeam,
      discordModExperience,
      framerExperience,
      specialSkills,
      gameMechanicsExperience,
      gameMechanicsSystems,
      ideasForMechanics,
      npcExperience,
      npcApproach,
      comfortableLoreDevelopment,
      loreTasksEnjoy,
      documentationComfort,
      documentationExperience,
      visualAssetsExperience,
      visualAssetsTools,
      visualContentManagement,
      visualContentDetails,
      socialMediaManagement,
      socialMediaDetails,
      scenarioTraveller,
      scenarioTriggerWarning,
      scenarioNsfwOption,
      faqExample1,
      faqExample2,
      faqExample3,
      faqExample4,
      rulesKnowledge,
      otherComments,
      status: "pending",
    });

    try {
      const { notifyModApplicationSubmitted } = await import("@/lib/services/discordPostingService");
      await notifyModApplicationSubmitted(doc.discordUsername ?? doc.submitterDiscordUsername ?? "Unknown", String(doc._id));
    } catch (notifyErr) {
      console.error("[api/mod-applications] Discord notify failed:", notifyErr);
    }

    return NextResponse.json({
      success: true,
      message: "Your mod application has been submitted. The team will review it and get back to you.",
    });
  } catch (err) {
    console.error("[api/mod-applications]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to submit application" },
      { status: 500 }
    );
  }
}
