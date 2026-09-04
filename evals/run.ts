/**
 * npx tsx evals/run.ts [--n 3] [--scenario gas-smell]
 *
 * Same suite the vitest gate runs, with the report printed to the console and
 * the run written to evals/results/<git-sha>.json.
 */
import { loadEnv } from "./env";
import { printReport } from "./report";
import { SCENARIOS } from "./scenarios";
import { failedAssertions, runSuite } from "./suite";

loadEnv();

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  const only = arg("--scenario");
  const scenarios = only ? SCENARIOS.filter((s) => s.id === only) : SCENARIOS;
  if (!scenarios.length) {
    console.error(`unknown scenario: ${only}. Known: ${SCENARIOS.map((s) => s.id).join(", ")}`);
    process.exit(2);
  }

  const suite = await runSuite({ n: Number(arg("--n") ?? process.env.EVAL_RUNS ?? 3), scenarios });
  printReport(suite);

  const failed = failedAssertions(suite);
  if (failed.length) {
    console.error(`\n${failed.length} hard assertion(s) failed:`);
    for (const f of failed) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
