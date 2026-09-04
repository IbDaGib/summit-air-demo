import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RampLegend } from "../_ui/priority";

/**
 * Shown while a week's bookings load. Same padding, same header row, same
 * table geometry as page.tsx, so the real grid lands on top of it without a
 * jump. The pieces that are static — the title, the legend — are the real
 * thing; only the data is a skeleton.
 */

const DAYS = 5;
/** The roster is six technicians; matching it keeps the card the same height. */
const ROWS = 6;

export default function ScheduleLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6" role="status" aria-busy>
      <span className="sr-only">Loading the schedule</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-hidden>
        <h1 className="text-base font-semibold tracking-tight">Schedule</h1>
        {/* ← Today → footprint: two icon-sm squares and one sm button. */}
        <div className="flex items-center gap-1">
          <Skeleton className="size-7 rounded-[min(var(--radius-md),12px)]" />
          <Skeleton className="h-7 w-14 rounded-[min(var(--radius-md),12px)]" />
          <Skeleton className="size-7 rounded-[min(var(--radius-md),12px)]" />
        </div>
        <Skeleton className="h-4 w-80" />
        <Skeleton className="ml-auto h-3 w-96" />
      </div>

      <Card className="gap-0 overflow-hidden py-0" aria-hidden>
        <Table className="min-w-[64rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent [&_th]:h-8 [&_th]:px-3">
              <TableHead className="sticky left-0 z-10 w-40 bg-card pl-4 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Tech
              </TableHead>
              {Array.from({ length: DAYS }, (_, i) => (
                <TableHead key={i} className="border-l">
                  <Skeleton className="h-3 w-16" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:align-top">
            {Array.from({ length: ROWS }, (_, r) => (
              <TableRow key={r} className="hover:bg-transparent">
                <TableCell className="sticky left-0 z-10 bg-card py-2 pl-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-1.5 h-3 w-28" />
                </TableCell>
                {Array.from({ length: DAYS }, (_, d) => (
                  <TableCell key={d} className="border-l p-1.5">
                    {/* The footprint of the "open" marker an empty cell shows. */}
                    <Skeleton className="mx-1.5 my-2 h-3 w-8 opacity-60" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="mt-auto border-t pt-3">
        <RampLegend />
      </div>
    </div>
  );
}
