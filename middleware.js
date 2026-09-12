// Edge Middleware: serve admin.html at the ROOT of the private admin
// subdomain, without changing the URL bar and without exposing the
// file's real path on the public site.
//
// vercel.json's host-based `has` rewrite condition proved unreliable for
// this (confirmed by testing — it silently fell through to index.html),
// so this does the host check in code instead, which is unambiguous.

export const config = { matcher: "/" };

export default async function middleware(request) {
  var host = request.headers.get("host") || "";
  if (host === "lantern.youarebadass.ca") {
    return fetch(new URL("/admin.html", request.url));
  }
  // everything else: fall through to normal routing (serves index.html)
}
