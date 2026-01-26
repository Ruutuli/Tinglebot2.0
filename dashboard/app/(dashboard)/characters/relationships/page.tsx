"use client";

export default function RelationshipsPage() {
  return (
    <div className="min-h-full p-8">
      <div className="mx-auto max-w-[90rem]">
        <div className="mb-6 flex items-center justify-center gap-4">
          <img src="/Side=Left.svg" alt="" className="h-6 w-auto" />
          <h1 className="text-3xl font-bold text-[var(--totk-light-ocher)]">
            Relationships
          </h1>
          <img src="/Side=Right.svg" alt="" className="h-6 w-auto" />
        </div>
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="text-6xl mb-4">💝</div>
            <h2 className="text-2xl font-bold text-[var(--totk-light-ocher)]">
              Coming Soon
            </h2>
            <p className="text-center text-[var(--botw-pale)] text-lg">
              The Relationships page is currently under development.
              <br />
              Check back soon for updates!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
