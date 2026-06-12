import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Windows jsdom full-suite runs can exceed Vitest's 5s per-test default
    // under local CPU contention. Keep the exact `npm run test` gate stable
    // without masking genuinely hanging tests.
    testTimeout: 10_000,
    hookTimeout: 10_000,
    css: true
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "server-only": new URL("./tests/server-only-stub.ts", import.meta.url).pathname
    }
  }
});
