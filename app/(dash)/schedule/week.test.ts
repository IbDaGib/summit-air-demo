import { describe, expect, it } from "vitest";
import { denverDayKey } from "../_ui/time";
import {
  parseWeekParam,
  shiftWeek,
  weekDays,
  weekKeyOf,
  weekLabel,
  weekOffset,
  weekRange,
  weekRelation,
} from "./week";

const DENVER = "America/Denver";

const denverHour = (d: Date) =>
  Number(
    new Intl.DateTimeFormat("en-US", { timeZone: DENVER, hour: "numeric", hourCycle: "h23" }).format(d),
  );

/** "MST" / "MDT" — which side of a transition an instant is on. */
const denverZone = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: DENVER, timeZoneName: "short" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")!.value;

// An ordinary week in September 2026 (MDT, UTC-6). Mon Sep 7 – Fri Sep 11.
const WED = new Date("2026-09-09T18:00:00Z");
const HOUR = 3_600_000;

describe("weekKeyOf", () => {
  it("is the Monday of the Denver week for a midweek instant", () => {
    expect(weekKeyOf(WED)).toBe("2026-09-07");
  });

  it("is the same day when now is already a Monday", () => {
    expect(weekKeyOf(new Date("2026-09-07T18:00:00Z"))).toBe("2026-09-07");
  });

  it("puts a Sunday in the week that began six days earlier", () => {
    // JS getDay() gives Sunday 0, so a naive `day - 1` would run backwards to Saturday.
    expect(weekKeyOf(new Date("2026-09-13T18:00:00Z"))).toBe("2026-09-07");
  });

  it("uses the Denver date, not the UTC date, when they disagree", () => {
    // 03:00Z on Mon Sep 14 is 21:00 MDT on Sun Sep 13 — still last week in Denver.
    expect(weekKeyOf(new Date("2026-09-14T03:00:00Z"))).toBe("2026-09-07");
    // 06:00Z on Mon Sep 14 is exactly 00:00 MDT — the new week has begun.
    expect(weekKeyOf(new Date("2026-09-14T06:00:00Z"))).toBe("2026-09-14");
  });

  it("holds through the spring-forward Sunday (2026-03-08)", () => {
    // 01:30 MST, half an hour before the clocks jump.
    expect(weekKeyOf(new Date("2026-03-08T08:30:00Z"))).toBe("2026-03-02");
    // 03:00 MDT, the instant the clocks land on.
    expect(weekKeyOf(new Date("2026-03-08T09:00:00Z"))).toBe("2026-03-02");
    // 23:30 MDT on the Sunday — the UTC date is already Monday Mar 9.
    expect(weekKeyOf(new Date("2026-03-09T05:30:00Z"))).toBe("2026-03-02");
    // 00:00 MDT Monday Mar 9 — six hours behind UTC now, not seven.
    expect(weekKeyOf(new Date("2026-03-09T06:00:00Z"))).toBe("2026-03-09");
  });

  it("holds through the fall-back Sunday (2026-11-01)", () => {
    // 01:30 MDT, the first pass through 1am.
    expect(weekKeyOf(new Date("2026-11-01T07:30:00Z"))).toBe("2026-10-26");
    // 01:30 MST, the second pass through 1am.
    expect(weekKeyOf(new Date("2026-11-01T08:30:00Z"))).toBe("2026-10-26");
    // 23:59 MST Sunday — UTC is already Monday Nov 2.
    expect(weekKeyOf(new Date("2026-11-02T06:59:00Z"))).toBe("2026-10-26");
    // 00:00 MST Monday Nov 2 — seven hours behind UTC again.
    expect(weekKeyOf(new Date("2026-11-02T07:00:00Z"))).toBe("2026-11-02");
  });
});

