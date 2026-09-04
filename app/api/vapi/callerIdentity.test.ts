import { describe, expect, it } from "vitest";
import { callerPhoneFromPayload } from "./callerIdentity";

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
  it("rejects a number too short to be real", () => {
    expect(callerPhoneFromPayload({ call: { customer: { number: "123" } } })).toBeUndefined();
  });
  it("rejects anything the model might have invented", () => {
    expect(callerPhoneFromPayload({ call: { customer: { number: "unknown" } } })).toBeUndefined();
    expect(callerPhoneFromPayload({})).toBeUndefined();
    expect(callerPhoneFromPayload(undefined)).toBeUndefined();
  });
});
