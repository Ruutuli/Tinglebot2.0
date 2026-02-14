"use client";

import { useCallback, useEffect, useState } from "react";
import { Loading } from "@/components/ui";

type ArchivedRelic = {
  _id: string;
  relicId?: string;
  name: string;
  rollOutcome?: string;
  appraisalDescription?: string;
  imageUrl?: string;
  discoveredBy?: string;
  locationFound?: string;
  appraisalDate?: string;
};

export default function LibraryArchivesPage() {
  const [relics, setRelics] = useState<ArchivedRelic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArchives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/relics/archives", { cache: "no-store" });
      if (!res.ok) {
        setError("Failed to load archived relics");
        setRelics([]);
        return;
      }
      const data = await res.json();
      setRelics(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRelics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchives();
  }, [fetchArchives]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loading message="Loading Library Archives..." variant="inline" size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 flex items-center justify-center gap-2 sm:gap-4">
          <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
          <h1 className="text-center text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-ocher)]">
            Library Archives
          </h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
        </div>

        <p className="mb-6 text-center text-sm text-[var(--botw-pale)]">
          Appraised relics donated to the Library. Discovered during expeditions across Hyrule.
        </p>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-center text-red-400">
            {error}
          </div>
        )}

        {relics.length === 0 && !error ? (
          <div className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-12 text-center">
            <p className="text-[var(--botw-pale)]">No relics have been archived yet.</p>
            <p className="mt-2 text-sm text-[var(--totk-grey-200)]">
              Relics are found during exploration and appraised by Artists or Researchers in Inariko.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {relics.map((relic) => (
              <div
                key={relic._id}
                className="overflow-hidden rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-lg"
              >
                <div className="relative aspect-square bg-[var(--totk-grey-900)]">
                  {relic.imageUrl ? (
                    <img
                      src={relic.imageUrl}
                      alt={relic.rollOutcome || relic.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-6xl text-[var(--totk-grey-600)]">
                      🔸
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="font-bold text-[var(--totk-light-ocher)]">
                    {relic.rollOutcome || relic.name}
                  </h2>
                  {relic.appraisalDescription && (
                    <p className="mt-2 line-clamp-3 text-sm text-[var(--botw-pale)]">
                      {relic.appraisalDescription}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--totk-grey-200)]">
                    {relic.discoveredBy && (
                      <span title="Discovered by">By {relic.discoveredBy}</span>
                    )}
                    {relic.locationFound && (
                      <span title="Location">• {relic.locationFound}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
