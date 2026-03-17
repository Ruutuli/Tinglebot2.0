"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { Loading, Modal } from "@/components/ui";

type ModApp = {
  _id: string;
  discordUsername: string;
  submitterDiscordUsername?: string;
  submitterUserId: string;
  timePerWeek: string;
  conflictHandling: number;
  comfortableModeratingNsfw: string;
  timezoneAndAvailability: string;
  howLongInGroup: string;
  reprimandingApproach: string;
  workingAsTeam: string;
  discordModExperience: number;
  framerExperience: number;
  specialSkills: string;
  gameMechanicsExperience: string;
  gameMechanicsSystems?: string;
  ideasForMechanics: string;
  npcExperience: string;
  npcApproach?: string;
  comfortableLoreDevelopment: string;
  loreTasksEnjoy?: string;
  documentationComfort: string;
  documentationExperience?: string;
  visualAssetsExperience: string;
  visualAssetsTools?: string;
  visualContentManagement: string;
  visualContentDetails?: string;
  socialMediaManagement: string;
  socialMediaDetails?: string;
  scenarioTraveller: string;
  scenarioTriggerWarning: string;
  scenarioNsfwOption: string;
  faqExample1: string;
  faqExample2?: string;
  faqExample3?: string;
  faqExample4?: string;
  rulesKnowledge?: string;
  otherComments?: string;
  status: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
};

const sectionStyle = {
  background: "rgba(32, 36, 44, 0.72)",
  border: "1px solid var(--totk-dark-ocher)",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
};

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5 space-y-4" style={sectionStyle}>
      <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--totk-light-green)] border-b border-[var(--totk-dark-ocher)] pb-2 mb-0">
        {title}
      </h3>
      <div className="whitespace-pre-wrap break-words space-y-4">{children}</div>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--botw-pale)]/90">{label}</span>
      <div className="border-l-2 border-[var(--totk-mid-ocher)]/60 bg-[rgba(255,255,255,0.03)] rounded-r py-2 px-3 min-h-[2.25rem] flex items-start">
        <span className="text-[var(--totk-ivory)] text-[15px] leading-snug break-words">{value}</span>
      </div>
    </div>
  );
}

/** Single long-form answer (paragraph) inside a section */
function AnswerBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-[var(--totk-mid-ocher)]/60 bg-[rgba(255,255,255,0.03)] rounded-r py-3 px-4">
      <p className="text-[var(--totk-ivory)] text-[15px] leading-relaxed m-0">{children}</p>
    </div>
  );
}

