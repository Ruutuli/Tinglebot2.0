"use client";

import { useCallback, useEffect, useState } from "react";

export type SessionUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type SessionState = {
  user: SessionUser | null;
  isAdmin: boolean;
  isModerator: boolean;
  loading: boolean;
};

export function useSession(): SessionState & { refetch: () => Promise<void> } {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { user: SessionUser | null; isAdmin: boolean; isModerator?: boolean };
      setUser(data.user ?? null);
      setIsAdmin(data.isAdmin ?? false);
      setIsModerator(data.isModerator ?? false);
    } catch {
      setUser(null);
      setIsAdmin(false);
      setIsModerator(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return { user, isAdmin, isModerator, loading, refetch: fetchSession };
}