describe("parseWeekParam", () => {
  const current = weekKeyOf(WED);

  it("falls back to the current week when the param is missing", () => {
    expect(parseWeekParam(undefined, WED)).toBe(current);
  });

  it("falls back when the param is repeated (?week=a&week=b)", () => {
    expect(parseWeekParam(["2026-09-14", "2026-09-21"], WED)).toBe(current);
  });

  it("falls back on garbage and on loosely formatted dates", () => {
    expect(parseWeekParam("", WED)).toBe(current);
    expect(parseWeekParam("next", WED)).toBe(current);
    expect(parseWeekParam("2026-9-7", WED)).toBe(current);
    expect(parseWeekParam("2026-09-07T00:00:00Z", WED)).toBe(current);
    expect(parseWeekParam("07-09-2026", WED)).toBe(current);
  });

  it("falls back on a well-formed date that does not exist", () => {
    // Date.UTC would roll Feb 30 over to Mar 2 (a Monday in 2026) — it must not pass.
    expect(parseWeekParam("2026-02-30", WED)).toBe(current);
    expect(parseWeekParam("2026-13-01", WED)).toBe(current);
  });

  it("falls back when the date is not a Monday", () => {
    expect(parseWeekParam("2026-09-08", WED)).toBe(current); // Tuesday
    expect(parseWeekParam("2026-09-13", WED)).toBe(current); // Sunday
  });

  it("accepts any Monday, past or future, including across DST", () => {
    expect(parseWeekParam("2026-09-14", WED)).toBe("2026-09-14");
    expect(parseWeekParam("2025-01-06", WED)).toBe("2025-01-06");
    expect(parseWeekParam("2026-03-09", WED)).toBe("2026-03-09");
    expect(parseWeekParam("2026-11-02", WED)).toBe("2026-11-02");
  });
});

describe("shiftWeek", () => {
  it("moves by whole weeks in either direction", () => {
    expect(shiftWeek("2026-09-07", 1)).toBe("2026-09-14");
    expect(shiftWeek("2026-09-07", -1)).toBe("2026-08-31");
    expect(shiftWeek("2026-09-07", 0)).toBe("2026-09-07");
    expect(shiftWeek("2026-09-07", 4)).toBe("2026-10-05");
  });

  it("crosses a year boundary", () => {
    expect(shiftWeek("2026-12-28", 1)).toBe("2027-01-04");
    expect(shiftWeek("2027-01-04", -1)).toBe("2026-12-28");
  });

  it("is exactly seven calendar days across both DST transitions", () => {
    expect(shiftWeek("2026-03-02", 1)).toBe("2026-03-09");
    expect(shiftWeek("2026-03-09", -1)).toBe("2026-03-02");
    expect(shiftWeek("2026-10-26", 1)).toBe("2026-11-02");
    expect(shiftWeek("2026-11-02", -1)).toBe("2026-10-26");
  });

  it("round-trips", () => {
    expect(shiftWeek(shiftWeek("2026-09-07", 9), -9)).toBe("2026-09-07");
  });
});

