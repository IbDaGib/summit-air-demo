import { describe, expect, it } from "vitest";
import { callerPhoneFromPayload, phoneDigits } from "./callerId";

describe("callerPhoneFromPayload", () => {
  it("reads the end-of-call shape", () => {
    expect(callerPhoneFromPayload({ call: { customer: { number: "+16034514978" } } })).toBe(
      "+16034514978",
    );
  });
  it("reads a top-level customer", () => {
    expect(callerPhoneFromPayload({ customer: { number: "+14065550118" } })).toBe("+14065550118");
  });
  it("reads call.from", () => {
    expect(callerPhoneFromPayload({ call: { from: "406-555-0118" } })).toBe("406-555-0118");
  });
  it("ignores a number too short to be real", () => {
    expect(callerPhoneFromPayload({ call: { customer: { number: "123" } } })).toBeUndefined();
  });
  it("ignores anything the model might have written", () => {
    expect(callerPhoneFromPayload({ call: { customer: { number: "unknown" } } })).toBeUndefined();
    expect(callerPhoneFromPayload(undefined)).toBeUndefined();
  });
});

describe("phoneDigits", () => {
  it("normalises formatting to the last ten digits", () => {
    for (const p of ["+1 (406) 555-0118", "406.555.0118", "14065550118"]) {
      expect(phoneDigits(p)).toBe("4065550118");
    }
  });
  it("is empty for junk", () => {
    expect(phoneDigits("unknown")).toBe("");
    expect(phoneDigits(undefined)).toBe("");
  });
});
