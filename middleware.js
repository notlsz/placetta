// placetta.com (no www) redirects to https://www.placetta.com, the site's canonical host. Done here rather than as a
// Vercel domain redirect or a vercel.json redirect because neither sends our headers: HSTS preload (hstspreload.org)
// needs the apex's own HTTPS response to carry "includeSubDomains; preload". Runs only for requests to the bare domain.
export const config = { matcher: [{ source: "/:path*", has: [{ type: "host", value: "placetta.com" }] }] };

export default function middleware(request) {
  const url = new URL(request.url);
  if (url.hostname !== "placetta.com") return;
  return new Response(null, {
    status: 308,
    headers: {
      Location: `https://www.placetta.com${url.pathname}${url.search}`,
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    },
  });
}
