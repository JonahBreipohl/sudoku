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
    files: ["scripts/**/*.{ts,mjs,js}", "e2e/**/*.ts", "*.config.{ts,js}"],
    languageOptions: { globals: globals.node },
  },
);
