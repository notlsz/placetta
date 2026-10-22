/* The public app (what anyone can download from /app/assets): Odelia's instructions are never in it.
   vite.config.ts defines __PLACETTA_PUBLIC_BUNDLE__ as true for the app's builds, so the minifier drops the prompt text
   (rules() in live.ts) and the in-browser model paths (your own Anthropic key, a Claude account) from the bundle. In a
   signed-in workspace Odelia runs on the server (agent-run), which builds her instructions there and never sends them
   to the browser. The server's bundle (npm run build:agent) and the tests leave it undefined and keep everything. */
declare const __PLACETTA_PUBLIC_BUNDLE__: boolean | undefined;
export const PUBLIC_BUNDLE: boolean = typeof __PLACETTA_PUBLIC_BUNDLE__ !== "undefined" && !!__PLACETTA_PUBLIC_BUNDLE__;
