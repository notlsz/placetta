import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { cloudConfigured } from "./cloud/api";
import { CloudRoot } from "./cloud/Root";

// With the backend configured (VITE_SUPABASE_URL and VITE_SUPABASE_KEY), people sign in and work in their own
// workspace. Without it (the shareable preview), the app runs the sample workspace as a demo.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {cloudConfigured ? <CloudRoot /> : <App />}
  </StrictMode>,
);
