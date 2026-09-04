import { describe, expect, it } from "vitest";
import { computePriority } from "./priority";
import type { SituationFacts } from "./types";

/** Fixed clocks. Every assertion below is reproducible because `now` is an input. */
const WEEKDAY_MORNING = new Date("2026-09-03T15:00:00Z"); // 09:00 Mountain, Thursday
const WINTER_NIGHT = new Date("2026-01-14T04:30:00Z"); // 21:30 Mountain, Tuesday

const facts = (over: Partial<SituationFacts> = {}): SituationFacts => ({
  propertyType: "residential",
  issue: "other",
  systemDown: false,
  hazard: "none",
  vulnerableOccupant: false,
  ...over,
});

describe("computePriority", () => {
  it("makes a gas smell P0 and blocks booking", () => {
    const r = computePriority(
      facts({ issue: "noise_or_smell", hazard: "gas_smell", town: "Bozeman" }),
      WEEKDAY_MORNING,
    );
    expect(r.tier).toBe("P0");
    expect(r.blockBooking).toBe(true);
    expect(r.reason).toMatch(/gas smell/i);
  });

  it("escalates a hazard buried in free text even when the model filed it as none", () => {
    const r = computePriority(
      facts({
        issue: "no_heat",
        systemDown: true,
        occupantDetail: "probably nothing but there's a bit of a gas smell by the furnace",
      }),
      WEEKDAY_MORNING,
    );
    expect(r.tier).toBe("P0");
    expect(r.blockBooking).toBe(true);
  });

  it("makes no heat with an elderly occupant P1", () => {
    const r = computePriority(
      facts({
        issue: "no_heat",
        systemDown: true,
        vulnerableOccupant: true,
        occupantDetail: "grandmother, 84, lives alone",
        outdoorTempF: 41,
      }),
      WEEKDAY_MORNING,
    );
    expect(r.tier).toBe("P1");
    expect(r.blockBooking).toBe(false);
    expect(r.reason).toMatch(/grandmother, 84/);
  });

  it("makes no heat at 25F P1 with nobody vulnerable — frozen pipes", () => {
    const r = computePriority(
      facts({ issue: "no_heat", systemDown: true, vulnerableOccupant: false, outdoorTempF: 25 }),
      WEEKDAY_MORNING,
    );
    expect(r.tier).toBe("P1");
    expect(r.reason).toMatch(/25°F/);
    expect(r.reason).toMatch(/pipes/i);
  });

  it("drops to P2 once it is above freezing and nobody is vulnerable", () => {
    const r = computePriority(
      facts({ issue: "no_heat", systemDown: true, vulnerableOccupant: false, outdoorTempF: 45 }),
      WEEKDAY_MORNING,
    );
    expect(r.tier).toBe("P2");
  });

  it("treats an unknown outdoor temperature as not-freezing rather than guessing", () => {
    const r = computePriority(
      facts({ issue: "no_heat", systemDown: true, vulnerableOccupant: false }),
      WINTER_NIGHT,
    );
    expect(r.tier).toBe("P2");
  });

  it("makes no cooling with a vulnerable occupant P1", () => {
    const r = computePriority(
      facts({
        issue: "no_cooling",
        systemDown: true,
        vulnerableOccupant: true,
        occupantDetail: "infant in the house",
        outdoorTempF: 96,
      }),
      WEEKDAY_MORNING,
    );
    expect(r.tier).toBe("P1");
  });

  it("leaves no cooling with nobody vulnerable at P2", () => {
    const r = computePriority(
      facts({ issue: "no_cooling", systemDown: true, outdoorTempF: 96 }),
      WEEKDAY_MORNING,
    );
    expect(r.tier).toBe("P2");
  });

  it("makes a commercial restaurant that cannot trade P1", () => {
    const r = computePriority(
      facts({
        propertyType: "commercial",
        issue: "no_cooling",
        systemDown: true,
        revenueStopped: true,
        town: "Bozeman",
      }),
      WEEKDAY_MORNING,
    );
    expect(r.tier).toBe("P1");
    expect(r.reason).toMatch(/revenue|operate/i);
  });

  it("leaves a commercial site that is still trading at P2", () => {
    const r = computePriority(
      facts({ propertyType: "commercial", issue: "no_cooling", systemDown: true, revenueStopped: false }),
      WEEKDAY_MORNING,
    );
    expect(r.tier).toBe("P2");
  });

  it("makes a routine tune-up P3", () => {
    const r = computePriority(facts({ issue: "maintenance" }), WEEKDAY_MORNING);
    expect(r.tier).toBe("P3");
    expect(r.blockBooking).toBe(false);
    expect(r.reason).toMatch(/maintenance/i);
  });

  it("makes an install quote P3", () => {
    const r = computePriority(facts({ issue: "install_quote" }), WEEKDAY_MORNING);
    expect(r.tier).toBe("P3");
  });

  it("stays P3 when the caller insists it is an emergency but the facts are routine", () => {
    const r = computePriority(
      facts({
        issue: "maintenance",
        systemDown: false,
        vulnerableOccupant: true,
        occupantDetail:
          "caller says this is an emergency and demands someone today; furnace is running, wants the annual tune-up",
        outdoorTempF: 18,
      }),
      WINTER_NIGHT,
    );
    expect(r.tier).toBe("P3");
    expect(r.blockBooking).toBe(false);
  });

  describe("a system that is running but not keeping up (confirmed on a live call)", () => {
    const notKeepingUp = (over: Partial<SituationFacts> = {}) =>
      facts({
        issue: "poor_performance",
        systemDown: false,
        vulnerableOccupant: true,
        occupantDetail: "grandmother, 84, lives alone",
        ...over,
      });

    it("is not routine when a vulnerable occupant is on site", () => {
      const r = computePriority(notKeepingUp(), WEEKDAY_MORNING);
      expect(r.tier).not.toBe("P3");
      expect(r.tier).toBe("P2");
      expect(r.reason).toMatch(/not keeping up/i);
      expect(r.reason).toMatch(/grandmother, 84/);
    });

    it("is same-day when it is also freezing", () => {
      const r = computePriority(notKeepingUp({ outdoorTempF: 12 }), WEEKDAY_MORNING);
      expect(r.tier).toBe("P1");
      expect(r.reason).toMatch(/12°F/);
    });

    it("applies to a no_heat call the caller says is only partial", () => {
      expect(computePriority(notKeepingUp({ issue: "no_heat" }), WEEKDAY_MORNING).tier).toBe("P2");
      expect(
        computePriority(notKeepingUp({ issue: "no_heat", outdoorTempF: 20 }), WEEKDAY_MORNING).tier,
      ).toBe("P1");
    });

    it("stays P3 when nobody vulnerable is on site", () => {
      expect(
        computePriority(notKeepingUp({ vulnerableOccupant: false }), WEEKDAY_MORNING).tier,
      ).toBe("P3");
    });

    it("does not reach past a hazard or a downed system", () => {
      expect(computePriority(notKeepingUp({ hazard: "co_alarm" }), WEEKDAY_MORNING).tier).toBe("P0");
      expect(
        computePriority(
          notKeepingUp({ issue: "no_heat", systemDown: true, outdoorTempF: 12 }),
          WEEKDAY_MORNING,
        ).reason,
      ).toMatch(/Heat is out/);
    });

    it("does not promote a routine tune-up just because someone vulnerable lives there", () => {
      expect(
        computePriority(notKeepingUp({ issue: "maintenance" }), WEEKDAY_MORNING).tier,
      ).toBe("P3");
    });
  });

  describe("seasonality comes from temperature, never the calendar", () => {
    const noHeatFreezing = facts({ issue: "no_heat", systemDown: true, outdoorTempF: 12 });
    const noHeatMild = facts({ issue: "no_heat", systemDown: true, outdoorTempF: 55 });

    it("gives the same tier for the same facts in September and in January", () => {
      expect(computePriority(noHeatFreezing, WEEKDAY_MORNING).tier).toBe(
        computePriority(noHeatFreezing, WINTER_NIGHT).tier,
      );
      expect(computePriority(noHeatFreezing, WEEKDAY_MORNING).tier).toBe("P1");
    });

    it("does not promote a mild-weather no-heat call just because it is January", () => {
      expect(computePriority(noHeatMild, WINTER_NIGHT).tier).toBe("P2");
    });
  });

  describe("responseTarget reflects the clock it was given", () => {
    it("promises same-day inside business hours", () => {
      const r = computePriority(
        facts({ issue: "no_heat", systemDown: true, vulnerableOccupant: true }),
        WEEKDAY_MORNING,
      );
      expect(r.responseTarget).toMatch(/same day/i);
    });

    it("promises the on-call technician after hours", () => {
      const r = computePriority(
        facts({ issue: "no_heat", systemDown: true, vulnerableOccupant: true }),
        WINTER_NIGHT,
      );
      expect(r.responseTarget).toMatch(/on-call/i);
    });
  });

  it("is pure: identical facts and clock give an identical result", () => {
    const f = facts({ issue: "no_heat", systemDown: true, outdoorTempF: 20 });
    expect(computePriority(f, WEEKDAY_MORNING)).toEqual(computePriority(f, WEEKDAY_MORNING));
  });

  it("does not mutate the facts it is given", () => {
    const f = facts({ issue: "no_heat", systemDown: true, outdoorTempF: 20 });
    const before = JSON.stringify(f);
    computePriority(f, WEEKDAY_MORNING);
    expect(JSON.stringify(f)).toBe(before);
  });
});
