import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The eval report is a deliverable, not a debug aid. The default reporter
    // swallows console output when stdout is not a TTY — which is exactly where
    // the assertion and judge tables need to be readable, i.e. CI.
    reporters: ["verbose"],
    // A live eval suite is 15 conversations against two hosted models.
    testTimeout: 60_000,
    hookTimeout: 45 * 60_000,
  },
});
