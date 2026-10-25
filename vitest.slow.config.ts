import { defineConfig } from "vitest/config";

// Slow tests only (npm run test:slow); vite.config.ts leaves *.slow.test.ts out of npm run check.
export default defineConfig({
  test: {
    include: ["src/**/*.slow.test.ts"],
    environment: "node",
  },
});
