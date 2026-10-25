import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "playwright-report", "test-results", "public/puzzles", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["src/engine/**/*.ts"],
    rules: {
      // The engine is pure: no UI, state, or browser APIs.
      "no-restricted-imports": ["error", { patterns: ["react", "react-*", "../state/*", "../ui/*", "../state", "../ui"] }],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "navigator"],
    },
  },
  {
    files: ["src/state/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["react", "react-*", "../ui/*", "../ui"] }],
    },
  },
  {
    files: ["src/analysis/**/*.{ts,tsx}"],
    rules: {
      // Analysis is pure and runs in the worker: engine values plus state *types* only
      // (docs/ARCHITECTURE.md, "Modules and layering").
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-*", "react/*", "react-dom", "react-dom/*"], message: "Analysis must not import React." },
            { group: ["../ui", "../ui/*", "../../ui", "../../ui/*"], message: "Analysis must not import ui." },
            { group: ["../state", "../state/*"], allowTypeImports: true, message: "Analysis imports state types only." },
          ],
        },
      ],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "navigator"],
    },
  },
  {
    // Tests may cross-check analysis against the real state reducer.
    files: ["src/analysis/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["react", "react-*", "react/*", "react-dom", "react-dom/*", "../ui", "../ui/*", "../../ui", "../../ui/*"], message: "No ui or React in analysis." }] },
      ],
    },
  },
  {
    files: ["scripts/**/*.{ts,mjs,js}", "e2e/**/*.ts", "*.config.{ts,js}"],
    languageOptions: { globals: globals.node },
  },
);
