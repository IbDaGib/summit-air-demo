import { describe, expect, it } from "vitest";
import { denverInstant } from "./time";

const denverHour = (d: Date) =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Denver",
      hour: "numeric",
      hourCycle: "h23",
    }).format(d),
  );

describe("denverInstant resolves the offset at the target instant", () => {
  // 2027-03-14 is Denver's spring-forward date. Reading the offset from the
  // wall-time-as-UTC guess lands on the wrong side of the transition.
  it("is 8am Denver on the spring-forward date", () => {
    const onTransitionDay = new Date("2027-03-14T18:00:00Z");
    expect(denverHour(denverInstant(0, 8, onTransitionDay))).toBe(8);
  });

  it("is 8am Denver on the fall-back date", () => {
    const fallBack = new Date("2027-11-07T18:00:00Z");
    expect(denverHour(denverInstant(0, 8, fallBack))).toBe(8);
  });

  for (const hour of [8, 10, 13, 15]) {
    it(`is ${hour}:00 Denver on an ordinary day`, () => {
      expect(denverHour(denverInstant(0, hour, new Date("2026-09-10T18:00:00Z")))).toBe(hour);
    });
  }
});
