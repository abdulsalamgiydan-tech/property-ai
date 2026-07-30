import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminSupabaseClient } from "@/lib/supabase/adminClient";
import { isAdminEmail } from "@/lib/auth/isAdminEmail";
import { logAdminAccessDenied } from "@/lib/auth/logAdminAccessDenied";
import { isInternalOperationsEnabled } from "@/lib/warehouse/env";

export const metadata: Metadata = { title: "Admin | Propellect", robots: { index: false, follow: false } };

type EntitlementRow = { user_id: string; tier: string; updated_at: string };
type FeedbackRow = { id: string; category: string; message: string; page_path: string | null; created_at: string };

/**
 * Sprint 17 internal operations foundation. Gated in three independent
 * layers: (1) INTERNAL_OPERATIONS_ENABLED must be exactly "true", (2)
 * the visitor must be a real authenticated Supabase user, and (3) their
 * email must appear in the ADMIN_EMAILS allowlist. Returns notFound()
 * for anyone who fails a gate, matching the "never reveal a gated route"
 * pattern used elsewhere. The service-role client is only instantiated
 * after every route-level gate passes.
 *
 * An allowlist rejection (gate 3) is logged via logAdminAccessDenied --
 * outcome and internal user id only, never the email/PII -- so a rejected
 * access attempt is visible in server logs. The flag/config gates (1, 2)
 * are left unlogged since they reflect deployment state, not an access
 * attempt by a person.
 */
export default async function AdminPage() {
  if (!isInternalOperationsEnabled()) notFound();
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email, process.env.ADMIN_EMAILS)) {
    logAdminAccessDenied(user);
    notFound();
  }

  const admin = createAdminSupabaseClient();

  let entitlements: EntitlementRow[] = [];
  let entitlementsError: string | null = null;
  let feedback: FeedbackRow[] = [];
  let feedbackError: string | null = null;

  if (admin) {
    const [entitlementsResult, feedbackResult] = await Promise.all([
      admin.from("user_entitlements").select("user_id, tier, updated_at").order("updated_at", { ascending: false }).limit(100),
      admin.from("user_feedback").select("id, category, message, page_path, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    if (entitlementsResult.error) entitlementsError = entitlementsResult.error.message;
    else entitlements = (entitlementsResult.data ?? []) as EntitlementRow[];

    if (feedbackResult.error) feedbackError = feedbackResult.error.message;
    else feedback = (feedbackResult.data ?? []) as FeedbackRow[];
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Admin</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Signed in as {user?.email}. Read-only view — tier changes still require the Supabase dashboard directly.
        </p>

        {!admin ? (
          <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-950/15 p-4 text-sm text-amber-200">
            SUPABASE_SERVICE_ROLE_KEY is not configured in this environment, so cross-user operational data is hidden.
          </div>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-violet-300">
                Upgraded entitlements ({entitlements.length})
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Users with no row here are on the default free tier — this table only ever holds non-default rows.
              </p>
              {entitlementsError ? (
                <p className="mt-3 text-xs text-zinc-500">Unavailable: {entitlementsError}</p>
              ) : entitlements.length === 0 ? (
                <p className="mt-3 text-xs text-zinc-500">No users have an upgraded tier yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-800/70 text-xs">
                  {entitlements.map((e) => (
                    <li key={e.user_id} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-zinc-400">{e.user_id}</span>
                      <span className="font-medium text-violet-300">{e.tier}</span>
                      <span className="text-zinc-600">{new Date(e.updated_at).toLocaleDateString("en-AU")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-10">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-violet-300">
                Recent feedback ({feedback.length})
              </h2>
              {feedbackError ? (
                <p className="mt-3 text-xs text-zinc-500">
                  Unavailable — the user_feedback table may not be applied to this environment yet ({feedbackError}).
                </p>
              ) : feedback.length === 0 ? (
                <p className="mt-3 text-xs text-zinc-500">No feedback submitted yet.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-xs">
                  {feedback.map((f) => (
                    <li key={f.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                      <div className="flex items-center justify-between gap-3 text-zinc-500">
                        <span className="font-medium text-zinc-300">{f.category}</span>
                        <span>{new Date(f.created_at).toLocaleString("en-AU")}</span>
                      </div>
                      <p className="mt-1 text-zinc-200">{f.message}</p>
                      {f.page_path ? <p className="mt-1 text-zinc-600">from {f.page_path}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
