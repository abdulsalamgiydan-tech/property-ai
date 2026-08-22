import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Preview UAT harness runs under Playwright's own tooling (not vitest/next lint).
    "uat/**",
    "playwright.config.ts",
    "playwright.v8.config.ts",
  ]),
]);

export default eslintConfig;
