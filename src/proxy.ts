import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
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
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // `getClaims()` verifies the session JWT locally (falling back to a network
  // call only when it genuinely can't, e.g. an expired token that needs a
  // refresh), whereas `getUser()` always round-trips to Supabase's auth
  // server. At one proxy run per request that round trip dominated the
  // wall-clock — and therefore the billed compute — of every single request.
  // Any unexpected failure is treated as "not authenticated", so the worst
  // case is a redirect to /login rather than an open door.
  let authenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    authenticated = !error && !!data?.claims?.sub;
  } catch {
    authenticated = false;
  }

  // Redirigir a /login si no está autenticado y no está en /login ni en /auth/*
  if (
    !authenticated &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

/**
 * Every matched request runs this proxy as its own serverless invocation,
 * *before* Vercel's CDN cache is consulted — so a matched path can never be
 * served purely from cache, no matter what `Cache-Control` its route sets.
 *
 * The public data proxy routes below serve identical, credential-free market
 * data to everyone and set long `Cache-Control` headers precisely so the CDN
 * can answer repeat hits without running any function. Excluding them here is
 * what actually makes that work; gating them behind auth bought nothing
 * anyway, since the data they return is public.
 *
 * `/api/trade/*` is excluded too, but it is NOT unprotected: those routes sign
 * requests against a real exchange, so each one now calls `requireSession()`
 * (src/lib/supabase/require-session.ts)
 * as its first statement instead. Same JWT check, same locked door — but one
 * Function invocation per request rather than two, which on the 2s account
 * poll is the difference that matters. Any new route under that prefix has to
 * carry the guard itself; the matcher no longer covers it.
 *
 * What stays matched is page navigation, which is what the /login redirect is
 * actually for.
 */
/**
 * `manifest.webmanifest`, `sw.js` and `/.well-known/` are excluded because
 * they must be readable *without* a session.
 *
 * They were not, and it broke two things silently: an install prompt reads the
 * manifest before anyone signs in, so "add to home screen" only ever got the
 * /login redirect; and Android's Digital Asset Links check fetches
 * `/.well-known/assetlinks.json` from Google's servers with no cookies at all,
 * so a TWA build could never verify its domain and would always show a browser
 * address bar over the app.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|[.]well-known/|api/yahoo|api/fred|api/coingecko|api/trade/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
