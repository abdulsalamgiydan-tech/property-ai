import { getSupabaseAuthFailureRedirectTarget } from "@/lib/auth/supabaseAuthFailureRedirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  // PKCE often lands here when Supabase falls back to Site URL (path `/`) instead of
  // `/auth/callback` — forward so `app/auth/callback/route.ts` can exchange the code.
  // Also rescue error URLs that land on the root.
  if (url.pathname === "/") {
    const hasCode = url.searchParams.has("code");
    const hasError = url.searchParams.has("error");
    if (hasCode || hasError) {
      url.pathname = "/auth/callback";
      return NextResponse.redirect(url);
    }
  }

  const authFailureTarget = getSupabaseAuthFailureRedirectTarget(request.nextUrl);
  if (authFailureTarget) {
    return NextResponse.redirect(authFailureTarget);
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
