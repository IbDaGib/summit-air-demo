/**
 * Runs every scenario n times and collects the results.
 *
 * The models are swappable; the agent core is not. Handlers default to the stub
 * so the harness is never blocked on the database-backed handlers landing —
 * pass a different ToolHandlers and nothing else changes.
 */
import { stubHandlers } from "../agent/tools/handlers/stub";
import type { ToolHandlers } from "../agent/tools/schemas";
import { runCall } from "./agent";
import { makeCaller } from "./caller";
import { totalCost } from "./cost";
import { hasKey } from "./env";
import { JUDGE_MODEL, judgeCall } from "./judge";
import { mistralModel } from "./models/mistral";
import { OFFLINE_MODEL_ID, offlineAgentModel, offlineCallerModel } from "./models/offline";
import type { ChatModel, UsageByModel } from "./models/types";
import { addUsage, mergeUsage } from "./models/types";
import { fingerprint, writeResults } from "./results";
import type { RunFingerprint } from "./results";
import { SCENARIOS } from "./scenarios";
import type { RunResult, Scenario } from "./types";

export interface SuiteOptions {
  n?: number;
  scenarios?: Scenario[];
  concurrency?: number;
  handlers?: ToolHandlers;
  write?: boolean;
}

export interface SuiteResult {
  mode: "live" | "offline";
  runsPerScenario: number;
  models: { agent: string; caller: string; judge: string };
  fingerprint: RunFingerprint;
  runs: RunResult[];
  usage: UsageByModel;
  costUsd: number;
  durationMs: number;
  startedAt: string;
  resultsPath?: string;
}

/** Bounded parallelism: enough to keep the wall clock sane, not enough to get rate limited. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function runSuite(opts: SuiteOptions = {}): Promise<SuiteResult> {
  const n = opts.n ?? Number(process.env.EVAL_RUNS ?? 3);
  const scenarios = opts.scenarios ?? SCENARIOS;
  const handlers = opts.handlers ?? stubHandlers;
  const live = hasKey("MISTRAL_API_KEY");
  const mode: SuiteResult["mode"] = live ? "live" : "offline";
  const concurrency = opts.concurrency ?? Number(process.env.EVAL_CONCURRENCY ?? (live ? 4 : 8));
  const startedAt = new Date().toISOString();
  const started = Date.now();

  if (!live) {
    console.warn(
      "\n[evals] MISTRAL_API_KEY is not set — running the deterministic offline stand-in.\n" +
        "[evals] Hard assertions still gate, but they are exercising the HARNESS, not the prompt.\n",
    );
  }
  if (!hasKey("ANTHROPIC_API_KEY")) {
    console.warn("[evals] ANTHROPIC_API_KEY is not set — judge scores will be blank.\n");
  }

  const jobs = scenarios.flatMap((scenario) =>
    Array.from({ length: n }, (_, runIndex) => ({ scenario, runIndex })),
  );

  const usage: UsageByModel = {};

  const runs = await pool(jobs, concurrency, async ({ scenario, runIndex }): Promise<RunResult> => {
    const agentModel: ChatModel = live ? mistralModel() : offlineAgentModel();
    const callerModel: ChatModel = live ? mistralModel() : offlineCallerModel(scenario.persona);
    const callerUsage: UsageByModel = {};
    const caller = makeCaller(scenario.persona, callerModel, (id, u) => addUsage(callerUsage, id, u));

    const call = await runCall(scenario, { agentModel, caller, handlers });
    mergeUsage(call.usage, callerUsage);

    const { result: judge, usage: judgeUsage, skippedBecause } = await judgeCall(scenario, call);
    if (judgeUsage.calls) addUsage(call.usage, JUDGE_MODEL, judgeUsage);
    mergeUsage(usage, call.usage);

    return {
      scenarioId: scenario.id,
      runIndex,
      call,
      assertions: scenario.assert(call),
      judge,
      ...(skippedBecause ? { judgeSkippedBecause: skippedBecause } : {}),
    };
  });

  const fp = fingerprint();
  const suite: SuiteResult = {
    mode,
    runsPerScenario: n,
    models: {
      agent: live ? mistralModel().id : OFFLINE_MODEL_ID,
      caller: live ? mistralModel().id : OFFLINE_MODEL_ID,
      judge: hasKey("ANTHROPIC_API_KEY") ? JUDGE_MODEL : "(skipped)",
    },
    fingerprint: fp,
    runs,
    usage,
    costUsd: totalCost(usage),
    durationMs: Date.now() - started,
    startedAt,
  };

  if (opts.write !== false) {
    suite.resultsPath = writeResults({ fingerprint: fp, mode }, {
      startedAt,
      finishedAt: new Date().toISOString(),
      mode,
      runsPerScenario: n,
      models: suite.models,
      fingerprint: fp,
      handlers: handlers === stubHandlers ? "stub" : "custom",
      costUsd: suite.costUsd,
      usage,
      scenarios: scenarios.map((s) => ({
        id: s.id,
        title: s.title,
        turnBudget: s.turnBudget,
        runs: runs
          .filter((r) => r.scenarioId === s.id)
          .map((r) => ({
            runIndex: r.runIndex,
            assertions: r.assertions,
            judge: r.judge,
            judgeSkippedBecause: r.judgeSkippedBecause,
            endedBy: r.call.endedBy,
            endOutcome: r.call.endOutcome,
            callerTurns: r.call.callerTurns,
            usage: r.call.usage,
            toolCalls: r.call.toolCalls,
            transcript: r.call.transcript,
            error: r.call.error,
          })),
      })),
    });
  }

  return suite;
}

export const failedAssertions = (suite: SuiteResult) =>
  suite.runs.flatMap((r) => r.assertions.filter((a) => !a.pass).map((a) => `${r.scenarioId}#${r.runIndex + 1} ${a.name}: ${a.detail}`));
