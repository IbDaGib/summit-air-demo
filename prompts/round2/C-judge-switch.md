# Workspace C — judge switch (do this on top of C-fix.md)

**Decision: the judge moves to Mistral. Drop the Anthropic dependency entirely** —
one provider, one API key, one bill. Remove `@anthropic-ai/sdk` from
`package.json`.

## Judge configuration
- Model: **`magistral-medium-latest`** (tier-verified working). Mistral's
  reasoning model, and deliberately *not* `mistral-medium-latest`, which drives
  the calls — the judge should at least be a different model from the one it scores.
- Structured output: Mistral supports `response_format: { type: "json_schema",
  json_schema: { name, strict: true, schema } }` — verified HTTP 200 against
  this key. Use it; do not parse prose.
- Reuse the existing OpenAI-compatible client in `evals/models/mistral.ts`
  rather than adding a second HTTP path.

## Bound the self-preference bias — this is the part that matters
Judging inside one model family risks the judge flattering its own family's
output. Do all three:

1. **Keep the judge non-gating.** No test may assert on a judge number. This is
   already the design; do not weaken it.
2. **Blind the judge.** Pass the transcript and the rubric only. Do **not** pass
   the system prompt, the scenario's expected outcome, or which model generated
   the turns — otherwise it scores instruction-compliance it can read.
3. **Make the rubric behavioural, not aesthetic.** Replace anything shaped like
   "was this good" with observable checks: did it read the address back, did it
   ask one question per turn, did it avoid quoting a firm price, did it stall
   before an emergency. Keep the four dimensions.

Note the limitation in the run banner and in `evals/README` if you have one, the
same way you already flag offline runs. An honest caveat printed next to the
scores is worth more than a score that pretends to be independent.

## Then run it live
`MISTRAL_API_KEY` is set in the root `.env.local`. Run the full suite for real:
`npx vitest run evals`. Report the assertion table and the judge table with mean
and spread across the 3 runs, plus total token cost.

If a scenario fails against Mistral Medium, that is the most valuable output of
the night — name the assertion and paste the transcript.
