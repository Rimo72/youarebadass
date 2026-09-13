// Edge Middleware: serve the moderation page at the ROOT of the private
// admin subdomain, without changing the URL bar and without ever putting
// the word "admin" in a reachable path.
//
// vercel.json's host-based `has` rewrite condition proved unreliable for
// this (confirmed by testing — it silently fell through to index.html),
// so the host check happens here in code instead.
//
// The actual file is named lantern.html, not admin.html/admin — with
// cleanUrls on, a file called admin.html is also reachable at /admin,
// and fetching it internally here would collide with a "/admin -> /"
// redirect and loop forever (hit this: 508 Loop Detected). Naming it
// something with no clashing clean-URL path sidesteps that entirely.

export const config = { matcher: "/" };

export default async function middleware(request) {
  var host = request.headers.get("host") || "";
  if (host !== "lantern.youarebadass.ca") return; // fall through: serves index.html

  var res = await fetch(new URL("/lantern.html", request.url));

  // fetch() hands back an already-decompressed body, but its headers still
  // say Content-Encoding: br / a stale Content-Length for the compressed
  // size. Passed straight through, the browser tries to Brotli-decode
  // plain HTML and fails (ERR_CONTENT_DECODING_FAILED, blank page). Strip
  // both so the platform recomputes them for the response we actually send.
  var headers = new Headers(res.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: headers
  });
}
