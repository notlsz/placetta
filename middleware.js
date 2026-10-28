// placetta.com (no www) redirects to https://www.placetta.com, the site's canonical host. Done here rather than as a
// Vercel domain redirect or a vercel.json redirect because neither sends our headers: HSTS preload (hstspreload.org)
// needs the apex's own HTTPS response to carry "includeSubDomains; preload". Vercel's matcher takes paths only, so the
// host is checked below; hashed assets and fonts are skipped, and every other www request passes straight through.
//
// /app/region.json: the country and state the request comes from (Vercel's x-vercel-ip-country and
// x-vercel-ip-country-region), nothing finer. The app sends it to the database (note_my_region) for the recording rules
// (20261105090600_privacy_recording_age.sql): someone opening the app in California isn't recorded without their OK.
export const config = { matcher: ["/((?!app/assets/|fonts/|js/inline/).*)"] };

/** The country and state from Vercel's geolocation headers, checked to their shapes; null when absent. Exported for tests. */
export function regionOf(headers) {
  const c = String(headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  const r = String(headers.get("x-vercel-ip-country-region") ?? "").trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(c) ? c : null;
  const region = country && /^[A-Z0-9]{1,3}$/.test(r) ? r : null;
  return { country, region };
}

export default function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname === "/app/region.json") {
    return new Response(JSON.stringify(regionOf(request.headers)), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" },
    });
  }
  if (url.hostname !== "placetta.com") return;
  return new Response(null, {
    status: 308,
    headers: {
      Location: `https://www.placetta.com${url.pathname}${url.search}`,
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    },
  });
}
