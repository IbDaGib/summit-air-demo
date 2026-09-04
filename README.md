# Summit Air — AI inbound phone agent

Revin FDE case study. **Summit Air here is the fictional company from the case study; all data is mock.**

## Architecture

- `agent/` — transport-agnostic core. **Nothing here imports Vapi.** That is what lets the eval harness drive the same prompt and the same tool handlers the phone calls use.
- `agent/policy/priority.ts` — the model extracts *facts*; a pure function computes the P0–P3 tier. The LLM never chooses the priority.
- `agent/policy/safetyScan.ts` — deterministic keyword backstop. Life-safety escalation does not depend on the model following instructions.
- `app/` — thin Next.js layer: Vapi tool webhook, end-of-call webhook, dispatch dashboard.
- `scripts/deploy-assistant.ts` — pushes prompt + tools + model config to Vapi. No dashboard clicking; the repo is the source of truth.

## Stack

| Layer | Choice |
| --- | --- |
| Voice pipeline | Vapi (telephony, STT, TTS, VAD, barge-in) |
| Call model | Mistral Large (Vapi-native) |
| Offline model | Claude Opus 5 — post-call extraction + eval judge |
| App | Next.js on Vercel |
| Data | Supabase Postgres |
| Scheduling | Postgres `EXCLUDE USING gist` — double-booking impossible at the DB level |
| Evals | Vitest + simulated caller + LLM judge |

## Dispatch dashboard

Read-only operator view at `/calls`, `/calls/[id]` and `/schedule`.

Set `DASH_SECRET` in `.env.local`, then open the dashboard once with the key:

```
/calls?key=<DASH_SECRET>
```

`proxy.ts` exchanges it for an httpOnly cookie (12h) and strips the key from the
URL so it never lands in a screen share. One shared secret, not an auth system —
dashboard auth is out of scope per DECISIONS.md. With `DASH_SECRET` unset the
dashboard fails closed rather than serving transcripts to the open internet.

> `proxy.ts` is what used to be `middleware.ts`. Next.js 16 renamed the file
> convention and the exported function; `middleware.ts` is deprecated.

The call list polls every 3s rather than subscribing to Supabase Realtime —
indistinguishable on a screen share, with no subscription lifecycle to get wrong.

See DECISIONS.md for rejected alternatives and KNOWN_ISSUES.md for what I would fix next.
