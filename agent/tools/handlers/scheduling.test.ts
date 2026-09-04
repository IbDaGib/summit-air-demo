import { describe, expect, it } from "vitest";
import type { BusyWindow, Tech } from "./repository";
import { buildSlots, decodeSlotId, encodeSlotId, horizonFor } from "./scheduling";
import { spokenWindow, zonedTimeToInstant } from "./time";

/** Thursday 3 September 2026, 09:00 Montana (MDT, UTC-6). */
const NOW = new Date("2026-09-03T15:00:00Z");

const tech = (over: Partial<Tech> = {}): Tech => ({
  id: "tech-marcus",
  name: "Marcus",
  county: "Gallatin",
  skills: [],
  shiftStartHour: 8,
  shiftEndHour: 17,
  onCall: false,
  ...over,
});

const build = (over: Partial<Parameters<typeof buildSlots>[0]> = {}) =>
  buildSlots({
    techs: [tech()],
    busy: [],
    holidays: new Set<string>(),
    priority: "P2",
    now: NOW,
    ...over,
  });

describe("buildSlots", () => {
  it("never offers a window that has already started", () => {
    for (const slot of build({ priority: "P1" })) {
      expect(new Date(slot.startsAt).getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it("leaves at least an hour of lead time", () => {
    const atSeven = new Date("2026-09-03T13:30:00Z"); // 07:30 Montana
    const first = build({ priority: "P1", now: atSeven })[0];
    expect(new Date(first.startsAt).getTime() - atSeven.getTime()).toBeGreaterThanOrEqual(
      60 * 60 * 1000,
    );
  });

  it("skips a holiday entirely", () => {
    const slots = build({ priority: "P3", holidays: new Set(["2026-09-07"]), limit: 20 });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) expect(slot.startsAt.slice(0, 10)).not.toBe("2026-09-07");
  });

  it("keeps routine work off the weekend but lets urgent work onto it", () => {
    const friday = new Date("2026-09-04T15:00:00Z");
    const routine = build({ priority: "P3", now: friday, limit: 20 });
    for (const slot of routine) {
      expect(new Date(slot.startsAt).getUTCDay()).not.toBe(0);
      expect(new Date(slot.startsAt).getUTCDay()).not.toBe(6);
    }
    const urgent = build({ priority: "P1", now: friday, limit: 20 });
    expect(urgent.some((s) => [0, 6].includes(new Date(s.startsAt).getUTCDay()))).toBe(true);
  });

  it("does not offer a window outside the tech's shift", () => {
    const slots = build({ techs: [tech({ shiftStartHour: 8, shiftEndHour: 12 })], limit: 20 });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) expect(slot.spoken).toMatch(/in the morning/);
  });

  it("does not offer a window the tech is already committed to", () => {
    const day = { year: 2026, month: 9, day: 4 };
    const busy: BusyWindow[] = [
      { techId: "tech-marcus", startsAt: zonedTimeToInstant(day, 8), endsAt: zonedTimeToInstant(day, 10) },
    ];
    const slots = build({ busy, limit: 20 });
    expect(slots.some((s) => s.startsAt === zonedTimeToInstant(day, 8).toISOString())).toBe(false);
  });

  it("offers a window to the second tech when the first is busy", () => {
    const day = { year: 2026, month: 9, day: 4 };
    const busy: BusyWindow[] = [
      { techId: "tech-marcus", startsAt: zonedTimeToInstant(day, 8), endsAt: zonedTimeToInstant(day, 10) },
    ];
    const slots = build({ techs: [tech(), tech({ id: "tech-priya", name: "Priya" })], busy });
    const eight = slots.find((s) => s.startsAt === zonedTimeToInstant(day, 8).toISOString());
    expect(eight?.techId).toBe("tech-priya");
  });

  it("returns nothing rather than guessing when there are no techs in the county", () => {
    expect(build({ techs: [] })).toEqual([]);
  });

  it("honours an earliestDate later than the tier's own start", () => {
    const slots = build({ priority: "P3", earliestDate: "2026-09-10" });
    expect(slots[0].startsAt.slice(0, 10) >= "2026-09-10").toBe(true);
  });

  it("ignores an earliestDate in the past instead of offering yesterday", () => {
    const slots = build({ priority: "P2", earliestDate: "2026-08-01" });
    expect(new Date(slots[0].startsAt).getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("horizonFor", () => {
  it("searches from today for urgent work and from tomorrow for routine", () => {
    expect(horizonFor("P1").startOffset).toBe(0);
    expect(horizonFor("P3").startOffset).toBe(1);
    expect(horizonFor("P1").includeWeekends).toBe(true);
    expect(horizonFor("P3").includeWeekends).toBe(false);
  });
});

describe("slot ids", () => {
  it("round-trips the tech, window and tier", () => {
    const slot = {
      techId: "tech-marcus",
      startsAt: new Date("2026-09-04T14:00:00Z"),
      endsAt: new Date("2026-09-04T16:00:00Z"),
      priority: "P1" as const,
    };
    expect(decodeSlotId(encodeSlotId(slot))).toEqual(slot);
  });

  it.each(["", "tomorrow-at-eight", "a|b|c", "tech|not-a-date|also-not|P1", "tech|2026-09-04T14:00:00Z|2026-09-04T16:00:00Z|P9"])(
    "rejects the malformed id %j",
    (id) => {
      expect(decodeSlotId(id)).toBeNull();
    },
  );

  it("rejects a window that ends before it starts", () => {
    expect(decodeSlotId("tech|2026-09-04T16:00:00Z|2026-09-04T14:00:00Z|P2")).toBeNull();
  });
});

describe("spokenWindow", () => {
  it("says today, tomorrow, then the weekday", () => {
    const day = { year: 2026, month: 9, day: 3 };
    expect(spokenWindow(zonedTimeToInstant(day, 13), zonedTimeToInstant(day, 15), NOW)).toBe(
      "today between 1 and 3 in the afternoon",
    );
    const tomorrow = { year: 2026, month: 9, day: 4 };
    expect(
      spokenWindow(zonedTimeToInstant(tomorrow, 8), zonedTimeToInstant(tomorrow, 10), NOW),
    ).toBe("tomorrow between 8 and 10 in the morning");
    const later = { year: 2026, month: 9, day: 9 };
    expect(spokenWindow(zonedTimeToInstant(later, 15), zonedTimeToInstant(later, 17), NOW)).toBe(
      "Wednesday between 3 and 5 in the afternoon",
    );
  });

  it("renders Montana time, not UTC, across the DST boundary", () => {
    // 08:00 Montana is 14:00 UTC in November (MST) and 14:00 UTC in September
    // would be 08:00 MDT — the offsets differ, the spoken hour must not.
    const november = { year: 2026, month: 11, day: 10 };
    const start = zonedTimeToInstant(november, 8);
    expect(start.toISOString()).toBe("2026-11-10T15:00:00.000Z"); // MST, UTC-7
    expect(spokenWindow(start, zonedTimeToInstant(november, 10), start)).toBe(
      "today between 8 and 10 in the morning",
    );

    const september = { year: 2026, month: 9, day: 10 };
    expect(zonedTimeToInstant(september, 8).toISOString()).toBe("2026-09-10T14:00:00.000Z"); // MDT, UTC-6
  });
});
