"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "@/hooks/use-session";

const REGIONS = [
  { value: "eldin" as const, label: "Eldin", village: "Rudania", square: "H5", quadrant: "Q3", banner: "/assets/banners/Rudania1.png", crest: `/assets/icons/${encodeURIComponent("[RotW] village crest_rudania_.png")}` },
  { value: "lanayru" as const, label: "Lanayru", village: "Inariko", square: "H8", quadrant: "Q2", banner: "/assets/banners/Inariko1.png", crest: `/assets/icons/${encodeURIComponent("[RotW] village crest_inariko_.png")}` },
  { value: "faron" as const, label: "Faron", village: "Vhintl", square: "F10", quadrant: "Q4", banner: "/assets/banners/Vhintl1.png", crest: `/assets/icons/${encodeURIComponent("[RotW] village crest_vhintl_.png")}` },
] as const;

type RegionValue = (typeof REGIONS)[number]["value"];

type MyExpedition = {
  partyId: string;
  region: string;
  status: string;
  square: string;
  quadrant: string;
  createdAt?: string;
};

export default function ExplorePage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const [region, setRegion] = useState<RegionValue | null>(null);
  const [partyIdInput, setPartyIdInput] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [myExpeditions, setMyExpeditions] = useState<MyExpedition[]>([]);
  const [myExpeditionsLoading, setMyExpeditionsLoading] = useState(false);

  const createExpedition = useCallback(async () => {
    if (!region) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/explore/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "Failed to create expedition");
        return;
      }
      const partyId = data.partyId as string;
      router.push(`/explore/${partyId}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setCreating(false);
    }
  }, [region, router]);

  const goToExpedition = useCallback(() => {
    const id = partyIdInput.trim().toUpperCase();
    if (!id) return;
    router.push(`/explore/${id}`);
  }, [partyIdInput, router]);

  const fetchMyExpeditions = useCallback(async () => {
    setMyExpeditionsLoading(true);
    try {
      const res = await fetch("/api/explore/parties", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMyExpeditions(Array.isArray(data.parties) ? data.parties : []);
      } else {
        setMyExpeditions([]);
      }
    } catch {
      setMyExpeditions([]);
    } finally {
      setMyExpeditionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) fetchMyExpeditions();
    else setMyExpeditions([]);
  }, [user?.id, fetchMyExpeditions]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <i className="fa-solid fa-spinner fa-spin text-2xl text-[var(--totk-light-green)]" aria-hidden />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-lg">
          <div className="mb-4 sm:mb-6 flex items-center justify-center gap-2 sm:gap-4">
            <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-ocher)]">Explore</h1>
            <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
          </div>
          <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] p-6 shadow-xl">
            <p className="mb-4 text-sm text-[var(--botw-pale)]">
              Log in to create or join an expedition. Share the expedition link so others can pick their character and items.
            </p>
            <a
              href="/api/auth/discord"
              className="inline-block rounded-md bg-[#5865F2] px-5 py-2.5 font-bold text-white transition-colors hover:bg-[#4752C4]"
            >
              Login with Discord
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="relative mb-8 overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] shadow-lg">
          <div className="relative h-32 w-full bg-[var(--botw-warm-black)] sm:h-40">
            <Image
              src="/ROTW_background_blue.jpg"
              alt=""
              fill
              className="object-cover opacity-70"
              priority
              sizes="(max-width: 768px) 100vw, 672px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--botw-warm-black)]/60 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-2 p-4">
              <div className="flex items-center justify-center gap-2 sm:gap-4">
                <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
                <h1 className="text-xl font-bold text-[var(--totk-ivory)] drop-shadow-md sm:text-2xl md:text-3xl">Explore</h1>
                <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
              </div>
              <p className="text-center text-sm text-[var(--totk-grey-200)]">
                Create or join an expedition. Share the link—everyone picks character and items on the same page.
              </p>
            </div>
          </div>
        </div>

        {myExpeditions.length > 0 && (
          <section className="mb-8 rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/20 to-[var(--botw-warm-black)]/60 p-4 shadow-lg md:p-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[var(--totk-light-green)]">
                <i className="fa-solid fa-list text-lg" aria-hidden />
              </span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                Your expeditions
              </h2>
            </div>
            {myExpeditionsLoading ? (
              <p className="text-sm text-[var(--totk-grey-200)]">
                <i className="fa-solid fa-spinner fa-spin mr-2" aria-hidden />
                Loading…
              </p>
            ) : (
              <ul className="space-y-2">
                {myExpeditions.map((exp) => {
                  const regionLabel = REGIONS.find((r) => r.value === exp.region)?.label ?? exp.region;
                  const statusLabel = exp.status === "open" ? "Open" : exp.status === "started" ? "In progress" : exp.status === "completed" ? "Ended" : exp.status;
                  return (
                    <li key={exp.partyId}>
                      <Link
                        href={`/explore/${exp.partyId}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 px-3 py-2.5 text-sm transition hover:border-[var(--totk-light-green)]/50 hover:bg-[var(--botw-warm-black)]/70"
                      >
                        <span className="font-mono font-semibold text-[var(--totk-ivory)]">{exp.partyId}</span>
                        <span className="text-[var(--totk-grey-200)]">{regionLabel}</span>
                        <span className="rounded bg-[var(--totk-dark-ocher)]/40 px-2 py-0.5 text-xs uppercase tracking-wider text-[var(--totk-grey-200)]">
                          {statusLabel}
                        </span>
                        <span className="text-xs text-[var(--totk-grey-200)]">
                          {exp.square} {exp.quadrant}
                        </span>
                        <i className="fa-solid fa-arrow-right text-xs text-[var(--totk-light-green)]" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <section className="mb-8 rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/20 to-[var(--botw-warm-black)]/60 p-4 shadow-lg md:p-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
            Create expedition
          </h2>
          <p className="mb-4 text-sm text-[var(--botw-pale)]">
            Pick a region. You’ll get a link like <code className="rounded bg-[var(--botw-warm-black)] px-1">/explore/E123456</code>. Share it so others can join with their character and items.
          </p>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            {REGIONS.map((r) => (
              <label
                key={r.value}
                className={[
                  "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 transition-all",
                  region === r.value
                    ? "border-[var(--totk-light-green)] ring-2 ring-[var(--totk-light-green)]/50"
                    : "border-[var(--totk-dark-ocher)] hover:border-[var(--totk-mid-ocher)]",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="region"
                  value={r.value}
                  checked={region === r.value}
                  onChange={() => setRegion(r.value)}
                  className="sr-only"
                />
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--botw-warm-black)]">
                  <Image
                    src={r.banner}
                    alt=""
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, 200px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-1 right-1">
                    <Image src={r.crest} alt="" width={32} height={32} className="h-8 w-8 object-contain drop-shadow-md" />
                  </div>
                </div>
                <div className={[
                  "flex flex-wrap items-center justify-between gap-1 border-t-2 p-3",
                  region === r.value ? "border-[var(--totk-light-green)]/50 bg-[var(--totk-dark-green)]/30" : "border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/60",
                ].join(" ")}>
                  <span className="font-semibold text-[var(--totk-ivory)]">{r.label}</span>
                  <span className="text-xs text-[var(--totk-grey-200)]">{r.square} {r.quadrant}</span>
                </div>
              </label>
            ))}
          </div>
          {createError && <p className="mb-2 text-sm text-red-400">{createError}</p>}
          <button
            type="button"
            onClick={createExpedition}
            disabled={!region || creating}
            className="rounded-md border-2 border-[var(--totk-light-green)] bg-[var(--totk-dark-green)] px-4 py-2.5 text-sm font-bold text-[var(--totk-ivory)] hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create expedition"}
          </button>
        </section>

        <section className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/20 to-[var(--botw-warm-black)]/60 p-4 shadow-lg md:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[var(--totk-light-green)]">
              <i className="fa-solid fa-compass text-lg" aria-hidden />
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
              Join an expedition
            </h2>
          </div>
          <p className="mb-3 text-sm text-[var(--botw-pale)]">
            Enter the expedition ID (e.g. E123456) to open the shared page. Pick your character and 3 items there.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={partyIdInput}
              onChange={(e) => setPartyIdInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goToExpedition()}
              placeholder="E123456"
              className="rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--totk-ivory)] placeholder-[var(--totk-grey-200)] focus:border-[var(--totk-light-green)] focus:outline-none w-32"
            />
            <button
              type="button"
              onClick={goToExpedition}
              disabled={!partyIdInput.trim()}
              className="rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--totk-mid-ocher)] px-4 py-2 text-sm font-bold text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)] disabled:opacity-50"
            >
              Open
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
