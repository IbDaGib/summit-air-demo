/**
 * Summit Air demo seed. `npm run seed`.
 *
 * Idempotent: run it as many times as you like. Techs, customers and holidays are
 * upserted on a stable key; the schedule is swapped wholesale by
 * replace_seed_schedule(), one transaction, so re-seeding never accumulates
 * duplicates, never leaves a half-built schedule behind, and never touches a
 * booking made by a real call (those get ids outside the seed-owned range).
 *
 * What it is for: `find_slots` has to do real work. Roughly 70% of the next five
 * business days is already taken, so the schedule has genuine gaps to find rather
 * than an empty calendar, and `book_appointment` can actually lose a race and hit
 * the EXCLUDE constraint.
 *
 * Every timestamp is written with an explicit Mountain offset resolved from the
 * IANA database (see db/range.ts) — never a bare local string, never a hardcoded
 * -07:00.
 *
 * Deliberately absent: any P0 booking. P0 is the life-safety path; it escalates
 * and never produces an appointment, so a seeded P0 booking would contradict the
 * invariant the rest of the system enforces.
 */
import fs from "node:fs";
import path from "node:path";

import { upsertRows, withClient } from "./neon";
import {
  addDays,
  denverDate,
  denverTimestamp,
  denverWindow,
  isWeekday,
  TIMEZONE,
} from "./range";
import type {
  BookingInsert,
  CountyName,
  CustomerInsert,
  HolidayInsert,
  Json,
  PriorityTier,
  TechInsert,
  TechSkill,
} from "./types";

/* ------------------------------------------------------------------ *
 * Env. tsx does not read .env.local the way `next dev` does.
 * ------------------------------------------------------------------ */

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

