/**
 * The gate.
 *
 * Hard assertions fail the build. Judge scores are printed and never asserted
 * on — they are stochastic, and a flaky gate is worse than no gate.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "./env";
import { printReport } from "./report";
import { SCENARIOS } from "./scenarios";
import { runSuite } from "./suite";
import type { SuiteResult } from "./suite";

loadEnv();

const RUNS = Number(process.env.EVAL_RUNS ?? 3);
const TIMEOUT = Number(process.env.EVAL_TIMEOUT_MS ?? 45 * 60_000);

let suite: SuiteResult;

beforeAll(async () => {
  suite = await runSuite({ n: RUNS });
}, TIMEOUT);

afterAll(() => {
  if (suite) printReport(suite);
});

describe.each(SCENARIOS.map((s) => s.id))("%s", (scenarioId) => {
  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    it(`run ${runIndex + 1}: hard assertions hold`, () => {
      const run = suite.runs.find((r) => r.scenarioId === scenarioId && r.runIndex === runIndex);
      expect(run, "run is missing from the suite").toBeDefined();
      expect(run!.call.error ?? null, "the call itself threw").toBeNull();

      const failed = run!.assertions.filter((a) => !a.pass).map((a) => `${a.name} — ${a.detail}`);
      expect(failed).toEqual([]);
    });
  }
});