function parseTimezoneAvailability(raw: string): { timezone?: string; ranges?: { start: string; end: string }[] } {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

/** Format HH:mm as readable time (e.g. 18:29 → 6:29 PM) */
function formatTimeRange(start: string, end: string): string {
  const fmt = (s: string) => {
    if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return s;
    const [h, m] = s.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function parseRulesKnowledge(raw: string): Record<string, string> {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

const RULES_KNOWLEDGE_LABELS: Record<string, string> = {
  rulesMinAge: "Minimum age to join",
  rulesNsfwWhere: "Where NSFW content may be posted",
  rulesTravelerWeeks: "Weeks for Travelers to become full members",
  rulesActivityChecks: "Consecutive activity checks before removal",
  rulesSafePhrase: "Safe phrase",
  rulesStrikesBan: "Strikes before permanent ban",
  rulesWhereToAsk: "Where to direct group questions",
  rulesAiArtOwn: "May AI art be presented as own work",
};

/** Correct answers for rules knowledge (must match mod-application form validation) */
const RULES_KNOWLEDGE_CORRECT: Record<string, string> = {
  rulesMinAge: "18",
  rulesNsfwWhere: "designated",
  rulesTravelerWeeks: "2",
  rulesActivityChecks: "3",
  rulesSafePhrase: "WindFish says No", // display form; check is case-insensitive
  rulesStrikesBan: "4",
  rulesWhereToAsk: "faq",
  rulesAiArtOwn: "No",
};

function isRulesAnswerCorrect(key: string, value: string): boolean {
  const correct = RULES_KNOWLEDGE_CORRECT[key];
  if (correct == null) return false;
  if (key === "rulesSafePhrase") {
    return value.trim().toLowerCase() === correct.toLowerCase();
  }
  return value.trim() === correct;
}

export default function AdminModApplicationsPage() {
  const { user, isAdmin, isModerator, loading: sessionLoading } = useSession();
  const [list, setList] = useState<ModApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ModApp | null>(null);

  const canAccess = isAdmin || isModerator;

  const fetchList = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mod-applications", { cache: "no-store", credentials: "include" });
      if (!res.ok) {
        setError("Failed to load applications");
        setList([]);
        return;
      }
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loading message="Loading..." variant="inline" size="lg" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[600px] rounded-xl border border-[var(--totk-dark-ocher)] p-8 text-center" style={sectionStyle}>
          <p className="text-botw-pale">You need moderator or admin access to view mod applications.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[900px]">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex items-center justify-center gap-2 sm:gap-4">
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto sm:h-6" aria-hidden />
            <h1 className="text-xl font-bold text-[var(--totk-light-ocher)] sm:text-2xl md:text-3xl">
              Mod Applications
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto sm:h-6" aria-hidden />
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--botw-pale)]">
            View mod applications. New submissions are posted to the admin review Discord channel. Applications are stored for discussion and test period; there is no in-app accept/reject.
          </p>
        </div>

        {!loading && list.length > 0 && (
          <p className="mb-6 text-sm text-[var(--botw-pale)]">
            {list.length} application{list.length !== 1 ? "s" : ""}
          </p>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">
            <i className="fas fa-exclamation-circle mr-2 opacity-80" aria-hidden />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center rounded-xl py-16" style={sectionStyle}>
            <Loading message="Loading applications..." variant="inline" size="lg" />
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-[var(--totk-dark-ocher)] px-6 py-16 text-center" style={sectionStyle}>
            <i className="fas fa-inbox mb-4 block text-4xl text-[var(--totk-dark-ocher)] opacity-60" aria-hidden />
            <p className="text-[var(--totk-ivory)] font-medium">No applications</p>
            <p className="mt-1 text-sm text-[var(--botw-pale)]">No applications have been submitted yet.</p>
          </div>
        ) : (
          <ul className="space-y-3 list-none p-0 m-0">
            {list.map((app) => (
              <li key={app._id}>
                <article
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewing(app)}
                  onKeyDown={(e) => e.key === "Enter" && setViewing(app)}
                  className="group block rounded-xl border border-[var(--totk-dark-ocher)] overflow-hidden transition-all hover:border-[var(--totk-mid-ocher)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/50 focus:ring-offset-2 focus:ring-offset-[var(--botw-warm-black)]"
                  style={{ background: "rgba(42, 38, 36, 0.95)" }}
                >
                  <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold tracking-tight text-[var(--totk-light-ocher)] sm:text-lg">
                        {app.discordUsername || app.submitterDiscordUsername || app.submitterUserId}
                      </h2>
                      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-[var(--botw-pale)] font-normal">Time:</dt>
                          <dd className="text-[var(--totk-ivory)] font-medium">{app.timePerWeek}</dd>
                          <dd className="text-[var(--botw-pale)]">per week</dd>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-[var(--botw-pale)] font-normal">In group:</dt>
                          <dd className="text-[var(--totk-ivory)]">{app.howLongInGroup}</dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-xs text-[var(--botw-pale)]/80" aria-label="Submitted date">
                        <i className="fas fa-calendar-minus mr-1.5 opacity-70" aria-hidden />
                        {new Date(app.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2 text-sm font-medium text-[var(--totk-light-ocher)] group-hover:text-[var(--totk-light-green)] transition-colors">
                      <span>View application</span>
                      <i className="fas fa-chevron-right text-xs opacity-80" aria-hidden />
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing ? `${viewing.discordUsername} — Mod Application` : ""}
        size="xl"
      >
        {viewing && (
          <div className="max-h-[80vh] overflow-y-auto space-y-5 pr-2">
            <DetailSection title="Basics">
              <div className="space-y-2">
                <FieldRow label="Discord" value={viewing.discordUsername} />
                <FieldRow label="Time per week" value={viewing.timePerWeek} />
                <FieldRow label="How long in group" value={viewing.howLongInGroup} />
                <FieldRow label="Conflict handling (1–10)" value={String(viewing.conflictHandling)} />
                <FieldRow label="Comfortable moderating NSFW" value={viewing.comfortableModeratingNsfw} />
              </div>
            </DetailSection>

            {(() => {
              const tz = parseTimezoneAvailability(viewing.timezoneAndAvailability);
              const hasTz = tz.timezone || (tz.ranges?.length ?? 0) > 0;
              if (!hasTz && !viewing.timezoneAndAvailability) return null;
              return (
                <DetailSection title="Timezone & availability">
                  <div className="space-y-2">
                    {tz.timezone && <FieldRow label="Timezone" value={tz.timezone.replace(/_/g, " ")} />}
                    {tz.ranges?.length ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--botw-pale)]/90">Available times</span>
                        <div className="border-l-2 border-[var(--totk-mid-ocher)]/60 bg-[rgba(255,255,255,0.03)] rounded-r py-2 px-3 min-h-[2.25rem] flex items-start">
                          <span className="text-[var(--totk-ivory)] text-[15px] leading-snug break-words">
                            {tz.ranges.map((r) => r.start && r.end ? formatTimeRange(r.start, r.end) : "").filter(Boolean).join(" · ") || "—"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <AnswerBlock>{viewing.timezoneAndAvailability}</AnswerBlock>
                    )}
                  </div>
                </DetailSection>
              );
            })()}

            <DetailSection title="Reprimanding approach">
              <AnswerBlock>{viewing.reprimandingApproach || "—"}</AnswerBlock>
            </DetailSection>
            <DetailSection title="Working as a team">
              <AnswerBlock>{viewing.workingAsTeam || "—"}</AnswerBlock>
            </DetailSection>

            <DetailSection title="Experience">
              <div className="space-y-2">
                <FieldRow label="Discord mod experience (1–10)" value={`${viewing.discordModExperience}/10`} />
                <FieldRow label="Framer experience (1–10)" value={`${viewing.framerExperience}/10`} />
                <FieldRow label="Special skills" value={viewing.specialSkills || "—"} />
              </div>
            </DetailSection>

            <DetailSection title="Game mechanics">
              <div className="space-y-2">
                <FieldRow label="Experience" value={viewing.gameMechanicsExperience || "—"} />
                {viewing.ideasForMechanics && <FieldRow label="Ideas for mechanics" value={viewing.ideasForMechanics} />}
              </div>
            </DetailSection>
            <DetailSection title="NPC experience">
              <div className="space-y-2">
                <FieldRow label="Experience" value={viewing.npcExperience || "—"} />
                {viewing.npcApproach && <FieldRow label="Approach" value={viewing.npcApproach} />}
              </div>
            </DetailSection>
            <DetailSection title="Lore & documentation">
              <div className="space-y-2">
                <FieldRow label="Lore development" value={viewing.comfortableLoreDevelopment || "—"} />
                {viewing.loreTasksEnjoy && <FieldRow label="Lore tasks they enjoy" value={viewing.loreTasksEnjoy} />}
                <FieldRow label="Documentation comfort" value={viewing.documentationComfort || "—"} />
                {viewing.documentationExperience && <FieldRow label="Documentation experience" value={viewing.documentationExperience} />}
              </div>
            </DetailSection>
            <DetailSection title="Visual content & social">
              <div className="space-y-2">
                <FieldRow label="Visual content interest" value={viewing.visualContentManagement} />
                {viewing.visualContentDetails && <FieldRow label="Details" value={viewing.visualContentDetails} />}
                <FieldRow label="Social media interest" value={viewing.socialMediaManagement} />
                {viewing.socialMediaDetails && <FieldRow label="Details" value={viewing.socialMediaDetails} />}
              </div>
            </DetailSection>

            <DetailSection title="Scenario: Traveller">
              <AnswerBlock>{viewing.scenarioTraveller || "—"}</AnswerBlock>
            </DetailSection>
            <DetailSection title="Scenario: Trigger warning">
              <AnswerBlock>{viewing.scenarioTriggerWarning || "—"}</AnswerBlock>
            </DetailSection>
            <DetailSection title="Scenario: NSFW options">
              <AnswerBlock>{viewing.scenarioNsfwOption || "—"}</AnswerBlock>
            </DetailSection>

            <DetailSection title="FAQ example 1">
              <AnswerBlock>{viewing.faqExample1 || "—"}</AnswerBlock>
            </DetailSection>
            {[2, 3, 4].map((n) => {
              const val = viewing[`faqExample${n}` as keyof ModApp];
              if (!val) return null;
              return (
                <DetailSection key={n} title={`FAQ example ${n}`}>
                  <AnswerBlock>{String(val)}</AnswerBlock>
                </DetailSection>
              );
            })}

            {viewing.rulesKnowledge && (() => {
              const rules = parseRulesKnowledge(viewing.rulesKnowledge);
              const entries = Object.entries(rules).filter(([, v]) => v != null && v !== "");
              if (entries.length === 0) return null;
              const correctCount = entries.filter(([k, v]) => isRulesAnswerCorrect(k, v)).length;
              const totalCount = entries.length;
              const allCorrect = correctCount === totalCount;
              return (
                <DetailSection title="Rules knowledge">
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--totk-dark-ocher)] bg-[rgba(26,22,21,0.5)] px-3 py-2">
                    <span className="text-sm font-semibold text-[var(--totk-ivory)]">
                      {correctCount} of {totalCount} correct
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        allCorrect ? "bg-green-900/50 text-green-200" : "bg-amber-900/50 text-amber-200"
                      }`}
                    >
                      {allCorrect ? "All correct" : "Some incorrect"}
                    </span>
                  </div>
                  <ul className="list-none space-y-3 pl-0">
                    {entries.map(([key, value]) => {
                      const correct = isRulesAnswerCorrect(key, value);
                      const correctAnswer = RULES_KNOWLEDGE_CORRECT[key];
                      return (
                        <li
                          key={key}
                          className={`flex flex-col gap-1.5 rounded-lg border px-0 py-0 overflow-hidden ${
                            correct ? "border-green-700/40 bg-green-900/10" : "border-amber-700/40 bg-amber-900/10"
                          }`}
                        >
                          <span className="px-3 pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--botw-pale)]/90">
                            {RULES_KNOWLEDGE_LABELS[key] || key}
                          </span>
                          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 px-3 pb-2 sm:gap-3">
                            <span className="min-w-0 flex-1 border-l-2 border-[var(--totk-mid-ocher)]/60 bg-[rgba(255,255,255,0.03)] rounded-r py-2 pl-3 pr-3 text-[var(--totk-ivory)] text-[15px]">
                              {value}
                            </span>
                            <span className="shrink-0 flex items-center gap-2">
                              {correct ? (
                                <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-green-200 bg-green-900/40">
                                  <i className="fas fa-check" aria-hidden /> Correct
                                </span>
                              ) : (
                                <>
                                  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-amber-200 bg-amber-900/40">
                                    <i className="fas fa-times" aria-hidden /> Incorrect
                                  </span>
                                  {correctAnswer != null && (
                                    <span className="text-xs text-[var(--botw-pale)]">
                                      Correct: <span className="font-medium text-green-200">{correctAnswer}</span>
                                    </span>
                                  )}
                                </>
                              )}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </DetailSection>
              );
            })()}

            {viewing.otherComments && (
              <DetailSection title="Other comments">
                <AnswerBlock>{viewing.otherComments}</AnswerBlock>
              </DetailSection>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