function loadEnvFiles(): void {
  const root = repoRoot();
  for (const file of [".env.local", ".env"]) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split("\n")) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const [, key] = m;
      let value = m[2].trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) value = value.slice(1, -1);
      else value = value.replace(/\s+#.*$/, "").trim();
      // Real environment wins over the file, so CI and one-off overrides work.
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

// Before anything reads process.env. getDb() is lazy, so a plain import above is
// safe — the client is not constructed until main() calls it.
loadEnvFiles();

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/**
 * Stable ids so re-seeding updates rows instead of inserting new ones. Written
 * out rather than generated: a seeded tech id showing up in a log should be
 * greppable back to this file.
 */
const techId = (n: number) => `7ec00000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const customerId = (n: number) => `c0570000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bookingId = (n: number) => `b0040000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/**
 * Highest counter the seed will mint. Every id it writes is
 * 'b0040000-0000-4000-8000-<counter>', and replace_seed_schedule owns exactly
 * that namespace — see db/migrations/0002_seed_schedule.sql.
 */
const BOOKING_POOL_SIZE = 200;

interface TechFixture extends TechInsert {
  id: string;
  skills: TechSkill[];
}

/**
 * Six techs. Shifts are staggered so the day has real edges: Marcus opens at
 * 06:30 and Renee — the on-call tech — covers until 19:00, which is what makes a
 * late P1 bookable at all.
 */
const TECHS: TechFixture[] = [
  {
    id: techId(1),
    name: "Marcus Reyes",
    home_county: "Gallatin",
    skills: ["gas", "refrigerant", "commercial_rooftop"],
    shift_start: "06:30",
    shift_end: "15:30",
    on_call: false,
  },
  {
    id: techId(2),
    name: "Priya Raman",
    home_county: "Gallatin",
    skills: ["refrigerant", "mini_split"],
    shift_start: "08:00",
    shift_end: "17:00",
    on_call: false,
  },
  {
    id: techId(3),
    name: "Josh Bittner",
    home_county: "Gallatin",
    skills: ["gas", "mini_split"],
    shift_start: "07:00",
    shift_end: "16:00",
    on_call: false,
  },
  {
    id: techId(4),
    name: "Renee Chandler",
    home_county: "Gallatin",
    skills: ["gas", "refrigerant", "commercial_rooftop", "mini_split"],
    shift_start: "10:00",
    shift_end: "19:00",
    on_call: true,
  },
  {
    id: techId(5),
    name: "Dana Whitcomb",
    home_county: "Park",
    skills: ["gas", "refrigerant"],
    shift_start: "09:00",
    shift_end: "18:00",
    on_call: false,
  },
  {
    id: techId(6),
    name: "Tomas Ortiz",
    home_county: "Madison",
    skills: ["gas", "commercial_rooftop"],
    shift_start: "07:30",
    shift_end: "16:30",
    on_call: false,
  },
];

interface CustomerFixture extends CustomerInsert {
  id: string;
}

/**
 * Fourteen customers across the seven towns we cover. Dave Whitaker's number
 * matches the one in the temporary stub handlers, so a demo call from that
 * number is recognized whichever handler set is wired up.
 */
const CUSTOMERS: CustomerFixture[] = [
  {
    id: customerId(1),
    phone: "+14065550118",
    name: "Dave Whitaker",
    address_line: "412 Cottonwood Road",
    town: "Bozeman",
    county: "Gallatin",
    is_maintenance_member: true,
    access_notes: "Gate code 4412, dog in the yard",
    last_service_at: denverTimestamp("2026-03-14", 9),
  },
  {
    id: customerId(2),
    phone: "+14065550143",
    name: "Marta Delgado",
    address_line: "1180 Durston Road",
    town: "Bozeman",
    county: "Gallatin",
    // The one vulnerable-occupant household: drives P1 on a no-heat call.
    vulnerable_occupant: true,
    access_notes: "Mother, 84, lives with her and uses an oxygen concentrator. Knock loudly.",
    last_service_at: denverTimestamp("2026-05-02", 13),
  },
  {
    id: customerId(3),
    phone: "+14065550127",
    name: "Ken Ostrom",
    address_line: "78 Sourdough Ridge Road",
    town: "Bozeman",
    county: "Gallatin",
    access_notes: "Long driveway, plow berm in winter. Park at the top.",
    last_service_at: denverTimestamp("2025-11-19", 10),
  },
  {
    id: customerId(4),
    phone: "+14065550164",
    name: "Bridger Creek Bakery",
    address_line: "1201 Griffin Drive",
    town: "Bozeman",
    county: "Gallatin",
    access_notes: "Service door on the alley side. Someone is in from 4am.",
    last_service_at: denverTimestamp("2026-06-11", 6),
  },
  {
    id: customerId(5),
    phone: "+14065550172",
    name: "Sierra Bowen",
    address_line: "305 Jackrabbit Lane",
    town: "Belgrade",
    county: "Gallatin",
    last_service_at: denverTimestamp("2026-04-08", 14),
  },
  {
    id: customerId(6),
    phone: "+14065550136",
    name: "Ray Tenney",
    address_line: "2201 Amsterdam Road",
    town: "Belgrade",
    county: "Gallatin",
    access_notes: "Furnace is in the crawlspace, hatch is in the mudroom closet.",
    last_service_at: denverTimestamp("2026-02-27", 11),
  },
  {
    id: customerId(7),
    phone: "+14065550155",
    name: "Nadine Kohl",
    address_line: "66 West Main Street",
    town: "Manhattan",
    county: "Gallatin",
    last_service_at: denverTimestamp("2025-10-30", 9),
  },
  {
    id: customerId(8),
    phone: "+14065550191",
    name: "Ann-Marie Foss",
    address_line: "7 Elk Meadow Road",
    town: "Manhattan",
    county: "Gallatin",
    access_notes: "Cattle gate at the county road — close it behind you.",
  },
  {
    id: customerId(9),
    phone: "+14065550108",
    name: "Bill Ferraro",
    address_line: "1490 Wheatland Road",
    town: "Three Forks",
    county: "Gallatin",
    last_service_at: denverTimestamp("2026-01-22", 15),
  },
  {
    id: customerId(10),
    phone: "+14065550149",
    name: "Hollis Grant",
    address_line: "55 Aspen Grove Loop",
    town: "Big Sky",
    county: "Gallatin",
    access_notes: "Lockbox on the ski locker door, code 0417. Often a rental.",
    last_service_at: denverTimestamp("2026-07-16", 12),
  },
  {
    id: customerId(11),
    phone: "+14065550183",
    name: "Teton Ridge Lodge",
    address_line: "1 Mountain Loop Road",
    town: "Big Sky",
    county: "Gallatin",
    is_maintenance_member: true,
    access_notes: "Check in with the front desk for roof access. Ladder is in maintenance.",
    last_service_at: denverTimestamp("2026-08-04", 8),
  },
  {
    id: customerId(12),
    phone: "+14065550120",
    name: "Elena Marsh",
    address_line: "210 South 5th Street",
    town: "Livingston",
    county: "Park",
    last_service_at: denverTimestamp("2026-03-30", 10),
  },
  {
    id: customerId(13),
    phone: "+14065550176",
    name: "Gus Halvorsen",
    address_line: "903 Yellowstone Avenue",
    town: "Livingston",
    county: "Park",
    access_notes: "Alley entrance, second door. Wind slams it — use the hook.",
    last_service_at: denverTimestamp("2025-12-09", 14),
  },
  {
    id: customerId(14),
    phone: "+14065550161",
    name: "Carla Reese",
    address_line: "12 Madison Avenue",
    town: "Ennis",
    county: "Madison",
    last_service_at: denverTimestamp("2026-05-21", 11),
  },
];

/** Labor Day. No tech is scheduled, and the slot generator skips it. */
const HOLIDAYS: HolidayInsert[] = [{ day: "2026-09-07", label: "Labor Day" }];

interface JobFixture {
  name: string;
  phone: string;
  addressLine: string;
  town: string;
  county: CountyName;
  accessNotes?: string;
}

/**
 * Who is on the existing schedule. Seeded customers plus walk-ins who are not in
 * the customers table — a booking denormalizes the address, so not every job on
 * the board has a customer record behind it, which is also true in real life.
 *
 * Grouped by county because a tech works their own county; there are more jobs
 * per county than a single tech can have windows in a day, so nobody is
 * double-booked with themselves.
 */
const JOBS: Record<CountyName, JobFixture[]> = {
  Gallatin: [
    ...CUSTOMERS.filter((c) => c.county === "Gallatin").map(toJob),
    {
      name: "Wendy Voss",
      phone: "+14065550115",
      addressLine: "88 Kagy Boulevard",
      town: "Bozeman",
      county: "Gallatin",
    },
    {
      name: "Northern Rockies Veterinary",
      phone: "+14065550188",
      addressLine: "5 Baxter Lane",
      town: "Bozeman",
      county: "Gallatin",
      accessNotes: "Mechanical room behind the kennels. Ask before opening doors.",
    },
    {
      name: "Sam Delaney",
      phone: "+14065550132",
      addressLine: "2400 Frontage Road",
      town: "Belgrade",
      county: "Gallatin",
    },
  ],
  Park: [
    ...CUSTOMERS.filter((c) => c.county === "Park").map(toJob),
    {
      name: "Ruth Cavanaugh",
      phone: "+14065550139",
      addressLine: "41 North B Street",
      town: "Livingston",
      county: "Park",
    },
    {
      name: "Paradise Valley Guest Ranch",
      phone: "+14065550194",
      addressLine: "1 Pine Creek Road",
      town: "Livingston",
      county: "Park",
      accessNotes: "Six cabins on one loop — office will point you at the right one.",
    },
  ],
  Madison: [
    ...CUSTOMERS.filter((c) => c.county === "Madison").map(toJob),
    {
      name: "Trout Creek Cabins",
      phone: "+14065550157",
      addressLine: "88 Varney Road",
      town: "Ennis",
      county: "Madison",
    },
    {
      name: "Hal Brennan",
      phone: "+14065550146",
      addressLine: "12 Jack Creek Road",
      town: "Ennis",
      county: "Madison",
    },
    {
      name: "Geyser Gate Motel",
      phone: "+14065550178",
      addressLine: "20 Canyon Street",
      town: "West Yellowstone",
      county: "Madison",
      accessNotes: "Front office has the roof key.",
    },
  ],
};

function toJob(c: CustomerFixture): JobFixture {
  return {
    name: c.name,
    phone: c.phone,
    addressLine: c.address_line,
    town: c.town,
    county: c.county,
    accessNotes: c.access_notes ?? undefined,
  };
}

/**
 * The work already on the board. No firm repair prices anywhere — Summit Air
 * quotes a diagnostic fee and a range, never a number over the phone.
 */
const WORK_ORDERS: Array<{ summary: string; priority: PriorityTier }> = [
  { summary: "Furnace stopped putting out heat overnight; no code on the board.", priority: "P2" },
  { summary: "Annual maintenance — filter change and combustion check.", priority: "P3" },
  { summary: "Heat pump runs constantly and is not keeping up.", priority: "P2" },
  { summary: "Wants the old mercury thermostat swapped for a programmable one.", priority: "P3" },
  { summary: "No heat, house down to 52 degrees, infant at home.", priority: "P1" },
  { summary: "Mini split in the shop blows cold air only.", priority: "P2" },
  { summary: "Quote on replacing a 22-year-old gas furnace.", priority: "P3" },
  { summary: "Rooftop unit short-cycling; sales floor warm by afternoon.", priority: "P2" },
  { summary: "Walk-in cooler climbing; kitchen cannot run.", priority: "P1" },
  { summary: "Seasonal changeover and humidifier startup.", priority: "P3" },
  { summary: "Ignitor clicks, unit locks out after three tries.", priority: "P2" },
  { summary: "Duct noise in the upstairs bedrooms.", priority: "P3" },
  { summary: "Furnace leaking water at the base of the cabinet.", priority: "P2" },
  { summary: "No heat at the ranch house, elderly resident on site.", priority: "P1" },
];

/** Standard arrival windows. Half-open, so 8–10 and 10–12 are not an overlap. */
const WINDOWS: Array<[number, number]> = [
  [8, 10],
  [10, 12],
  [13, 15],
  [15, 17],
];

/** Share of available windows already taken. Leaves real but scarce openings. */
const FILL_RATE = 0.7;

const BUSINESS_DAYS = 5;

/* ------------------------------------------------------------------ *
 * Schedule generation
 * ------------------------------------------------------------------ */

/** Deterministic PRNG so two runs on the same day produce the same schedule. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffled<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hashString(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const hourOf = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h + (m ?? 0) / 60;
};

/** The next N business days in Mountain time, skipping weekends and holidays. */
function businessDays(from: string, count: number): string[] {
  const holidays = new Set(HOLIDAYS.map((h) => h.day));
  const days: string[] = [];
  let day = from;
  for (let guard = 0; days.length < count && guard < 40; guard++) {
    if (isWeekday(day) && !holidays.has(day)) days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

interface Candidate {
  tech: TechFixture;
  day: string;
  startHour: number;
  endHour: number;
}

/** Windows that fit entirely inside a tech's shift and have not already passed. */
function candidatesFor(day: string, now: Date): Candidate[] {
  const out: Candidate[] = [];
  for (const tech of TECHS) {
    const shiftStart = hourOf(tech.shift_start ?? "08:00");
    const shiftEnd = hourOf(tech.shift_end ?? "17:00");
    for (const [startHour, endHour] of WINDOWS) {
      if (startHour < shiftStart || endHour > shiftEnd) continue;
      // Today's already-started windows are not bookable, so do not fill them.
      if (new Date(denverTimestamp(day, startHour)).getTime() <= now.getTime()) continue;
      out.push({ tech, day, startHour, endHour });
    }
  }
  return out;
}

function buildBookings(now: Date): { rows: BookingInsert[]; fill: string[] } {
  const rows: BookingInsert[] = [];
  const fill: string[] = [];
  const cursor: Record<CountyName, number> = { Gallatin: 0, Park: 0, Madison: 0 };
  let workOrder = 0;

  // Ask for extra days and drop any with nothing left to book: seeding late in the
  // afternoon should still fill five days, not four and a stub.
  const days = businessDays(denverDate(now), BUSINESS_DAYS + 3)
    .map((day) => ({ day, candidates: candidatesFor(day, now) }))
    .filter((d) => d.candidates.length > 0)
    .slice(0, BUSINESS_DAYS);

  for (const { day, candidates } of days) {
    const takeCount = Math.round(candidates.length * FILL_RATE);
    // Shuffle, take 70%, then restore chronological order — the gaps end up
    // scattered across techs and hours instead of all at the end of the day.
    const taken = shuffled(candidates, day)
      .slice(0, takeCount)
      .sort((a, b) => a.tech.name.localeCompare(b.tech.name) || a.startHour - b.startHour);

    for (const c of taken) {
      const county = c.tech.home_county;
      const pool = JOBS[county];
      const job = pool[cursor[county]++ % pool.length];
      const work = WORK_ORDERS[workOrder++ % WORK_ORDERS.length];
      rows.push({
        id: bookingId(rows.length + 1),
        tech_id: c.tech.id,
        customer_name: job.name,
        phone: job.phone,
        address_line: job.addressLine,
        town: job.town,
        county: job.county,
        arrival_window: denverWindow(c.day, c.startHour, c.endHour),
        priority: work.priority,
        issue_summary: work.summary,
        access_notes: job.accessNotes ?? null,
        status: "confirmed",
      });
    }
    fill.push(`${day}  ${taken.length}/${candidates.length} windows taken`);
  }

  // One cancelled booking sitting on top of a confirmed one. It is not a bug:
  // the EXCLUDE constraint is filtered on `status <> 'cancelled'`, so this row
  // proves a cancellation frees the window without erasing the history.
  const first = rows[0];
  if (first) {
    rows.push({
      ...first,
      id: bookingId(BOOKING_POOL_SIZE),
      customer_name: "Priscilla Nagy",
      phone: "+14065550199",
      issue_summary: "Cancelled by the customer — rebooked with the manufacturer's installer.",
      access_notes: null,
      status: "cancelled",
    });
  }

  return { rows, fill };
}

/* ------------------------------------------------------------------ *
 * Write
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const now = new Date();

  console.log(`Seeding ${process.env.NEXT_PUBLIC_SUPABASE_URL} (times in ${TIMEZONE})`);

  await upsertRows("holidays", HOLIDAYS as unknown as Record<string, unknown>[], "day");
  console.log(`  holidays   ${HOLIDAYS.length}`);

  await upsertRows("techs", TECHS as unknown as Record<string, unknown>[], "id");
  console.log(`  techs      ${TECHS.length} (${TECHS.filter((t) => t.on_call).length} on call)`);

  // PostgREST rejects a bulk insert whose objects do not all carry the same keys,
  // so the optional columns are spelled out here rather than left to defaults.
  const customerRows: CustomerInsert[] = CUSTOMERS.map((c) => ({
    id: c.id,
    phone: c.phone,
    name: c.name,
    address_line: c.address_line,
    town: c.town,
    county: c.county,
    is_maintenance_member: c.is_maintenance_member ?? false,
    vulnerable_occupant: c.vulnerable_occupant ?? false,
    access_notes: c.access_notes ?? null,
    last_service_at: c.last_service_at ?? null,
  }));
  await upsertRows("customers", customerRows as unknown as Record<string, unknown>[], "id");
  console.log(`  customers  ${customerRows.length}`);

  // The schedule is replaced in ONE transaction, inside the database.
  //
  // This used to be a delete of the seeded id range followed by a separate
  // insert. PostgREST gives one transaction per request, so a crash between the
  // two left the demo schedule empty or half-rebuilt — destructive despite the
  // seed being idempotent. An upsert-then-prune fixes the destructiveness but
  // not the correctness: booking ids are positional, so tomorrow's run maps the
  // same tech and window to a different id, collides with yesterday's row, skips
  // it, and then prunes the row it collided with — leaving a hole.
  //
  // replace_seed_schedule (db/migrations/0002_seed_schedule.sql) does the delete
  // and every insert in one transaction. Kill the process at any point and the
  // previous schedule is still there, whole.
  const { rows, fill } = buildBookings(now);
  const replaced = await withClient(async (c) => {
    try {
      const r = await c.query<{ written: number; skipped: number; pruned: number }>(
        "select * from replace_seed_schedule($1::jsonb)",
        [JSON.stringify(rows)],
      );
      return r.rows[0];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/function replace_seed_schedule.* does not exist/i.test(msg)) {
        throw new Error(
          "replace_seed_schedule is missing — run `npx tsx --env-file=.env.local " +
            "scripts/apply-migrations.mts`. Nothing was changed.",
        );
      }
      throw new Error(`bookings: ${msg}`);
    }
  });

  const { written, skipped, pruned } = replaced;
  console.log(
    `  bookings   ${written} written` +
      `${skipped ? `, ${skipped} skipped (window held by a real booking)` : ""}` +
      `${pruned ? `, ${pruned} replaced` : ""}`,
  );
  for (const line of fill) console.log(`             ${line}`);
  console.log("Seed complete.");
}

main().catch((err: unknown) => {
  console.error(`Seed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
