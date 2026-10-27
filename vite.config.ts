import react from "@vitejs/plugin-react";
import { pwaPlugin } from "./scripts/pwa-plugin";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works from a GitHub Pages project path.
  base: "./",
  plugins: [react(), pwaPlugin()],
  worker: { format: "es" },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,mjs}"],
    // Slow tests run via vitest.slow.config.ts (npm run test:slow) to keep npm run check quick.
    exclude: [...configDefaults.exclude, "**/*.slow.test.ts"],
    environment: "node",
  },
});
