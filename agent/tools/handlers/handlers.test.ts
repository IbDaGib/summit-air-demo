import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHandlers } from "./index";
import { createInMemoryRepository } from "./memoryRepository";
import type { DispatchRepository } from "./repository";
import type { ToolHandlers } from "../schemas";
import { decodeSlotId, encodeSlotId } from "./scheduling";

/** Thursday 3 September 2026, 09:00 in Montana. */
const NOW = new Date("2026-09-03T15:00:00Z");
const deps = (repo: DispatchRepository) => ({ repo, now: () => NOW });

type BookArgs = Parameters<ToolHandlers["book_appointment"]>[0];

const build = (over: Partial<BookArgs> & { slotId: string }): BookArgs => ({
  customerName: "Dave Whitaker",
  phone: "+14065550118",
  addressLine: "412 Cottonwood Road",
  town: "Bozeman",
  issueSummary: "Furnace stopped producing heat overnight",
  ...over,
});

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("lookup_customer", () => {
  it("matches on the last ten digits regardless of formatting", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    for (const phone of ["+14065550118", "406-555-0118", "(406) 555 0118"]) {
      expect((await h.lookup_customer({ phone }))?.name).toBe("Dave Whitaker");
    }
  });

  it("returns null for an unknown number", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    expect(await h.lookup_customer({ phone: "+14065559999" })).toBeNull();
  });

  it("degrades to full intake instead of throwing when the lookup fails", async () => {
    const repo = createInMemoryRepository();
    repo.findCustomerByPhone = async () => {
      throw new Error("connection refused");
    };
    const h = createHandlers(deps(repo));
    await expect(h.lookup_customer({ phone: "+14065550118" })).resolves.toBeNull();
  });
});

describe("check_service_area", () => {
  it("covers a town and returns its canonical spelling", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    expect(await h.check_service_area({ town: "boseman" })).toMatchObject({
      covered: true,
      town: "Bozeman",
      county: "Gallatin",
    });
  });

  it("declines an out-of-area town with something the agent can say", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const r = await h.check_service_area({ town: "Butte" });
    expect(r.covered).toBe(false);
    expect(r.message).toMatch(/Gallatin, Park and Madison/);
  });
});

describe("assess_situation", () => {
  it("returns the computed tier, not anything the model asked for", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const r = await h.assess_situation({
      propertyType: "residential",
      issue: "no_heat",
      systemDown: true,
      hazard: "none",
      vulnerableOccupant: true,
      occupantDetail: "grandmother, 84",
      town: "Bozeman",
    });
    expect(r.tier).toBe("P1");
    expect(r.blockBooking).toBe(false);
  });

  it("blocks booking on a hazard", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const r = await h.assess_situation({
      propertyType: "residential",
      issue: "noise_or_smell",
      systemDown: false,
      hazard: "gas_smell",
      vulnerableOccupant: false,
    });
    expect(r.tier).toBe("P0");
    expect(r.blockBooking).toBe(true);
  });

  it("fills the outdoor temperature from the demo override when the runtime has none", async () => {
    vi.stubEnv("DEMO_FORCE_OUTDOOR_TEMP_F", "8");
    const h = createHandlers(deps(createInMemoryRepository()));
    const r = await h.assess_situation({
      propertyType: "residential",
      issue: "no_heat",
      systemDown: true,
      hazard: "none",
      vulnerableOccupant: false,
      town: "Bozeman",
    });
    expect(r.tier).toBe("P1");
    expect(r.reason).toMatch(/8°F/);
    vi.unstubAllEnvs();
  });
});

