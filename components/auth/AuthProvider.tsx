"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { hasFullToolAccess } from "@/lib/auth/access";
import { buildMagicLinkEmailRedirectTo } from "@/lib/auth/magicLinkRedirectOrigin";
import { notifyEarlyAccessInterest } from "@/lib/auth/afterSignup";
import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EarlyAccessAuthModal } from "./EarlyAccessAuthModal";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authConfigured: boolean;
  showFullToolAccess: boolean;
  openEarlyAccessModal: () => void;
  closeEarlyAccessModal: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const authConfigured = useMemo(() => isSupabaseConfigured(), []);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => authConfigured);
  const [modalOpen, setModalOpen] = useState(false);
  const [earlyAccessModalKey, setEarlyAccessModalKey] = useState(0);
  const serverCookieUserRef = useRef<User | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      return;
    }

    let cancelled = false;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session?.user) {
        serverCookieUserRef.current = null;
        setSession(data.session);
        setUser(data.session.user);
        setLoading(false);
        return;
      }
      const serverSession = await fetch("/api/auth/session", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      if (serverSession?.ok) {
        const body = (await serverSession.json().catch(() => null)) as { user?: User | null } | null;
        serverCookieUserRef.current = body?.user ?? null;
        setUser(body?.user ?? null);
      } else {
        serverCookieUserRef.current = null;
        setUser(null);
      }
      setSession(null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        serverCookieUserRef.current = null;
        setUser(nextSession.user);
        return;
      }
      setUser(serverCookieUserRef.current);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    serverCookieUserRef.current = null;
    setSession(null);
    setUser(null);
    setModalOpen(false);
  }, []);

  const sendMagicLink = useCallback(
    async (args: { email: string; firstName?: string; redirectPath: string }) => {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        return { ok: false, message: "Supabase client is not available." };
      }
      const clientOrigin =
        typeof window !== "undefined" ? window.location.origin : "";
      const emailRedirectTo = buildMagicLinkEmailRedirectTo(clientOrigin, args.redirectPath || "/");

      const { error } = await supabase.auth.signInWithOtp({
        email: args.email,
        options: {
          emailRedirectTo,
          shouldCreateUser: true,
          data: args.firstName ? { first_name: args.firstName } : undefined,
        },
      });
      if (error) {
        return { ok: false, message: error.message };
      }
      void notifyEarlyAccessInterest({
        email: args.email,
        firstName: args.firstName,
      });
      return { ok: true as const };
    },
    []
  );

  const showFullToolAccess = hasFullToolAccess(user, authConfigured);

  const value: AuthContextValue = {
    user,
    session,
    loading,
    authConfigured,
    showFullToolAccess,
    openEarlyAccessModal: () => {
      setEarlyAccessModalKey((k) => k + 1);
      setModalOpen(true);
    },
    closeEarlyAccessModal: () => setModalOpen(false),
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <EarlyAccessAuthModal
        key={earlyAccessModalKey}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        authConfigured={authConfigured}
        sendMagicLink={sendMagicLink}
      />
    </AuthContext.Provider>
  );
}
