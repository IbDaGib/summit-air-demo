# Known issues

Written as I built. Feeds the self-critique in the demo.

- [ ] The eval harness re-implements the turn loop, because Vapi owns it on a real call. Prompt, tool schemas, tool dispatch and the safety backstop are shared with the webhook; turn-taking, endpointing and barge-in are not covered by any test.
- [ ] `evals/models/offline.ts` lets the suite run with no API keys, but it is a fixed policy rather than a model. A green offline run says the harness works, not that the prompt does. CI needs `MISTRAL_API_KEY` for the assertions to mean anything.
- [ ] The runtime injects `outdoorTempF` into `assess_situation` in the eval harness, but `app/api/vapi/tools/route.ts` does not do it yet — on a live call the tier for a no-heat job depends on the model reporting the temperature it was told about.
- [ ] The stub handlers hold the booked-slot set in module scope, so parallel eval runs contend for the same six windows. The agent recovers via the conflict path, which is realistic, but it means booking assertions also exercise conflict handling whether or not that was the intent.

