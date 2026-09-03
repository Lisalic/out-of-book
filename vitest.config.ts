import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": `${import.meta.dirname}/src` } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // The graph fixtures generate thousands of real positions; under coverage
    // instrumentation those runs comfortably exceed Vitest's 5s default.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      // Layout and entry files: no logic of their own to cover.
      exclude: ["src/app/**", "src/**/*.d.ts"],
      // Set a few points under the current numbers: a gate against regression,
      // not a target to chase with tests written for the metric.
      thresholds: {
        statements: 88,
        branches: 79,
        functions: 85,
        lines: 92,
      },
    },
  },
});
