# Evals

A text-mode harness that drives the **real** agent core — `systemPrompt()` and
`turnContext()` from `agent/prompt`, `TOOL_LIST` from `agent/tools/schemas`, the
deterministic backstop in `agent/tools/guard`, and a `ToolHandlers`
implementation. Nothing about the agent is re-implemented here; this is the
transport, standing in for Vapi.

## Running

```bash
npx vitest run evals          # the gate: hard assertions, n=3 per scenario
npx tsx evals/run.ts          # same suite, report to the console
npx tsx evals/run.ts --scenario gas-smell --n 1
```

Environment:

| Variable | Effect |
| --- | --- |
| `MISTRAL_API_KEY` | Drives both the agent and the simulated caller with Mistral Large — the model the phone calls use. Without it the suite falls back to a deterministic offline stand-in. |
| `ANTHROPIC_API_KEY` | Enables the Claude Opus 5 judge. Without it, judge columns are blank; nothing fails. |
| `EVAL_RUNS` | Runs per scenario, default 3. |
| `EVAL_CONCURRENCY` | Parallel conversations, default 4 live / 8 offline. |

## The design rule

**Hard assertions gate the build. Judge scores trend.**

`evals/assertions.ts` and the `assert()` on each scenario are deterministic
checks over tool calls and transcript text — those fail the build.
`evals/judge.ts` returns 1–5 ratings from a different model family than the one
driving the call, and no test ever asserts on them. A stochastic gate is worse
than no gate.

## Layout

| File | What it is |
| --- | --- |
| `caller.ts` | The simulated caller. A persona is an opening line, facts revealed only when asked, and a difficulty. |
| `agent.ts` | The turn loop and tool dispatch, mirroring `app/api/vapi/tools/route.ts`. |
| `judge.ts` | Claude Opus 5, structured output, four rubric dimensions. |
| `assertions.ts` | The deterministic checks, including the firm-price and instruction-leak detectors. |
| `scenarios/*.ts` | Five scenarios; each owns its persona, turn budget, and assertions. |
| `suite.ts` | Runs everything, n per scenario, bounded parallelism. |
| `models/offline.ts` | The no-API-key stand-in. Exercises the harness, not the prompt. |
| `results/` | One JSON per run, named for the git sha, carrying the prompt hash. |

## Results

Every run writes `evals/results/<git-sha>.json` (offline runs get an `-offline`
suffix so they cannot overwrite a real one) with the full transcripts, every
tool call and its result, the assertions, the judge output, token usage, and a
hash of both the assembled system prompt and the prompt source files. A
regression is then a diff between two files rather than a memory of what the
scores were last week.

## Caveats

- Vapi owns the turn loop on a real call, so this harness is a second
  implementation of turn-taking. Prompt, tool schemas, dispatch and the safety
  backstop are shared; endpointing, barge-in and latency are not testable here.
- The offline stand-in is a fixed policy, not a language model. An offline run
  proves the harness works. Only a run with `MISTRAL_API_KEY` set tells you
  anything about the prompt.
- Handlers default to the in-memory stub, so the suite is not blocked on the
  database-backed handlers. `runSuite({ handlers })` swaps them.
