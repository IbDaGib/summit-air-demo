/**
 * Shared-secret gate for the dispatch dashboard.
 *
 * NOTE ON THE FILENAME: this is what used to be `middleware.ts`. Next.js 16
 * renamed the convention to `proxy.ts` and the exported function to `proxy`;
 * `middleware.ts` is deprecated. Same execution model, same matcher semantics.
 * See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 *
 * This is one shared secret, not an auth system — DECISIONS.md lists dashboard
 * auth as deliberately out of scope. It exists so a demo URL can be opened on a
 * projector without putting call transcripts on the open internet.
 *
 *   /calls?key=<DASH_SECRET>  ->  sets an httpOnly cookie, redirects to /calls
 *
 * The secret is only ever read from the environment. There is no NEXT_PUBLIC_
 * variable here and nothing in this file reaches the browser.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "summit_dash";
const KEY_PARAM = "key";
const MAX_AGE = 60 * 60 * 12; // A demo day. Deliberately not a long-lived session.

export function proxy(request: NextRequest) {
  const secret = process.env.DASH_SECRET;

  // Fail closed. An unset secret must not silently publish the dashboard.
  if (!secret) {
    return deny(
      503,
      "DASH_SECRET is not set. Add it to .env.local (see .env.example) and restart the server.",
    );
  }

  const url = request.nextUrl;
  const supplied = url.searchParams.get(KEY_PARAM);

  // Exchange ?key=... for a cookie, then drop the secret from the address bar
  // so it does not end up in a screen share, a screenshot, or a referrer.
  if (supplied !== null) {
    if (!secretsMatch(supplied, secret)) {
      return deny(401, "That key is not valid.");
    }
    const clean = url.clone();
    clean.searchParams.delete(KEY_PARAM);
    // Derive the scheme from the forwarded header first: behind Vercel's proxy
    // the inbound request is http even though the browser is on https.
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
      url.protocol.replace(":", "");
    const res = NextResponse.redirect(clean);
    res.cookies.set(COOKIE, secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: proto === "https",
      path: "/",
      maxAge: MAX_AGE,
    });
    return res;
  }

  const cookie = request.cookies.get(COOKIE)?.value;
  if (cookie && secretsMatch(cookie, secret)) {
    return NextResponse.next();
  }

  return deny(401, "This dashboard is protected. Open it with ?key=<shared secret>.");
}

/**
 * Comparison that does not short-circuit on the first differing character, so a
 * wrong key cannot be narrowed down by timing. Written by hand rather than with
 * node:crypto so this file stays free of Node built-ins — proxy code can be
 * hoisted to an edge runtime by the host.
 */
function secretsMatch(supplied: string, secret: string): boolean {
  // `secret` is non-empty — the caller returns 503 before reaching here if it
  // is unset — so the modulo below is always safe.
  let diff = supplied.length ^ secret.length;
  for (let i = 0; i < supplied.length; i++) {
    diff |= supplied.charCodeAt(i) ^ secret.charCodeAt(i % secret.length);
  }
  return diff === 0;
}

function deny(status: number, message: string) {
  const body = `<!doctype html><meta charset="utf-8"><title>Summit Air — Dispatch</title>
<body style="background:#09090b;color:#a1a1aa;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:44ch"><strong style="color:#fafafa">Summit Air Dispatch</strong><p>${escapeHtml(message)}</p></div>`;
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * Everything the dashboard serves, and nothing else. The Vapi webhook under
 * /api/vapi has its own secret and must stay reachable by Vapi.
 */
/** These messages are literals, but they reach a browser as HTML — escape anyway. */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export const config = {
  matcher: ["/calls", "/calls/:path*", "/schedule", "/schedule/:path*", "/api/dash/:path*"],
};
