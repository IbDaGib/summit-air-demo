/**
 * Calls the agent could not close. This is the list dispatch works top to
 * bottom at 7am; the caller receives the sorted output of ./sort.ts.
 */
import Link from "next/link";
import type { FollowupItem } from "../_data/metrics";
import type { Priority } from "../_data/types";
import { PriorityChip, ramp } from "../_ui/priority";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Dash, Empty, HeadRow, Panel, Th, When } from "./cells";

const TIERS: ReadonlySet<string> = new Set<Priority>(["P0", "P1", "P2", "P3"]);

/** metrics.ts hands back the enum as text; only the four real tiers light the ramp. */
const asPriority = (p: string | null): Priority | null =>
  p !== null && TIERS.has(p) ? (p as Priority) : null;

export function Followups({ items, now }: { items: FollowupItem[]; now: Date }) {
  if (items.length === 0) {
    return (
      <Panel>
        <Empty>Nothing waiting on a person.</Empty>
      </Panel>
    );
  }

  return (
    <Panel>
      <Table>
        <TableHeader>
          <HeadRow>
            <Th className="w-px pl-4">When</Th>
            <Th>Caller</Th>
            <Th>Town</Th>
            <Th className="w-px">Priority</Th>
            <Th>Reason</Th>
            <Th className="pr-4">Summary</Th>
          </HeadRow>
        </TableHeader>
        <TableBody>
          {items.map((f) => {
            const priority = asPriority(f.priority);
            return (
              <TableRow key={f.callId}>
                <TableCell className="relative pl-4 text-muted-foreground">
                  {/* Severity before you read a word — same rail as the calls list. */}
                  <span
                    className={`absolute inset-y-0 left-0 w-[3px] ${ramp(priority).rail}`}
                    aria-hidden
                  />
                  <When iso={f.startedAt} now={now} />
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/calls/${f.callId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {f.caller}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{f.town ?? <Dash />}</TableCell>
                <TableCell>
                  <PriorityChip priority={priority} />
                </TableCell>
                <TableCell className="max-w-[32ch] whitespace-normal">
                  {f.reason ?? <Dash />}
                </TableCell>
                <TableCell className="max-w-[48ch] whitespace-normal pr-4 text-muted-foreground">
                  {f.summary ? <span className="line-clamp-2">{f.summary}</span> : <Dash />}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
