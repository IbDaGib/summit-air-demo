/**
 * Console report. Two tables: assertions (which gate) and judge scores (which
 * do not). Then the bill.
 */
import { costOf, totalCost } from "./cost";
import type { SuiteResult } from "./suite";
import type { JudgeScores, RunResult } from "./types";

const DIMENSIONS: (keyof JudgeScores)[] = [
  "naturalness",
  "efficiency",
  "informationAccuracy",
  "safetyAdherence",
];

const SHORT: Record<keyof JudgeScores, string> = {
  naturalness: "natural",
  efficiency: "efficient",
  informationAccuracy: "accuracy",
  safetyAdherence: "safety",
};

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
const padLeft = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

function summarise(runs: RunResult[], dim: keyof JudgeScores): string {
  const values = runs.map((r) => r.judge?.[dim]).filter((v): v is number => typeof v === "number");
  if (!values.length) return "   —   ";
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `${mean.toFixed(1)} (${min}–${max})`;
}

export function printReport(suite: SuiteResult): void {
  const byScenario = new Map<string, RunResult[]>();
  for (const run of suite.runs) {
    byScenario.set(run.scenarioId, [...(byScenario.get(run.scenarioId) ?? []), run]);
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(`Summit Air evals — ${suite.mode} run, ${suite.runsPerScenario} run(s) per scenario`);
  lines.push(
    `  agent model: ${suite.models.agent}   caller model: ${suite.models.caller}   judge: ${suite.models.judge}`,
  );
  lines.push(
    `  git ${suite.fingerprint.gitSha.slice(0, 10)}${suite.fingerprint.dirty ? " (dirty)" : ""}   prompt ${suite.fingerprint.promptHash}`,
  );

  lines.push("");
  lines.push("HARD ASSERTIONS — these gate the build");
  lines.push(`  ${pad("scenario", 22)}${pad("run", 6)}${pad("assertions", 12)}result`);
  for (const [id, runs] of byScenario) {
    for (const run of runs) {
      const failed = run.assertions.filter((a) => !a.pass);
      lines.push(
        `  ${pad(id, 22)}${pad(`${run.runIndex + 1}/${runs.length}`, 6)}${pad(
          `${run.assertions.length - failed.length}/${run.assertions.length}`,
          12,
        )}${failed.length ? `FAIL — ${failed.map((f) => `${f.name} (${f.detail})`).join("; ")}` : "pass"}`,
      );
    }
  }

  const errored = suite.runs.filter((r) => r.call.error);
  if (errored.length) {
    lines.push("");
    lines.push("CALL ERRORS");
    for (const r of errored) lines.push(`  ${r.scenarioId}#${r.runIndex + 1}: ${r.call.error}`);
  }

  lines.push("");
  lines.push("JUDGE SCORES — 1–5, mean (min–max) across runs. Stochastic: reported, never asserted on.");
  lines.push(`  ${pad("scenario", 22)}${DIMENSIONS.map((d) => pad(SHORT[d], 14)).join("")}`);
  for (const [id, runs] of byScenario) {
    lines.push(`  ${pad(id, 22)}${DIMENSIONS.map((d) => pad(summarise(runs, d), 14)).join("")}`);
  }
  const allJudged = suite.runs.filter((r) => r.judge);
  if (!allJudged.length) {
    const why = suite.runs.find((r) => r.judgeSkippedBecause)?.judgeSkippedBecause ?? "no judge output";
    lines.push(`  (no judge scores: ${why})`);
  } else {
    lines.push(
      `  ${pad("ALL", 22)}${DIMENSIONS.map((d) => pad(summarise(allJudged, d), 14)).join("")}`,
    );
  }

  lines.push("");
  lines.push("TOKENS AND COST");
  lines.push(`  ${pad("model", 26)}${padLeft("calls", 8)}${padLeft("in", 12)}${padLeft("out", 10)}${padLeft("usd", 10)}`);
  for (const [model, u] of Object.entries(suite.usage)) {
    lines.push(
      `  ${pad(model, 26)}${padLeft(String(u.calls), 8)}${padLeft(u.inputTokens.toLocaleString(), 12)}${padLeft(
        u.outputTokens.toLocaleString(),
        10,
      )}${padLeft(`$${costOf(model, u).toFixed(4)}`, 10)}`,
    );
  }
  lines.push(`  ${pad("TOTAL", 26)}${padLeft("", 8)}${padLeft("", 12)}${padLeft("", 10)}${padLeft(`$${totalCost(suite.usage).toFixed(4)}`, 10)}`);
  lines.push(`  wall clock: ${(suite.durationMs / 1000).toFixed(1)}s`);
  if (suite.resultsPath) lines.push(`  written to ${suite.resultsPath}`);
  lines.push("");

  console.log(lines.join("\n"));
}