describe("escalate_emergency", () => {
  it("returns spoken instructions and an incident id", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const r = await h.escalate_emergency({ hazard: "gas_smell", town: "Bozeman" });
    expect(r.instructions).toMatch(/get everyone out/i);
    expect(r.instructions).toMatch(/nine one one/);
    expect(r.incidentId).toBeTruthy();
  });

  it("still reads the instructions when the incident cannot be recorded", async () => {
    const repo = createInMemoryRepository();
    repo.recordSafetyIncident = async () => {
      throw new Error("database unreachable");
    };
    const h = createHandlers(deps(repo));
    const r = await h.escalate_emergency({ hazard: "co_alarm" });
    expect(r.instructions).toMatch(/fresh air/i);
    expect(r.incidentId).toMatch(/^incident-local-/);
  });

  it("has a distinct script per hazard", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const scripts = await Promise.all(
      (["gas_smell", "co_alarm", "smoke_or_burning"] as const).map((hazard) =>
        h.escalate_emergency({ hazard }).then((r) => r.instructions),
      ),
    );
    expect(new Set(scripts).size).toBe(3);
  });
});

describe("find_slots", () => {
  it("returns windows a person can say out loud", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const { slots } = await h.find_slots({ town: "Bozeman", priority: "P2" });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].spoken).toMatch(/between \d{1,2} and \d{1,2} in the (morning|afternoon)/);
    expect(new Date(slots[0].startsAt).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("respects a morning preference", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const { slots } = await h.find_slots({
      town: "Bozeman",
      priority: "P3",
      preferredTimeOfDay: "morning",
    });
    for (const slot of slots) expect(slot.spoken).toMatch(/in the morning/);
  });

  it("never offers Labor Day, when nobody works", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const { slots } = await h.find_slots({ town: "Bozeman", priority: "P3" });
    for (const slot of slots) expect(slot.startsAt.slice(0, 10)).not.toBe("2026-09-07");
  });

  it("refuses to shop for windows on a P0 call", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const r = await h.find_slots({ town: "Bozeman", priority: "P0" });
    expect(r.slots).toEqual([]);
    expect(r.message).toMatch(/escalate_emergency/);
  });

  it("declines out of area rather than inventing a window", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const r = await h.find_slots({ town: "Butte", priority: "P2" });
    expect(r.slots).toEqual([]);
    expect(r.message).toMatch(/outside the service area/i);
  });

  it("tells the agent to take a callback when the schedule is unreachable", async () => {
    const repo = createInMemoryRepository();
    repo.listTechs = async () => {
      throw new Error("connection refused");
    };
    const h = createHandlers(deps(repo));
    const r = await h.find_slots({ town: "Bozeman", priority: "P1" });
    expect(r.slots).toEqual([]);
    expect(r.message).toMatch(/save_callback_request/);
  });

  it("gives P1 same-day windows that P3 does not get", async () => {
    const h = createHandlers(deps(createInMemoryRepository({ preBooked: false })));
    const urgent = await h.find_slots({ town: "Bozeman", priority: "P1" });
    const routine = await h.find_slots({ town: "Bozeman", priority: "P3" });
    expect(urgent.slots[0].spoken).toMatch(/^today/);
    expect(routine.slots[0].spoken).not.toMatch(/^today/);
  });
});

