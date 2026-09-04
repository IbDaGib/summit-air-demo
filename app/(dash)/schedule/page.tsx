import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-base font-semibold tracking-tight">Schedule</h1>
        <span className="text-sm text-muted-foreground tabular-nums">
          Next {DAYS} days · {techs.length} technicians · all times America/Denver
        </span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {bookings.length} booked windows. A technician cannot hold two overlapping windows —
          Postgres rejects it.
        </span>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <Table className="min-w-[64rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent [&_th]:h-8 [&_th]:px-3 [&_th]:text-[11px] [&_th]:font-medium [&_th]:tracking-wide [&_th]:uppercase">
              <TableHead className="sticky left-0 z-10 w-40 bg-card pl-4 text-muted-foreground">
                Tech
              </TableHead>
              {days.map((d, i) => {
                const today = dayKeys[i] === todayKey;
                return (
                  <TableHead
                    key={dayKeys[i]}
                    className={cn("border-l", today ? "text-foreground" : "text-muted-foreground")}
                  >
                    {denverWeekday(d.toISOString())}
                    <span className="ml-1.5 font-normal text-muted-foreground/70">
                      {denverMonthDay(d.toISOString())}
                    </span>
                    {today ? (
                      <Badge
                        variant="secondary"
                        className="ml-2 h-4 px-1.5 text-[10px] font-medium tracking-normal normal-case"
                      >
                        today
                      </Badge>
                    ) : null}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:align-top">
            {techs.map((tech) => (
              <TableRow key={tech.id} className="hover:bg-transparent">
                <TechCell tech={tech} />
                {dayKeys.map((key) => (
                  <TableCell
                    key={key}
                    className={cn(
                      "border-l p-1.5 whitespace-normal",
                      key === todayKey && "bg-muted/25",
                    )}
                  >
                    <DayCell bookings={byTechDay.get(tech.id)?.get(key) ?? []} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {techs.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={DAYS + 1}
                  className="py-16 text-center text-sm whitespace-normal text-muted-foreground"
                >
                  No technicians on the roster, so there is nothing to schedule against.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>

      <div className="mt-auto border-t pt-3">
        <RampLegend />
      </div>
    </div>
  );
}

function TechCell({ tech }: { tech: Tech }) {
  return (
    <TableCell className="sticky left-0 z-10 bg-card py-2 pl-4 whitespace-nowrap">
      <div className="flex items-center gap-2">
        <span className="text-sm">{tech.name}</span>
        {tech.onCall ? (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            on call
          </Badge>
        ) : null}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
        {tech.homeCounty} · {tech.shiftStart}–{tech.shiftEnd}
      </div>
    </TableCell>
  );
}

function DayCell({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return <div className="px-1.5 py-2 text-[11px] text-muted-foreground/50">open</div>;
  }
  return (
    <div className="flex flex-col gap-1">
      {bookings.map((b) => (
        <BookingBlock key={b.id} booking={b} />
      ))}
    </div>
  );
}

/**
 * One arrival window. The block carries what fits — window, tier, name, town —
 * and the tooltip carries the rest: who it is and what they reported, which is
 * what a dispatcher wants before calling the tech.
 */
function BookingBlock({ booking }: { booking: Booking }) {
  const r = ramp(booking.priority);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className={cn(
            "relative cursor-default overflow-hidden rounded-md border py-1 pr-2 pl-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            r.panel,
          )}
        >
          <span className={`absolute inset-y-0 left-0 w-[3px] ${r.rail}`} aria-hidden />
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[11px] font-semibold tabular-nums">
              {arrivalWindow(booking.startsAt, booking.endsAt)}
            </span>
            {/* Same ramp classes as PriorityChip, so the tier reads identically here and on the call list. */}
            <Badge
              title={r.label}
              className={cn("h-4 rounded px-1 font-mono text-[10px] font-semibold tabular-nums", r.chip)}
            >
              {booking.priority}
            </Badge>
          </div>
          <div className="truncate text-[11px]">{booking.customerName}</div>
          <div className="truncate text-[11px] text-muted-foreground">{booking.town}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="items-start">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{booking.customerName}</span>
          <span className="text-background/70">{booking.issueSummary}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
