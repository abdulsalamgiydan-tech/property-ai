"use client";

import { useCallback, useEffect, useState } from "react";
import type { InvestmentProfileInput } from "@/lib/opportunity/profileSchema";

export type SavedProfile = {
  id: string;
  name: string;
  inputs: InvestmentProfileInput;
  updated_at: string;
};

export interface Persistence {
  profiles: SavedProfile[];
  shortlist: Set<string>;
  hydrated: boolean;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addShortlist: (geographyId: string) => Promise<boolean>;
  removeShortlist: (geographyId: string) => Promise<boolean>;
  saveProfile: (name: string, inputs: InvestmentProfileInput) => Promise<string | null>;
  updateProfile: (id: string, name: string, inputs: InvestmentProfileInput) => Promise<boolean>;
  deleteProfile: (id: string) => Promise<boolean>;
}

/**
 * Server-backed persistence for the Find My Investment flow. Everything goes
 * through the RLS-protected /api/investment/{profile,shortlist} routes using the
 * existing Supabase cookie session — no service-role key, no local-only "saved"
 * illusion. State rehydrates from the server on mount and whenever the signed-in
 * user changes (so a hard refresh / new session reloads the real saved data).
 */
export function useInvestmentPersistence(signedIn: boolean): Persistence {
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [shortlist, setShortlist] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!signedIn) {
      setProfiles([]);
      setShortlist(new Set());
      setHydrated(true);
      return;
    }
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/investment/profile"),
        fetch("/api/investment/shortlist"),
      ]);
      if (pRes.ok) setProfiles(((await pRes.json()).profiles ?? []) as SavedProfile[]);
      if (sRes.ok) {
        const items = ((await sRes.json()).items ?? []) as { geography_id: string }[];
        setShortlist(new Set(items.map((i) => i.geography_id)));
      }
    } catch {
      setError("Could not load your saved data.");
    } finally {
      setHydrated(true);
    }
  }, [signedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addShortlist = useCallback(async (geographyId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/investment/shortlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geography_id: geographyId }),
      });
      if (!res.ok) {
        setError("Could not save to shortlist.");
        return false;
      }
      setShortlist((prev) => new Set(prev).add(geographyId));
      return true;
    } finally {
      setBusy(false);
    }
  }, []);

  const removeShortlist = useCallback(async (geographyId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/investment/shortlist?geography_id=${encodeURIComponent(geographyId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Could not remove from shortlist.");
        return false;
      }
      setShortlist((prev) => {
        const next = new Set(prev);
        next.delete(geographyId);
        return next;
      });
      return true;
    } finally {
      setBusy(false);
    }
  }, []);

  const saveProfile = useCallback(async (name: string, inputs: InvestmentProfileInput) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/investment/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, inputs }),
      });
      if (!res.ok) {
        setError("Could not save profile.");
        return null;
      }
      const id = (await res.json()).id as string;
      await refresh();
      return id;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const updateProfile = useCallback(async (id: string, name: string, inputs: InvestmentProfileInput) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/investment/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name, inputs }),
      });
      if (!res.ok) {
        setError(res.status === 404 ? "That profile no longer exists." : "Could not update profile.");
        return false;
      }
      await refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const deleteProfile = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/investment/profile?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        setError(res.status === 404 ? "That profile no longer exists." : "Could not delete profile.");
        return false;
      }
      await refresh(); // reloads profiles + shortlist (orphaned entries keep, profile_id null)
      return true;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { profiles, shortlist, hydrated, busy, error, refresh, addShortlist, removeShortlist, saveProfile, updateProfile, deleteProfile };
}