describe("book_appointment", () => {
  const firstSlot = async (repo: DispatchRepository) => {
    const h = createHandlers(deps(repo));
    const { slots } = await h.find_slots({ town: "Bozeman", priority: "P2" });
    return slots[0];
  };

  it("confirms a booking and reads the window back", async () => {
    const repo = createInMemoryRepository();
    const slot = await firstSlot(repo);
    const h = createHandlers(deps(repo));
    const r = await h.book_appointment(build({ slotId: slot.slotId }));
    expect(r.status).toBe("confirmed");
    expect(r.bookingId).toBeTruthy();
    expect(r.spoken).toContain("412 Cottonwood Road");
  });

  it("returns a conflict with alternatives instead of throwing when the slot is taken", async () => {
    const repo = createInMemoryRepository();
    const slot = await firstSlot(repo);
    const h = createHandlers(deps(repo));
    await h.book_appointment(build({ slotId: slot.slotId }));

    const second = await h.book_appointment(
      build({ slotId: slot.slotId, customerName: "Someone Else", phone: "+14065550142" }),
    );
    expect(second.status).toBe("conflict");
    expect(second.alternatives?.length).toBeGreaterThan(0);
    expect(second.alternatives?.map((a) => a.slotId)).not.toContain(slot.slotId);
    expect(second.spoken).toMatch(/just went/);
  });

  it("surfaces a raw 23P01 rejection as a conflict, never as a throw", async () => {
    const repo = createInMemoryRepository();
    const slot = await firstSlot(repo);
    repo.createBooking = async () => {
      const error = new Error(
        'conflicting key value violates exclusion constraint "bookings_no_overlap"',
      ) as Error & { code: string };
      error.code = "23P01";
      throw error;
    };
    const h = createHandlers(deps(repo));
    const r = await h.book_appointment(build({ slotId: slot.slotId }));
    // The repository is the layer that maps 23P01; a repository that throws it
    // anyway must still not reach the caller as an exception.
    expect(["conflict", "error"]).toContain(r.status);
  });

  it("refuses to book a call that describes a hazard", async () => {
    const repo = createInMemoryRepository();
    const slot = await firstSlot(repo);
    const h = createHandlers(deps(repo));
    const r = await h.book_appointment(
      build({ slotId: slot.slotId, issueSummary: "No heat, and there's a gas smell in the basement" }),
    );
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/escalate_emergency/);
  });

  it("refuses a P0 slot id — an escalated call never ends in a booking", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const forged = encodeSlotId({
      techId: "tech-marcus",
      startsAt: new Date("2026-09-04T14:00:00Z"),
      endsAt: new Date("2026-09-04T16:00:00Z"),
      priority: "P0",
    });
    const r = await h.book_appointment(build({ slotId: forged }));
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/escalate_emergency/);
  });

  it("refuses an out-of-area town", async () =>{
    const repo = createInMemoryRepository();
    const slot = await firstSlot(repo);
    const h = createHandlers(deps(repo));
    const r = await h.book_appointment(build({ slotId: slot.slotId, town: "Butte" }));
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/outside the service area/i);
  });

  it("rejects a slot id it did not issue", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const r = await h.book_appointment(build({ slotId: "tomorrow-at-eight" }));
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/find_slots/);
  });

  it("carries the priority from find_slots through to the booking", async () => {
    const repo = createInMemoryRepository();
    const h = createHandlers(deps(repo));
    const { slots } = await h.find_slots({ town: "Bozeman", priority: "P1" });
    const written: string[] = [];
    repo.createBooking = async (b) => {
      written.push(b.priority);
      return { status: "confirmed", bookingId: "x" };
    };
    await h.book_appointment(build({ slotId: slots[0].slotId }));
    expect(written).toEqual(["P1"]);
    expect(decodeSlotId(slots[0].slotId)?.priority).toBe("P1");
  });

  it("never confirms when the write fails", async () => {
    const repo = createInMemoryRepository();
    const slot = await firstSlot(repo);
    repo.createBooking = async () => ({ status: "error", message: "deadlock detected" });
    const h = createHandlers(deps(repo));
    const r = await h.book_appointment(build({ slotId: slot.slotId }));
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/save_callback_request/);
  });
});

describe("save_callback_request", () => {
  it("saves and returns an id", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    const r = await h.save_callback_request({ phone: "+14065550118", reason: "out of area" });
    expect(r).toMatchObject({ status: "saved" });
  });

  it("retries, then captures the lead in the log rather than losing it", async () => {
    const repo = createInMemoryRepository();
    let attempts = 0;
    repo.createCallbackRequest = async () => {
      attempts++;
      throw new Error("write failed");
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const h = createHandlers(deps(repo));
    const r = await h.save_callback_request({ phone: "+14065550118", reason: "tool failure" });
    expect(attempts).toBe(2);
    expect(r.status).toBe("saved");
    expect(errors.mock.calls.flat().join(" ")).toContain("callback_request_log_only");
  });
});

describe("record_call_outcome", () => {
  it("acknowledges every outcome", async () => {
    const h = createHandlers(deps(createInMemoryRepository()));
    for (const outcome of ["booked", "escalated", "callback", "no_action"] as const) {
      expect(await h.record_call_outcome({ outcome })).toEqual({ ok: true });
    }
  });
});