describe("weekRange", () => {
  it("runs Mon 00:00 to Sat 00:00 Denver on an ordinary MDT week", () => {
    const { from, to } = weekRange("2026-09-07");
    expect(from.toISOString()).toBe("2026-09-07T06:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-12T06:00:00.000Z");
  });

  it("is MST the week before spring-forward and MDT the week after", () => {
    const before = weekRange("2026-03-02");
    expect(before.from.toISOString()).toBe("2026-03-02T07:00:00.000Z");
    expect(before.to.toISOString()).toBe("2026-03-07T07:00:00.000Z");
    expect(denverZone(before.from)).toBe("MST");
    expect(denverZone(before.to)).toBe("MST");

    const after = weekRange("2026-03-09");
    expect(after.from.toISOString()).toBe("2026-03-09T06:00:00.000Z");
    expect(after.to.toISOString()).toBe("2026-03-14T06:00:00.000Z");
    expect(denverZone(after.from)).toBe("MDT");
    expect(denverZone(after.to)).toBe("MDT");
  });

  it("is MDT the week before fall-back and MST the week after", () => {
    const before = weekRange("2026-10-26");
    expect(before.from.toISOString()).toBe("2026-10-26T06:00:00.000Z");
    expect(before.to.toISOString()).toBe("2026-10-31T06:00:00.000Z");
    expect(denverZone(before.to)).toBe("MDT");

    const after = weekRange("2026-11-02");
    expect(after.from.toISOString()).toBe("2026-11-02T07:00:00.000Z");
    expect(after.to.toISOString()).toBe("2026-11-07T07:00:00.000Z");
    expect(denverZone(after.from)).toBe("MST");
  });

  it("always lands on Denver midnight and spans exactly five days", () => {
    // Mon–Sat never straddles a Sunday transition, so 120h holds for every week.
    for (const key of ["2026-03-02", "2026-03-09", "2026-10-26", "2026-11-02", "2026-09-07"]) {
      const { from, to } = weekRange(key);
      expect(denverHour(from)).toBe(0);
      expect(denverHour(to)).toBe(0);
      expect(denverDayKey(from)).toBe(key);
      expect((to.getTime() - from.getTime()) / HOUR).toBe(120);
    }
  });
});

describe("weekDays", () => {
  it("yields Mon–Fri as Denver-noon instants with matching day keys", () => {
    const days = weekDays("2026-09-07");
    expect(days.map((d) => denverDayKey(d))).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    ]);
    for (const d of days) expect(denverHour(d)).toBe(12);
  });

  it("stays on the right calendar days across both transitions", () => {
    expect(weekDays("2026-03-09").map((d) => denverDayKey(d))).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
    ]);
    expect(weekDays("2026-11-02").map((d) => denverDayKey(d))).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
  });
});

describe("weekLabel", () => {
  it("collapses the month when Mon and Fri share it", () => {
    expect(weekLabel("2026-09-07")).toBe("Sep 7 – 11");
  });

  it("spells both months when the week straddles one", () => {
    expect(weekLabel("2026-09-28")).toBe("Sep 28 – Oct 2");
  });

  it("spells both months across the new year", () => {
    expect(weekLabel("2026-12-28")).toBe("Dec 28 – Jan 1");
  });
});

describe("weekOffset and weekRelation", () => {
  it("counts whole weeks from the current one", () => {
    expect(weekOffset("2026-09-07", WED)).toBe(0);
    expect(weekOffset("2026-09-14", WED)).toBe(1);
    expect(weekOffset("2026-08-31", WED)).toBe(-1);
    expect(weekOffset("2026-08-24", WED)).toBe(-2);
    expect(weekOffset("2026-09-28", WED)).toBe(3);
  });

  it("is a whole number even when a DST hour sits between the weeks", () => {
    const midMarch = new Date("2026-03-11T18:00:00Z");
    expect(weekOffset("2026-03-02", midMarch)).toBe(-1);
    expect(weekOffset("2026-02-23", midMarch)).toBe(-2);
    const earlyNov = new Date("2026-11-04T18:00:00Z");
    expect(weekOffset("2026-10-26", earlyNov)).toBe(-1);
  });

  it("is a Sunday-aware relation: a Sunday still belongs to this week", () => {
    const sunday = new Date("2026-09-13T18:00:00Z");
    expect(weekOffset("2026-09-07", sunday)).toBe(0);
    expect(weekRelation("2026-09-14", sunday)).toBe("next week");
  });

  it("phrases the offset the way a dispatcher would", () => {
    expect(weekRelation("2026-09-07", WED)).toBe("this week");
    expect(weekRelation("2026-09-14", WED)).toBe("next week");
    expect(weekRelation("2026-08-31", WED)).toBe("last week");
    expect(weekRelation("2026-08-24", WED)).toBe("2 weeks ago");
    expect(weekRelation("2026-09-21", WED)).toBe("in 2 weeks");
    expect(weekRelation("2026-06-01", WED)).toBe("14 weeks ago");
  });
});
