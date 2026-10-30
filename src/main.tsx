import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { initTheme } from "./ui/theme";
import { getSettingsStore } from "./state/settings";
import { completeLoginFromUrl } from "./ui/spotify/auth";
import "./ui/styles.css";
import { registerServiceWorker } from "./pwa";
import { getEngineClient } from "./workers/client";

// Referenced from the entry so the build emits the worker chunk; the worker spawns lazily on first call.
void getEngineClient;

initTheme();
// Before the first render: a return from Spotify's sign-in rewrites the URL back to the page it left.
void completeLoginFromUrl(getSettingsStore().getSnapshot().spotifyClientId);
registerServiceWorker();

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
