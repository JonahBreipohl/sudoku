import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { initTheme } from "./ui/theme";
import "./ui/styles.css";
import { getEngineClient } from "./workers/client";

// Referenced from the entry so the build emits the worker chunk; the worker spawns lazily on first call.
void getEngineClient;

initTheme();

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
