import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // PGlite-backed migration tests (e.g. 059) build a fresh in-memory Postgres
    // and can exceed the 5s default under CI load. A generous, bounded timeout
    // keeps them reliably green without masking genuine hangs.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
