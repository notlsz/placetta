/* The one place the site's public address and the company's identity live, for every canonical tag, sitemap URL,
   JSON-LD block, llms.txt and IndexNow ping (scripts/build-guides.mts and scripts/seo/build.mjs both read it).

   ORIGIN: www.placetta.com is Vercel's primary domain (the apex 308-redirects to it), so every indexed URL names www and
   none goes through a redirect. To make the apex primary: flip it in Vercel, change this one line to
   "https://placetta.com" (or set SITE_ORIGIN), run `npm run seo:all` and commit. npm run test:seo fails while any page
   still names the old host.

   Only facts already published on placetta.com go here (privacy.html and legal.js carry the legal name and address).
   SAME_AS lists the company's own profiles elsewhere, and only ones that exist: add each URL when the profile is live. */
export const ORIGIN = (process.env.SITE_ORIGIN || "https://www.placetta.com").replace(/\/$/, "");
export const HOST = new URL(ORIGIN).host;

export const SAME_AS = [
  // "https://www.linkedin.com/company/…", "https://www.crunchbase.com/organization/…", "https://www.wikidata.org/wiki/Q…"
];

/* Search engine ownership tags. PLACEHOLDERS: paste the code each console gives (the content="" value only, from Google
   Search Console, Bing Webmaster Tools and Baidu Ziyuan) here or in the matching env var, then run npm run seo. An empty
   value writes no tag; never put a made-up token here. */
export const VERIFY = {
  google: process.env.GOOGLE_SITE_VERIFICATION || "",
  bing: process.env.BING_SITE_VERIFICATION || "",
  baidu: process.env.BAIDU_SITE_VERIFICATION || "",
};

export const ORG_ID = ORIGIN + "/#organization";
export const SITE_ID = ORIGIN + "/#website";
export const DESCRIPTION = "Placetta gets the licenses, permits and registrations a business needs to open in a new market, and keeps them current.";
export const DESCRIPTION_ZH = "快哉为进入新市场的企业办理执照、许可和登记，并保持有效。";

export function orgLd() {
  return {
    "@context": "https://schema.org", "@type": "Organization", "@id": ORG_ID,
    name: "Placetta", alternateName: "快哉", legalName: "Placetta Inc.", url: ORIGIN + "/",
    logo: { "@type": "ImageObject", url: ORIGIN + "/icon-512.png", width: 512, height: 512 },
    image: ORIGIN + "/icon-512.png",
    description: DESCRIPTION,
    email: "support@placetta.com",
    address: { "@type": "PostalAddress", streetAddress: "9 W 57th St, Fl 48", addressLocality: "New York", addressRegion: "NY", postalCode: "10019", addressCountry: "US" },
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: "support@placetta.com", availableLanguage: ["English", "Chinese"] }],
    knowsLanguage: ["en", "zh-CN"],
    ...(SAME_AS.length ? { sameAs: SAME_AS } : {}),
  };
}

export function websiteLd(searchPath) {
  return {
    "@context": "https://schema.org", "@type": "WebSite", "@id": SITE_ID, name: "Placetta", alternateName: "快哉", url: ORIGIN + "/",
    inLanguage: ["en", "zh-CN"], publisher: { "@id": ORG_ID },
    ...(searchPath ? { potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: ORIGIN + searchPath + "{search_term_string}" }, "query-input": "required name=search_term_string" } } : {}),
  };
}

/* The guides hub has a search box that reads ?q= (scripts/guides.js), so the WebSite carries a SearchAction to it. */
export const SEARCH_PATH = "/guides/?q=";

/** JSON for a <script type="application/ld+json"> block: "<" escaped so no string can close the tag. */
export const ldJson = x => JSON.stringify(x).replace(/</g, "\\u003c");
export const ldTag = x => `<script type="application/ld+json">${ldJson(x)}</script>`;

/** Ownership meta tags for the codes that are set. */
export function verifyTags() {
  return [
    VERIFY.google && `<meta name="google-site-verification" content="${VERIFY.google}">`,
    VERIFY.bing && `<meta name="msvalidate.01" content="${VERIFY.bing}">`,
    VERIFY.baidu && `<meta name="baidu-site-verification" content="${VERIFY.baidu}">`,
  ].filter(Boolean).join("\n");
}

/* Baidu reads these on Chinese pages: no transcoding into its mobile proxy, one URL for desktop and phone. */
export const BAIDU_META = `<meta http-equiv="Cache-Control" content="no-transform">
<meta http-equiv="Cache-Control" content="no-siteapp">
<meta name="applicable-device" content="pc,mobile">`;
