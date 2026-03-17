"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/hooks/use-session";

const inputClass =
  "w-full p-3 rounded-lg text-botw-pale transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]";
const inputStyle = {
  background: "rgba(26, 22, 21, 0.9)",
  border: "2px solid var(--totk-dark-ocher)",
};
const labelClass = "font-semibold text-totk-ivory";
const sectionStyle = {
  background: "rgba(32, 36, 44, 0.72)",
  border: "1px solid var(--totk-dark-ocher)",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
};

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/St_Johns",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Helsinki",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Adelaide",
  "Pacific/Auckland",
  "Pacific/Fiji",
];

interface AvailabilityRange {
  start: string;
  end: string;
}

interface FormState {
  discordUsername: string;
  timePerWeek: string;
  conflictHandling: number;
  comfortableModeratingNsfw: "Yes" | "No" | "";
  timezone: string;
  availabilityRanges: AvailabilityRange[];
  howLongInGroup: string;
  reprimandingApproach: string;
  workingAsTeam: string;
  discordModExperience: number;
  framerExperience: number;
  specialSkills: string;
  gameMechanicsExperience: string;
  gameMechanicsSystems: string;
  ideasForMechanics: string;
  npcExperience: string;
  npcApproach: string;
  comfortableLoreDevelopment: string;
  loreTasksEnjoy: string;
  documentationComfort: string;
  documentationExperience: string;
  visualAssetsExperience: string;
  visualAssetsTools: string;
  visualContentManagement: "Yes" | "No" | "Maybe" | "";
  visualContentDetails: string;
  socialMediaManagement: "Yes" | "No" | "Maybe" | "";
  socialMediaDetails: string;
  scenarioTraveller: string;
  scenarioTriggerWarning: string;
  scenarioNsfwOption: string;
  faqExample1: string;
  faqExample2: string;
  faqExample3: string;
  faqExample4: string;
  rulesMinAge: string;
  rulesNsfwWhere: string;
  rulesTravelerWeeks: string;
  rulesActivityChecks: string;
  rulesSafePhrase: string;
  rulesStrikesBan: string;
  rulesWhereToAsk: string;
  rulesAiArtOwn: string;
  otherComments: string;
}

const initialFormState: FormState = {
  discordUsername: "",
  timePerWeek: "",
  conflictHandling: 5,
  comfortableModeratingNsfw: "",
  timezone: "",
  availabilityRanges: [{ start: "", end: "" }],
  howLongInGroup: "",
  reprimandingApproach: "",
  workingAsTeam: "",
  discordModExperience: 5,
  framerExperience: 5,
  specialSkills: "",
  gameMechanicsExperience: "",
  gameMechanicsSystems: "",
  ideasForMechanics: "",
  npcExperience: "",
  npcApproach: "",
  comfortableLoreDevelopment: "",
  loreTasksEnjoy: "",
  documentationComfort: "",
  documentationExperience: "",
  visualAssetsExperience: "",
  visualAssetsTools: "",
  visualContentManagement: "",
  visualContentDetails: "",
  socialMediaManagement: "",
  socialMediaDetails: "",
  scenarioTraveller: "",
  scenarioTriggerWarning: "",
  scenarioNsfwOption: "",
  faqExample1: "",
  faqExample2: "",
  faqExample3: "",
  faqExample4: "",
  rulesMinAge: "",
  rulesNsfwWhere: "",
  rulesTravelerWeeks: "",
  rulesActivityChecks: "",
  rulesSafePhrase: "",
  rulesStrikesBan: "",
  rulesWhereToAsk: "",
  rulesAiArtOwn: "",
  otherComments: "",
};

function ScaleSlider({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <div className="scale-slider-block">
      <label className={`${labelClass} block mb-3`}>{label}</label>
      <div
        className="rounded-xl p-5"
        style={{
          background: "rgba(26, 22, 21, 0.95)",
          border: "2px solid var(--totk-dark-ocher)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
        }}
      >
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
            const selected = value === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                aria-pressed={selected}
                aria-label={`Rate ${n} out of 10`}
                className="scale-number-btn min-w-[2.75rem] w-11 h-11 sm:min-w-[3rem] sm:w-12 sm:h-12 rounded-xl font-semibold text-base sm:text-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[rgba(26,22,21,0.95)] select-none"
                style={
                  selected
                    ? {
                        background: "var(--totk-light-green)",
                        color: "var(--totk-black)",
                        border: "2px solid var(--totk-light-green)",
                        boxShadow: "0 0 16px rgba(73, 213, 156, 0.4)",
                      }
                    : {
                        background: "rgba(117, 105, 80, 0.25)",
                        color: "var(--botw-pale)",
                        border: "2px solid var(--totk-dark-ocher)",
                      }
                }
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between items-center mt-4 gap-4 text-sm" style={{ color: "var(--totk-grey-200)" }}>
          <span className="shrink-0 max-w-[40%]">{lowLabel}</span>
          <span className="shrink-0 text-center font-medium" style={{ color: "var(--totk-light-green)" }}>
            Selected: {value}
          </span>
          <span className="shrink-0 max-w-[40%] text-right">{highLabel}</span>
        </div>
      </div>
    </div>
  );
}

