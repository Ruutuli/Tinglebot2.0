"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Crafters Guide has been moved to the Inventories page as a tab.
 * Redirect old /crafters-guide links to Inventories with the Crafters Guide tab active.
 */
export default function CraftersGuideRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/characters/inventories?tab=crafters-guide");
  }, [router]);

  return (
    <div className="container mx-auto px-4 py-16 flex items-center justify-center">
      <p className="text-white/80">Redirecting to Crafters Guide...</p>
    </div>
  );
}
