import { describe, expect, it } from "vitest";
import { assistant } from "./assistant-config";

// The default model silently reverted to Mistral once and shipped four times
// before a caller heard tool-call JSON read aloud. This pins the decision.
describe("assistant config defaults", () => {
  it("runs on gpt-5.6-luna via openai unless explicitly overridden", () => {
    expect(assistant.model.provider).toBe(process.env.VAPI_PROVIDER ?? "openai");
    expect(assistant.model.model).toBe(process.env.VAPI_MODEL ?? "gpt-5.6-luna");
  });
  it("never defaults to a Mistral model — Vapi flattens its tool history to text", () => {
    if (!process.env.VAPI_MODEL) expect(assistant.model.model).not.toMatch(/mistral|magistral/i);
  });
  it("declares every tool and speaks filler only on the two slow ones", () => {
    const tools = assistant.model.tools as { function: { name: string }; messages?: unknown[] }[];
    expect(tools.map((t) => t.function.name)).toContain("record_call_outcome");
    expect(tools.filter((t) => t.messages?.length).map((t) => t.function.name).sort())
      .toEqual(["book_appointment", "find_slots"]);
  });
});