function OptionButtons<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
}) {
  const optionCardStyle = {
    background: "rgba(26, 22, 21, 0.95)",
    border: "2px solid var(--totk-dark-ocher)",
    boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
  };
  return (
    <div>
      <label className={`${labelClass} block mb-3`}>{label}</label>
      <div
        className="rounded-xl p-4 flex flex-wrap gap-3"
        style={optionCardStyle}
      >
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              aria-pressed={selected}
              className="option-btn min-w-[5rem] px-6 py-3 rounded-xl font-semibold text-base transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] focus:ring-offset-2 focus:ring-offset-[rgba(26,22,21,0.95)] select-none"
              style={
                selected
                  ? {
                      background: "var(--totk-light-green)",
                      color: "var(--totk-black)",
                      border: "2px solid var(--totk-light-green)",
                      boxShadow: "0 0 16px rgba(73, 213, 156, 0.35)",
                    }
                  : {
                      background: "rgba(117, 105, 80, 0.25)",
                      color: "var(--botw-pale)",
                      border: "2px solid var(--totk-dark-ocher)",
                    }
              }
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ModApplicationPage() {
  const { user, loading: sessionLoading } = useSession();
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.username && !formState.discordUsername) {
      setFormState((s) => ({ ...s, discordUsername: user.username ?? "" }));
    }
  }, [user?.username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError("You must be logged in to apply.");
      return;
    }
    if (!formState.comfortableModeratingNsfw) {
      setError("Please answer whether you're comfortable moderating NSFW channels.");
      return;
    }
    if (!formState.visualContentManagement) {
      setError("Please answer whether you're interested in creating official art and graphics for the group.");
      return;
    }
    if (!formState.socialMediaManagement) {
      setError("Please answer whether you're interested in social media management.");
      return;
    }
    const nsfwSelected = formState.scenarioNsfwOption.split(", ").filter(Boolean);
    if (nsfwSelected.length === 0) {
      setError("Please select at least one NSFW scenario option (which images you would comment on as a mod).");
      return;
    }
    const faqExamples = [formState.faqExample1, formState.faqExample2, formState.faqExample3, formState.faqExample4];
    if (faqExamples.some((t) => !t.trim())) {
      setError("Please provide your response to all 4 FAQ examples.");
      return;
    }
    if (!formState.timezone.trim()) {
      setError("Please select your timezone.");
      return;
    }
    const validRanges = formState.availabilityRanges.filter((r) => r.start && r.end);
    if (validRanges.length === 0) {
      setError("Please add at least one availability time range (start and end time).");
      return;
    }

    // Rules knowledge — must answer correctly
    const minAgeOk = formState.rulesMinAge.trim() === "18";
    const nsfwOk = formState.rulesNsfwWhere === "designated";
    const travelerOk = formState.rulesTravelerWeeks.trim() === "2";
    const activityOk = formState.rulesActivityChecks.trim() === "3";
    const safePhraseOk = formState.rulesSafePhrase.trim().toLowerCase() === "windfish says no";
    const strikesOk = formState.rulesStrikesBan.trim() === "4";
    const whereToAskOk = formState.rulesWhereToAsk === "faq";
    const aiArtOk = formState.rulesAiArtOwn === "No";
    if (!minAgeOk || !nsfwOk || !travelerOk || !activityOk || !safePhraseOk || !strikesOk || !whereToAskOk || !aiArtOk) {
      setError("One or more rules knowledge answers are incorrect. Please review the server rules and try again.");
      return;
    }

    const timezoneAndAvailability = JSON.stringify({
      timezone: formState.timezone,
      ranges: formState.availabilityRanges,
    });

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/mod-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...formState,
          timezoneAndAvailability,
          rulesKnowledge: JSON.stringify({
            rulesMinAge: formState.rulesMinAge,
            rulesNsfwWhere: formState.rulesNsfwWhere,
            rulesTravelerWeeks: formState.rulesTravelerWeeks,
            rulesActivityChecks: formState.rulesActivityChecks,
            rulesSafePhrase: formState.rulesSafePhrase,
            rulesStrikesBan: formState.rulesStrikesBan,
            rulesWhereToAsk: formState.rulesWhereToAsk,
            rulesAiArtOwn: formState.rulesAiArtOwn,
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      setShowModal(true);
      setFormState(initialFormState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = () => setShowModal(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showModal) closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showModal]);

  if (sessionLoading) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-[var(--totk-light-green)] mb-4 block" />
          <p className="text-[var(--botw-pale)]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-6 overflow-auto">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3 md:gap-4">
        <img alt="" className="h-4 w-auto sm:h-5 md:h-6" src="/Side=Left.svg" />
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-green)]">
          ROTW Mod Application
        </h1>
        <img alt="" className="h-4 w-auto sm:h-5 md:h-6" src="/Side=Right.svg" />
      </div>

      {!user ? (
        <div className="flex-1 flex items-center justify-center">
          <div
            className="rounded-xl p-8 md:p-12 text-center backdrop-blur-sm max-w-2xl w-full"
            style={{
              background: "linear-gradient(135deg, rgba(88, 101, 242, 0.1), rgba(88, 101, 242, 0.05))",
              border: "2px solid rgba(88, 101, 242, 0.3)",
            }}
          >
            <div className="text-6xl text-[#5865F2] mb-6">
              <i className="fab fa-discord" />
            </div>
            <h3 className="text-2xl md:text-3xl font-bold text-totk-ivory mb-4">Login Required</h3>
            <p className="text-botw-pale mb-8">
              You must be logged in with Discord to apply. This ensures you're a member of Roots.
            </p>
            <a
              href="/api/auth/discord"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-lg font-semibold text-white text-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              style={{ background: "#5865F2", boxShadow: "0 4px 20px rgba(88, 101, 242, 0.4)" }}
            >
              <i className="fab fa-discord text-xl" />
              Login with Discord
            </a>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto w-full pb-8">
          {/* Eligibility note */}
          <div className="rounded-xl p-4 backdrop-blur-sm space-y-3" style={sectionStyle}>
            <p className="text-botw-pale text-sm">
              Please note: when applying to be a mod, <strong className="text-totk-ivory">90% of modding is done behind the scenes.</strong> In addition, if you cannot moderate NSFW channels or have not been a member of the group for at least 1 year, it disqualifies mod eligibility.
            </p>
            <p className="text-botw-pale text-sm">
              As of March 2026, we are prioritising applications from candidates who can support the following areas:
            </p>
            <ul className="list-disc list-inside text-botw-pale text-sm space-y-1 pl-1">
              <li>Social media management</li>
              <li>Graphics design</li>
              <li>Running quests and events</li>
              <li>Task and timeline coordination</li>
            </ul>
          </div>

          {/* Basic info */}
          <div className="rounded-xl p-6 backdrop-blur-sm space-y-4" style={sectionStyle}>
            <h2 className="text-lg font-semibold text-totk-light-green border-b border-[var(--totk-dark-ocher)] pb-2">
              Basic information
            </h2>
            <div>
              <label htmlFor="discordUsername" className={labelClass}>Discord username *</label>
              <input
                id="discordUsername"
                type="text"
                required
                className={inputClass}
                style={inputStyle}
                value={formState.discordUsername}
                onChange={(e) => setFormState({ ...formState, discordUsername: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="timePerWeek" className={labelClass}>How much time a week can you commit to Roots? *</label>
              <input
                id="timePerWeek"
                type="text"
                required
                placeholder="e.g. 5–10 hours"
                className={inputClass}
                style={inputStyle}
                value={formState.timePerWeek}
                onChange={(e) => setFormState({ ...formState, timePerWeek: e.target.value })}
              />
            </div>
            <ScaleSlider
              label="How well do you handle conflict? (1 = Not well at all, 10 = Very well) *"
              value={formState.conflictHandling}
              onChange={(n) => setFormState({ ...formState, conflictHandling: n })}
              lowLabel="Not well at all"
              highLabel="Very well"
            />
            <OptionButtons
              label="Are you comfortable moderating the NSFW channels? *"
              value={formState.comfortableModeratingNsfw}
              onChange={(v) => setFormState({ ...formState, comfortableModeratingNsfw: v })}
              options={["Yes", "No"]}
            />
            <div className="space-y-4">
              <label className={labelClass}>What is your timezone and what times are you most available? *</label>
              <div>
                <label htmlFor="timezone" className="block text-sm text-botw-pale mb-1">Timezone</label>
                <select
                  id="timezone"
                  required
                  className={inputClass}
                  style={inputStyle}
                  value={formState.timezone}
                  onChange={(e) => setFormState({ ...formState, timezone: e.target.value })}
                >
                  <option value="">Select your timezone</option>
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className="block text-sm text-botw-pale mb-2">When are you most available? (in your local time)</span>
                {formState.availabilityRanges.map((range, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 mb-2">
                    <input
                      type="time"
                      className={`${inputClass} flex-1 min-w-[100px] max-w-[140px]`}
                      style={inputStyle}
                      value={range.start}
                      onChange={(e) => {
                        const next = [...formState.availabilityRanges];
                        next[i] = { ...next[i], start: e.target.value };
                        setFormState({ ...formState, availabilityRanges: next });
                      }}
                      aria-label={`Range ${i + 1} start time`}
                    />
                    <span className="text-botw-pale">to</span>
                    <input
                      type="time"
                      className={`${inputClass} flex-1 min-w-[100px] max-w-[140px]`}
                      style={inputStyle}
                      value={range.end}
                      onChange={(e) => {
                        const next = [...formState.availabilityRanges];
                        next[i] = { ...next[i], end: e.target.value };
                        setFormState({ ...formState, availabilityRanges: next });
                      }}
                      aria-label={`Range ${i + 1} end time`}
                    />
                    {formState.availabilityRanges.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setFormState({
                          ...formState,
                          availabilityRanges: formState.availabilityRanges.filter((_, j) => j !== i),
                        })}
                        className="px-2 py-1 rounded text-sm text-botw-pale hover:bg-white/10 transition-colors"
                        aria-label="Remove this range"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFormState({
                    ...formState,
                    availabilityRanges: [...formState.availabilityRanges, { start: "", end: "" }],
                  })}
                  className="mt-1 text-sm font-medium transition-colors hover:underline"
                  style={{ color: "var(--totk-light-green)" }}
                >
                  + Add another time range
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="howLongInGroup" className={labelClass}>How long have you been in the group? *</label>
              <input
                id="howLongInGroup"
                type="text"
                required
                placeholder="e.g. 1 year, 6 months"
                className={inputClass}
                style={inputStyle}
                value={formState.howLongInGroup}
                onChange={(e) => setFormState({ ...formState, howLongInGroup: e.target.value })}
              />
            </div>
          </div>

          {/* Approach */}
          <div className="rounded-xl p-6 backdrop-blur-sm space-y-4" style={sectionStyle}>
            <h2 className="text-lg font-semibold text-totk-light-green border-b border-[var(--totk-dark-ocher)] pb-2">
              Approach & experience
            </h2>
            <div>
              <label htmlFor="reprimandingApproach" className={labelClass}>Are you comfortable reprimanding members if they break rules? How would you approach it? *</label>
              <textarea
                id="reprimandingApproach"
                required
                rows={3}
                className={inputClass}
                style={inputStyle}
                value={formState.reprimandingApproach}
                onChange={(e) => setFormState({ ...formState, reprimandingApproach: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="workingAsTeam" className={labelClass}>What does working as a team mean to you? *</label>
              <textarea
                id="workingAsTeam"
                required
                rows={3}
                className={inputClass}
                style={inputStyle}
                value={formState.workingAsTeam}
                onChange={(e) => setFormState({ ...formState, workingAsTeam: e.target.value })}
              />
            </div>
            <ScaleSlider
              label="Discord server moderation / behind-the-scenes experience (1–10) *"
              value={formState.discordModExperience}
              onChange={(n) => setFormState({ ...formState, discordModExperience: n })}
              lowLabel="Absolutely none"
              highLabel="I am Discord God"
            />
            <ScaleSlider
              label="Framer (website) experience (1–10) *"
              value={formState.framerExperience}
              onChange={(n) => setFormState({ ...formState, framerExperience: n })}
              lowLabel="Never used it"
              highLabel="Very comfortable"
            />
            <div>
              <label htmlFor="specialSkills" className={labelClass}>Do you have any special skills you can bring to the mod team / Roots? *</label>
              <textarea
                id="specialSkills"
                required
                rows={3}
                className={inputClass}
                style={inputStyle}
                value={formState.specialSkills}
                onChange={(e) => setFormState({ ...formState, specialSkills: e.target.value })}
              />
            </div>
          </div>

          {/* Game, lore, docs, visual */}
          <div className="rounded-xl p-6 backdrop-blur-sm space-y-4" style={sectionStyle}>
            <h2 className="text-lg font-semibold text-totk-light-green border-b border-[var(--totk-dark-ocher)] pb-2">
              Game mechanics, lore & documentation
            </h2>
            <div>
              <label htmlFor="gameMechanicsExperience" className={labelClass}>Do you have experience creating or managing game mechanics (e.g. combat, mounts, gathering)? *</label>
              <textarea
                id="gameMechanicsExperience"
                required
                rows={2}
                className={inputClass}
                style={inputStyle}
                value={formState.gameMechanicsExperience}
                onChange={(e) => setFormState({ ...formState, gameMechanicsExperience: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="gameMechanicsSystems" className={labelClass}>If yes, which systems are you most familiar with or interested in helping with?</label>
              <input
                id="gameMechanicsSystems"
                type="text"
                className={inputClass}
                style={inputStyle}
                value={formState.gameMechanicsSystems}
                onChange={(e) => setFormState({ ...formState, gameMechanicsSystems: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="ideasForMechanics" className={labelClass}>Do you have any ideas for new mechanics or improvements to Roots&apos; current systems? *</label>
              <textarea
                id="ideasForMechanics"
                required
                rows={3}
                className={inputClass}
                style={inputStyle}
                value={formState.ideasForMechanics}
                onChange={(e) => setFormState({ ...formState, ideasForMechanics: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="npcExperience" className={labelClass}>Do you have experience working with or roleplaying as NPCs in events or server interactions? *</label>
              <textarea
                id="npcExperience"
                required
                rows={2}
                className={inputClass}
                style={inputStyle}
                value={formState.npcExperience}
                onChange={(e) => setFormState({ ...formState, npcExperience: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="npcApproach" className={labelClass}>If yes, what&apos;s your approach to keeping NPCs dynamic, helpful, or immersive?</label>
              <textarea
                id="npcApproach"
                rows={2}
                className={inputClass}
                style={inputStyle}
                value={formState.npcApproach}
                onChange={(e) => setFormState({ ...formState, npcApproach: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="comfortableLoreDevelopment" className={labelClass}>Are you comfortable helping develop or update server lore (e.g. villages, regions, world history)? *</label>
              <textarea
                id="comfortableLoreDevelopment"
                required
                rows={2}
                className={inputClass}
                style={inputStyle}
                value={formState.comfortableLoreDevelopment}
                onChange={(e) => setFormState({ ...formState, comfortableLoreDevelopment: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="loreTasksEnjoy" className={labelClass}>What kind of lore-based tasks do you enjoy most?</label>
              <input
                id="loreTasksEnjoy"
                type="text"
                className={inputClass}
                style={inputStyle}
                value={formState.loreTasksEnjoy}
                onChange={(e) => setFormState({ ...formState, loreTasksEnjoy: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="documentationComfort" className={labelClass}>Are you comfortable helping with documentation (e.g. formatting Google Docs, organizing info, writing FAQs)? *</label>
              <textarea
                id="documentationComfort"
                required
                rows={2}
                className={inputClass}
                style={inputStyle}
                value={formState.documentationComfort}
                onChange={(e) => setFormState({ ...formState, documentationComfort: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="documentationExperience" className={labelClass}>Please describe any experience you have in this area.</label>
              <textarea
                id="documentationExperience"
                rows={2}
                className={inputClass}
                style={inputStyle}
                value={formState.documentationExperience}
                onChange={(e) => setFormState({ ...formState, documentationExperience: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="visualAssetsExperience" className={labelClass}>Do you have experience creating visual assets (icons, maps, banners, UI, digital art)? Mention tools (Photoshop, Canva, CSP, etc.). *</label>
              <textarea
                id="visualAssetsExperience"
                required
                rows={2}
                className={inputClass}
                style={inputStyle}
                value={formState.visualAssetsExperience}
                onChange={(e) => setFormState({ ...formState, visualAssetsExperience: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="visualAssetsTools" className={labelClass}>Tools you use (optional)</label>
              <input
                id="visualAssetsTools"
                type="text"
                className={inputClass}
                style={inputStyle}
                value={formState.visualAssetsTools}
                onChange={(e) => setFormState({ ...formState, visualAssetsTools: e.target.value })}
              />
            </div>
            <OptionButtons
              label="Are you interested in being an artist for the group—creating official art and graphics for Roots? (e.g. icons, banners, server art) *"
              value={formState.visualContentManagement}
              onChange={(v) => setFormState({ ...formState, visualContentManagement: v })}
              options={["Yes", "No", "Maybe"]}
            />
            <div>
              <label htmlFor="visualContentDetails" className={labelClass}>If yes or maybe: what kind of art or graphics are you most interested in? (optional)</label>
              <input
                id="visualContentDetails"
                type="text"
                className={inputClass}
                style={inputStyle}
                value={formState.visualContentDetails}
                onChange={(e) => setFormState({ ...formState, visualContentDetails: e.target.value })}
              />
            </div>
            <OptionButtons
              label="Are you interested in helping with social media management for Roots? (posting, scheduling, engagement, etc.) *"
              value={formState.socialMediaManagement}
              onChange={(v) => setFormState({ ...formState, socialMediaManagement: v })}
              options={["Yes", "No", "Maybe"]}
            />
            <div>
              <label htmlFor="socialMediaDetails" className={`${labelClass} block mt-3`}>If yes or maybe: which platforms or what experience do you have? (optional)</label>
              <input
                id="socialMediaDetails"
                type="text"
                className={inputClass}
                style={inputStyle}
                value={formState.socialMediaDetails}
                onChange={(e) => setFormState({ ...formState, socialMediaDetails: e.target.value })}
              />
            </div>
          </div>

          {/* Scenarios */}
          <div className="rounded-xl p-6 backdrop-blur-sm space-y-4" style={sectionStyle}>
            <h2 className="text-lg font-semibold text-totk-light-green border-b border-[var(--totk-dark-ocher)] pb-2">
              Scenario questions
            </h2>
            <div>
              <label htmlFor="scenarioTraveller" className={labelClass}>
                One day, a new Traveller joins. They follow the rules, but something about their attitude rubs you the wrong way. A member DMs you saying they&apos;re also uncomfortable with this person. What do you do? *
              </label>
              <textarea
                id="scenarioTraveller"
                required
                rows={4}
                className={inputClass}
                style={inputStyle}
                value={formState.scenarioTraveller}
                onChange={(e) => setFormState({ ...formState, scenarioTraveller: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="scenarioTriggerWarning" className={labelClass}>
                Member A mentions trigger #2 in the server. You give them a warning. They become upset and say they didn&apos;t mean it / didn&apos;t realize it was a trigger, and feel unfairly warned. How do you handle it? *
              </label>
              <textarea
                id="scenarioTriggerWarning"
                required
                rows={4}
                className={inputClass}
                style={inputStyle}
                value={formState.scenarioTriggerWarning}
                onChange={(e) => setFormState({ ...formState, scenarioTriggerWarning: e.target.value })}
              />
            </div>
            <div>
              <label className={`${labelClass} block mb-3`}>
                Someone posts something potentially NSFW outside the NSFW channels. Which of these would you consider NSFW enough to comment on as a mod? (Select all that apply) *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    key: "Option 1",
                    src: "https://lh7-rt.googleusercontent.com/formsz/AN7BsVBn98NP8FeVr-ND8gipGjA6UnTXwWfPQiC036yfUwPodQGK_AR8cPyTPYexClR1LGMgjHtsWySSIcMdrRYOLvZxFIrYDeRtteBWD6QTtscPVT2do68rMnLlAjhLWdQcJhmwD3ihcRZh_8CaUsNtuOoTSI5-hz7kV0MQGKzkk4VZFC32Q7ZKxBdSIIZ9sd-opkdzqhIbv-BZWWo=w260?key=Ps4PYHDPps94v3xQ-ZVCGQ",
                  },
                  {
                    key: "Option 2",
                    src: "https://lh7-rt.googleusercontent.com/formsz/AN7BsVDnbqDQsAiyacVmdEE-1U8jFQft7FPRw5Goe9xAQt6czJwMuttLJcp-avgN7EqyPmfI20AXB_YYgGCeUgpzQ9YbrfFl3NirTPcyg7npwmt5EF7wZ8M3RR_qlB8k-CgWug1e3LL54LoD1U2XxckM99DVs1dOmT4jcAF3a6bhkPyY7XW2FB3ZpExyMAg9EQI4Q0QVVcrBd5NowEQ=w260?key=Ps4PYHDPps94v3xQ-ZVCGQ",
                  },
                  {
                    key: "Option 3",
                    src: "https://lh7-rt.googleusercontent.com/formsz/AN7BsVDlOjTmGFi7reN_j1BvjW_Wm6i12fCf1gVwH6miouOoOLq_u7FTkuAffelagV8T52vh5sfFUMaDPO1hl8R8yxEyUTaejRWYuv_7-68Xcj9MvJ9g1TDWroa5QWMGN3QEopL-Sv4WYLXeVmVef66X4OzWpDa3xTi5fWmomcSiOKsZ769MZwrHLMEy495icMFWAn1QI5Gdh34qZfnx=w238?key=Ps4PYHDPps94v3xQ-ZVCGQ",
                  },
                ].map(({ key, src }) => {
                  const selected = formState.scenarioNsfwOption.split(", ").filter(Boolean).includes(key);
                  return (
                    <label
                      key={key}
                      className="flex flex-col items-center gap-2 cursor-pointer rounded-lg p-3 transition-colors"
                      style={{
                        background: selected ? "rgba(73, 213, 156, 0.15)" : "rgba(26, 22, 21, 0.6)",
                        border: `2px solid ${selected ? "var(--totk-light-green)" : "var(--totk-dark-ocher)"}`,
                      }}
                    >
                      <img
                        src={src}
                        alt={key}
                        className="w-full max-w-[260px] h-auto rounded object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <span className="font-medium text-totk-ivory">{key}</span>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          const current = formState.scenarioNsfwOption.split(", ").filter(Boolean);
                          const next = current.includes(key)
                            ? current.filter((o) => o !== key)
                            : [...current, key].sort();
                          setFormState({ ...formState, scenarioNsfwOption: next.join(", ") });
                        }}
                        className="sr-only"
                        aria-label={`Select ${key}`}
                      />
                    </label>
                  );
                })}
              </div>
              {formState.scenarioNsfwOption.length === 0 && (
                <p className="mt-2 text-sm text-botw-pale">Select at least one option.</p>
              )}
            </div>
          </div>

          {/* FAQ examples - 4 with images */}
          <div className="rounded-xl p-6 backdrop-blur-sm space-y-6" style={sectionStyle}>
            <h2 className="text-lg font-semibold text-totk-light-green border-b border-[var(--totk-dark-ocher)] pb-2">
              FAQ channel response examples
            </h2>
            {[
              {
                n: 1,
                src: "https://lh7-rt.googleusercontent.com/formsz/AN7BsVAHhIubcoinxbhgkqBX8I0H_pIToCATaT1dKmBaBBDLG4AEXph9dp1OrsGhTFOHQnB8YqnWDVQ6e-yAWtXreYLjf7kvyhLsdkDBcnZbg5S0-NnfNs13sP7JU2qQ_ZMSDkyL3yku156DPLKfMrvzLLlezLB8AbEDMO58vsTxEYwPyzDhyCyurXwN965UIUdEeqcx9nsZyM4qMtgI=w587?key=Ps4PYHDPps94v3xQ-ZVCGQ",
              },
              {
                n: 2,
                src: "https://lh7-rt.googleusercontent.com/formsz/AN7BsVDDJmnwUAWcHOx5W-Fg2EQo-ciQkxE85gGyJLgIeMC5GgcAC0EpPhFbbb3OS9wonFUJBqIbBsz7JAo_iVh8fHbGsvoK73W5cLmstEYUmJmwscGNHmikd87B9LInoO4WZs9BOl2CH_qsUoz0qbc0Z-AA9fasLt1L7C9CAFLb1QzKqUMSckDck3gE4XEWpmbPMoDheuSreglO7AuM=w587?key=Ps4PYHDPps94v3xQ-ZVCGQ",
              },
              {
                n: 3,
                src: "https://lh7-rt.googleusercontent.com/formsz/AN7BsVDvGbVFFjUzl_Zoo_DXS0mK3R3vyv0ypyRT438VW9s6OgxBWIctoEyAhjPTpacB6oT2_c1bNB0X6uQnujm7KbsIwZWYAWPonATR6CgvufEw7kBpjlSxeOiYRXet5b2MoH92Z21OACyNICfFkwC2tYL-922WoRXLohkmQRlvJpB1DqF0heaAYkZlj4yILEXaQOyj-u6-EIwZQSg=w563?key=Ps4PYHDPps94v3xQ-ZVCGQ",
              },
              {
                n: 4,
                src: "https://lh7-rt.googleusercontent.com/formsz/AN7BsVDmmt404BryP7rWO63HUOMw_nQUwh1ImRvyhjaFRaqoo4Ibycuv8d3wlPDniFi9ZjebEnjWiGfYQMwEAyBQVWvkhIUQLoAX5xVXmB-7dYfdEfFsSEEeevHnYUO6miH89lPaLTopC0NGwDnZYahExBNyP-O4nMjk6P0lDgQsMpagl4nihYa-ORyR2KUzsiiG-5G_f30mnQ3g5e8=w578?key=Ps4PYHDPps94v3xQ-ZVCGQ",
              },
            ].map(({ n, src }) => (
              <div
                key={n}
                className="rounded-lg p-4 space-y-3 border-2 border-[var(--totk-dark-ocher)] bg-[rgba(26,22,21,0.5)]"
              >
                <h3 className="text-base font-bold text-totk-light-green border-b border-[var(--totk-dark-ocher)] pb-2">
                  Example {n} of 4
                </h3>
                <p className="text-sm text-botw-pale">
                  A member or traveler asks a question in the FAQ channel. How would you respond to the following example?
                </p>
                <div className="rounded-lg overflow-hidden border border-[var(--totk-dark-ocher)] bg-[rgba(26,22,21,0.6)] flex justify-center">
                  <img
                    src={src}
                    alt={`Example ${n}: FAQ question from a member or traveler`}
                    referrerPolicy="no-referrer"
                    className="max-w-full h-auto max-h-[400px] object-contain"
                  />
                </div>
                <div>
                  <label htmlFor={`faqExample${n}`} className={labelClass}>Your response to example {n} *</label>
                  <textarea
                    id={`faqExample${n}`}
                    rows={4}
                    className={inputClass}
                    style={inputStyle}
                    value={formState[`faqExample${n}` as keyof FormState] as string}
                    onChange={(e) => setFormState({ ...formState, [`faqExample${n}`]: e.target.value })}
                    required
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Rules knowledge */}
          <div className="rounded-xl p-6 backdrop-blur-sm space-y-4" style={sectionStyle}>
            <h2 className="text-lg font-semibold text-totk-light-green border-b border-[var(--totk-dark-ocher)] pb-2">
              Rules knowledge
            </h2>
            <p className="text-sm text-botw-pale">
              Answer the following from the server rules. Incorrect answers will prevent submission — review the rules if needed.
            </p>
            <div className="grid gap-4 sm:grid-cols-1">
              <div>
                <label htmlFor="rulesMinAge" className={labelClass}>What is the minimum age to join Roots of the Wild? (number only) *</label>
                <input
                  id="rulesMinAge"
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  style={inputStyle}
                  value={formState.rulesMinAge}
                  onChange={(e) => setFormState({ ...formState, rulesMinAge: e.target.value })}
                  placeholder="Enter number"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="rulesNsfwWhere" className={labelClass}>Where may NSFW content be posted? *</label>
                <select
                  id="rulesNsfwWhere"
                  className={inputClass}
                  style={inputStyle}
                  value={formState.rulesNsfwWhere}
                  onChange={(e) => setFormState({ ...formState, rulesNsfwWhere: e.target.value })}
                >
                  <option value="">Select an answer</option>
                  <option value="anywhere">Anywhere in the server</option>
                  <option value="designated">Only in designated NSFW channels</option>
                  <option value="dms">Only in DMs</option>
                </select>
              </div>
              <div>
                <label htmlFor="rulesTravelerWeeks" className={labelClass}>How many weeks do Travelers have to become full members before being removed? (number only) *</label>
                <input
                  id="rulesTravelerWeeks"
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  style={inputStyle}
                  value={formState.rulesTravelerWeeks}
                  onChange={(e) => setFormState({ ...formState, rulesTravelerWeeks: e.target.value })}
                  placeholder="Enter number"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="rulesActivityChecks" className={labelClass}>After how many consecutive activity checks can an inactive member be removed? (number only) *</label>
                <input
                  id="rulesActivityChecks"
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  style={inputStyle}
                  value={formState.rulesActivityChecks}
                  onChange={(e) => setFormState({ ...formState, rulesActivityChecks: e.target.value })}
                  placeholder="Enter number"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="rulesSafePhrase" className={labelClass}>What is the safe phrase that must be respected (when posted, the conversation must stop)? *</label>
                <input
                  id="rulesSafePhrase"
                  type="text"
                  className={inputClass}
                  style={inputStyle}
                  value={formState.rulesSafePhrase}
                  onChange={(e) => setFormState({ ...formState, rulesSafePhrase: e.target.value })}
                  placeholder="Enter the phrase from the rules"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="rulesStrikesBan" className={labelClass}>How many strikes before a permanent ban? (number only) *</label>
                <input
                  id="rulesStrikesBan"
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  style={inputStyle}
                  value={formState.rulesStrikesBan}
                  onChange={(e) => setFormState({ ...formState, rulesStrikesBan: e.target.value })}
                  placeholder="Enter number"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="rulesWhereToAsk" className={labelClass}>For group questions or concerns, where should members be directed? *</label>
                <select
                  id="rulesWhereToAsk"
                  className={inputClass}
                  style={inputStyle}
                  value={formState.rulesWhereToAsk}
                  onChange={(e) => setFormState({ ...formState, rulesWhereToAsk: e.target.value })}
                >
                  <option value="">Select an answer</option>
                  <option value="mod-dm">DM mod personal accounts</option>
                  <option value="faq">FAQ & suggestions channel (or admin DM for in-depth issues)</option>
                  <option value="any">Any channel</option>
                </select>
              </div>
              <div>
                <label htmlFor="rulesAiArtOwn" className={labelClass}>May AI-generated art be presented as your own work for apps or participation? *</label>
                <select
                  id="rulesAiArtOwn"
                  className={inputClass}
                  style={inputStyle}
                  value={formState.rulesAiArtOwn}
                  onChange={(e) => setFormState({ ...formState, rulesAiArtOwn: e.target.value })}
                >
                  <option value="">Select an answer</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>
          </div>

          {/* Other comments */}
          <div className="rounded-xl p-6 backdrop-blur-sm space-y-4" style={sectionStyle}>
            <label htmlFor="otherComments" className={labelClass}>Any other comments you&apos;d like to add?</label>
            <textarea
              id="otherComments"
              rows={3}
              className={inputClass}
              style={inputStyle}
              value={formState.otherComments}
              onChange={(e) => setFormState({ ...formState, otherComments: e.target.value })}
            />
          </div>

          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{
                background: "rgba(231, 76, 60, 0.15)",
                border: "1px solid rgba(231, 76, 60, 0.5)",
                color: "#e74c3c",
              }}
            >
              <i className="fas fa-exclamation-circle" />
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed hover:shadow-lg hover:-translate-y-0.5"
              style={{ background: "var(--totk-light-green)", color: "var(--totk-black)" }}
            >
              {isSubmitting ? (
                <>
                  <i className="fas fa-spinner fa-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <i className="fas fa-paper-plane" />
                  Submit application
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Success modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(8px)" }}
            onClick={closeModal}
          />
          <div
            className="relative rounded-2xl overflow-hidden max-w-[90vw] w-[400px] animate-in zoom-in-95 duration-300"
            style={{
              background: "var(--botw-warm-black)",
              border: "1px solid var(--totk-dark-ocher)",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div
              className="p-6 pb-4 text-center relative"
              style={{ background: "linear-gradient(135deg, var(--totk-light-green), var(--totk-green))" }}
            >
              <h3 className="text-xl font-semibold text-totk-black">Application submitted</h3>
              <button
                onClick={closeModal}
                aria-label="Close"
                className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
                style={{ background: "rgba(0, 0, 0, 0.2)", color: "var(--totk-black)" }}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="p-8 text-center">
              <i className="fas fa-check-circle text-5xl text-totk-light-green mb-4" />
              <p className="text-lg font-medium text-totk-ivory">
                The team will review your application and get back to you.
              </p>
            </div>
            <div className="px-6 pb-6 text-center">
              <button
                onClick={closeModal}
                className="px-8 py-3 rounded-lg font-semibold transition-all duration-200 hover:-translate-y-0.5"
                style={{ background: "var(--totk-light-green)", color: "var(--totk-black)" }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
