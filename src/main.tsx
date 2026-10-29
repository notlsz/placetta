import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import "./polish95.css";   // the 9.5 pass, after every component's own styles
import "./polish9.css";    // Home and Odelia's page: one scale, the two anchors, the live strip (after polish95)
import "./clean.css";      // the reduction pass: fewer rules and boxes, everything on one line (last)
import { Guard } from "./SafeBoundary";
import { cloudConfigured, preparePreview } from "./cloud/api";
import { CloudRoot } from "./cloud/Root";
import { applyTheme, readTheme } from "./hooks";
import { TrustPage } from "./TrustPage";
import { tokenFromPath } from "./trust";

// Signed in or not is decided by CloudRoot, which keeps the sign-in screens light; start light there so they never flash dark.
if (cloudConfigured) document.documentElement.dataset.theme = "light"; else applyTheme(readTheme());

// With the backend configured (VITE_SUPABASE_URL and VITE_SUPABASE_KEY), people sign in and work in their own
// workspace. Without it (the shareable preview), the app runs the sample workspace as a demo.
// The artifact preview (VITE_PREVIEW) runs the signed-in app against a stand-in backend in the browser.
// A shared status page (/app/trust/<token>) is public: no sign-in, no workspace, only the page (src/TrustPage.tsx).
const trustToken = tokenFromPath(location.pathname);
// /app/sample: the sample workspace (the one the shareable preview runs), open to anyone with no sign-in, so the website's
// "See it working" is one click from the hero (Vanta's interactive demo, Stripe's test mode). It stays the sample for the
// rest of the tab's session, so moving between its pages and reloading keep it; a new tab opens the signed-in app.
const SAMPLE_KEY = "placetta-sample";
let sample = false;
try {
  if (/^\/app\/sample\/?$/.test(location.pathname)) { sessionStorage.setItem(SAMPLE_KEY, "1"); history.replaceState(null, "", "/app/" + location.search); }
  sample = sessionStorage.getItem(SAMPLE_KEY) === "1";
} catch { sample = /^\/app\/sample\/?$/.test(location.pathname); if (sample) history.replaceState(null, "", "/app/" + location.search); }
void preparePreview().then(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Guard>{trustToken ? <TrustPage token={trustToken} /> : cloudConfigured && !sample ? <CloudRoot /> : <App />}</Guard>
  </StrictMode>,
));
