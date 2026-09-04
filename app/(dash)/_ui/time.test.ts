import { describe, expect, it } from "vitest";
import { arrivalWindow, denverInstant } from "./time";

const DENVER = "America/Denver";

const denverHour = (d: Date) =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: DENVER,
      hour: "numeric",
      hourCycle: "h23",
    }).format(d),
  );

/** e.g. "MST" / "MDT" — proves which side of the transition an instant is on. */
const denverZone = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: DENVER, timeZoneName: "short" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")!.value;

// 2027-03-14 is Denver's spring-forward date: 02:00 MST -> 03:00 MDT.
// 2027-11-07 is the fall-back date: 02:00 MDT -> 01:00 MST.
const SPRING_FORWARD = new Date("2027-03-14T18:00:00Z");
const FALL_BACK = new Date("2027-11-07T18:00:00Z");
const ORDINARY = new Date("2026-09-10T18:00:00Z");

describe("denverInstant resolves the offset at the target instant", () => {
  it("gives 8am MDT, not 9am, on the spring-forward date", () => {
    const at = denverInstant(0, 8, SPRING_FORWARD);
    expect(denverHour(at)).toBe(8);
    expect(denverZone(at)).toBe("MDT");
    // The bug read the offset from the wall-time-as-UTC guess, which sits at
    // 01:00 MST — before the transition — and shifted the window to 9am.
    expect(at.toISOString()).toBe("2027-03-14T14:00:00.000Z");
  });

  it("gives 8am MST on the fall-back date", () => {
    const at = denverInstant(0, 8, FALL_BACK);
    expect(denverHour(at)).toBe(8);
    expect(denverZone(at)).toBe("MST");
    expect(at.toISOString()).toBe("2027-11-07T15:00:00.000Z");
  });

  it("keeps midnight on the correct side of the spring-forward transition", () => {
    // The schedule page asks for hour 0 to bound its booking query. Midnight is
    // before the 02:00 changeover, so it is still MST.
    const at = denverInstant(0, 0, SPRING_FORWARD);
    expect(denverHour(at)).toBe(0);
    expect(denverZone(at)).toBe("MST");
    expect(at.toISOString()).toBe("2027-03-14T07:00:00.000Z");
  });

  it("resolves the nonexistent 02:00 forward to 03:00 MDT", () => {
    // 02:00–02:59 does not exist on 2027-03-14; the clock jumps 02:00 -> 03:00.
    // Asking for it must land on the transition instant, never slide backwards
    // into 01:00 MST, which is a different hour than the caller asked for.
    const at = denverInstant(0, 2, SPRING_FORWARD);
    expect(at.toISOString()).toBe("2027-03-14T09:00:00.000Z");
    expect(denverHour(at)).toBe(3);
    expect(denverZone(at)).toBe("MDT");
  });

  it("still resolves the hours either side of the gap exactly", () => {
    expect(denverHour(denverInstant(0, 1, SPRING_FORWARD))).toBe(1);
    expect(denverHour(denverInstant(0, 3, SPRING_FORWARD))).toBe(3);
  });

  for (const hour of [0, 8, 10, 13, 15, 23]) {
    it(`is ${hour}:00 Denver on an ordinary day`, () => {
      expect(denverHour(denverInstant(0, hour, ORDINARY))).toBe(hour);
    });
  }

  it("holds for every hour of both transition days", () => {
    for (const from of [SPRING_FORWARD, FALL_BACK]) {
      for (let hour = 0; hour < 24; hour++) {
        const at = denverInstant(0, hour, from);
        // Every hour resolves to itself except the one that does not exist.
        const expected = from === SPRING_FORWARD && hour === 2 ? 3 : hour;
        expect({ hour, got: denverHour(at) }).toEqual({ hour, got: expected });
      }
    }
  });
});

describe("arrivalWindow renders windows built on a transition day", () => {
  it("reads as 8–10 AM on the spring-forward date", () => {
    const start = denverInstant(0, 8, SPRING_FORWARD);
    const end = denverInstant(0, 10, SPRING_FORWARD);
    expect(arrivalWindow(start.toISOString(), end.toISOString())).toBe("8–10 AM");
  });

  it("reads as 10 AM–12 PM across the meridiem boundary", () => {
    const start = denverInstant(0, 10, SPRING_FORWARD);
    const end = denverInstant(0, 12, SPRING_FORWARD);
    expect(arrivalWindow(start.toISOString(), end.toISOString())).toBe("10 AM–12 PM");
  });
});
