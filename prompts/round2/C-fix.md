# Workspace C — round 2

Greptile reviewed PR #3: **Confidence 4/5**, one blocking issue.

> "The emergency tool path must be made terminal before merging so a model
> response cannot book an appointment after life-safety escalation. The new call
> loop processes all tool calls even after a successful emergency escalation,
> allowing a later booking call to execute before the post-run assertion reports
> the violation."

**Files needing attention:** `evals/agent.ts`

## Do
1. `git fetch origin && git rebase origin/main` — main has moved four commits.
2. Main now enforces this at the transport boundary in
   `agent/tools/callState.ts` (`BLOCKED_AFTER_ESCALATION`). **Reuse it** in the
   eval loop rather than writing a parallel mechanism — the point of the eval
   harness is that it exercises the same guards the phone does.
3. Add an assertion to `gas-smell` proving a booking attempted *after*
   escalation is blocked, not merely reported.

## Then the thing that actually matters
`ANTHROPIC_API_KEY` and `MISTRAL_API_KEY` are now set in the root `.env.local`.
Re-run the suite live: `npx vitest run evals`. The offline run proved the
harness; a live run proves the prompt. Expect ~15 conversations and a couple of
dollars.

Report the real assertion table and judge scores. If a scenario fails against
Mistral Medium, that is the most valuable output of the night — say exactly
which assertion failed and paste the transcript.

## Validate
`npx next typegen && npx tsc --noEmit`, then the live suite. Paste real output.
