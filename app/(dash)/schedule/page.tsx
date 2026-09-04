import { listBookings, listTechs } from "../_data/client";
import type { Booking, Tech } from "../_data/types";
import { ramp, RampLegend } from "../_ui/priority";
import {
  arrivalWindow,
  denverDayKey,
  denverInstant,
  denverMonthDay,
  denverWeekday,
} from "../_ui/time";

export const dynamic = "force-dynamic";

const DAYS = 5;

export default async function SchedulePage() {
  const now = new Date();
  // Day 0 is today in Denver; the window runs to the end of day 4.
  const from = denverInstant(0, 0, now);
  const to = denverInstant(DAYS, 0, now);

  const [techs, bookings] = await Promise.all([
    listTechs(),
    listBookings({ from: from.toISOString(), to: to.toISOString() }),
  ]);

  const days = Array.from({ length: DAYS }, (_, i) => denverInstant(i, 12, now));
  const dayKeys = days.map((d) => denverDayKey(d));
  const todayKey = denverDayKey(now);

  // techId -> dayKey -> bookings, already sorted by start time upstream.
  const byTechDay = new Map<string, Map<string, Booking[]>>();
  for (const b of bookings) {
    const day = denverDayKey(b.startsAt);
    const forTech = byTechDay.get(b.techId) ?? new Map<string, Booking[]>();
    forTech.set(day, [...(forTech.get(day) ?? []), b]);
    byTechDay.set(b.techId, forTech);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4 pb-3">
        <h1 className="text-sm font-semibold tracking-tight text-zinc-200">Schedule</h1>
        <span className="text-xs text-zinc-500">
          Next {DAYS} days · {techs.length} technicians · all times America/Denver
        </span>
        <span className="ml-auto text-xs text-zinc-600">
          {bookings.length} booked windows. A technician cannot hold two overlapping
          windows — Postgres rejects it.
        </span>
      </div>

      <div className="overflow-x-auto px-5 pb-4">
        <table className="w-full min-w-[64rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-40 border-b border-zinc-800 bg-zinc-950 px-3 pb-2 text-left text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
                Tech
              </th>
              {days.map((d, i) => (
                <th
                  key={dayKeys[i]}
                  className={`border-b border-l border-zinc-800 px-3 pb-2 text-left text-[11px] font-medium tracking-wide uppercase ${
                    dayKeys[i] === todayKey ? "text-sky-300" : "text-zinc-500"
                  }`}
                >
                  {denverWeekday(d.toISOString())}
                  <span className="ml-1.5 font-normal text-zinc-600">
                    {denverMonthDay(d.toISOString())}
                  </span>
                  {dayKeys[i] === todayKey ? (
                    <span className="ml-1.5 font-normal text-sky-400/80">today</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {techs.map((tech) => (
              <tr key={tech.id} className="align-top">
                <TechCell tech={tech} />
                {dayKeys.map((key) => (
                  <td
                    key={key}
                    className={`border-b border-l border-zinc-900 p-1.5 ${
                      key === todayKey ? "bg-sky-500/[0.03]" : ""
                    }`}
                  >
                    <DayCell bookings={byTechDay.get(tech.id)?.get(key) ?? []} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-auto border-t border-zinc-900 px-5 py-3">
        <RampLegend />
      </div>
    </div>
  );
}

function TechCell({ tech }: { tech: Tech }) {
  return (
    <td className="sticky left-0 z-10 border-b border-zinc-900 bg-zinc-950 px-3 py-2 whitespace-nowrap">
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-200">{tech.name}</span>
        {tech.onCall ? (
          <span className="rounded bg-amber-400/15 px-1.5 text-[10px] font-medium text-amber-200 ring-1 ring-inset ring-amber-400/40">
            on call
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 text-[11px] text-zinc-600">
        {tech.homeCounty} · {tech.shiftStart}–{tech.shiftEnd}
      </div>
    </td>
  );
}

function DayCell({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return <div className="px-1.5 py-2 text-[11px] text-zinc-700">open</div>;
  }
  return (
    <div className="flex flex-col gap-1">
      {bookings.map((b) => (
        <BookingBlock key={b.id} booking={b} />
      ))}
    </div>
  );
}

function BookingBlock({ booking }: { booking: Booking }) {
  const r = ramp(booking.priority);
  return (
    <div
      className={`relative overflow-hidden rounded border py-1 pr-2 pl-2.5 ${r.panel}`}
      title={booking.issueSummary}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${r.rail}`} aria-hidden />
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] font-semibold tabular-nums text-zinc-100">
          {arrivalWindow(booking.startsAt, booking.endsAt)}
        </span>
        <span className="font-mono text-[10px] text-zinc-500">{booking.priority}</span>
      </div>
      <div className="truncate text-[11px] text-zinc-300">{booking.customerName}</div>
      <div className="truncate text-[11px] text-zinc-500">{booking.town}</div>
    </div>
  );
}
