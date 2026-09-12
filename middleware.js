// Edge Middleware: serve admin.html at the ROOT of the private admin
// subdomain, without changing the URL bar and without exposing the
// file's real path on the public site.
//
// vercel.json's host-based `has` rewrite condition proved unreliable for
// this (confirmed by testing — it silently fell through to index.html),
// so this does the host check in code instead, which is unambiguous.

// Note: don't add a vercel.json redirect for "/admin.html" — the fetch()
// below would hit that redirect and loop forever (learned the hard way:
// 508 Loop Detected). "/admin" alone redirecting home is enough to keep
// it off the obvious guessable path; the exact filename staying reachable
// on the public domains is fine since it's still gated by Supabase Auth.

export const config = { matcher: "/" };

export default async function middleware(request) {
  var host = request.headers.get("host") || "";
  if (host === "lantern.youarebadass.ca") {
    return fetch(new URL("/admin.html", request.url));
  }
  // everything else: fall through to normal routing (serves index.html)
}
