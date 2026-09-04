/**
 * Calls the agent could not close. This is the list dispatch works top to
 * bottom at 7am; the caller receives the sorted output of ./sort.ts.
 */
import Link from "next/link";
import type { FollowupItem } from "../_data/metrics";
import type { Priority } from "../_data/types";
import { PriorityChip, ramp } from "../_ui/priority";
import { Table, TableBody, TableCell, TableHeader } from "@/components/ui/table";
import { formatPhone, present } from "./_format";
import { Dash, Empty, HeadRow, Panel, Th, When } from "./cells";
import { ResolvableRow } from "./resolve-toggle";

const TIERS: ReadonlySet<string> = new Set<Priority>(["P0", "P1", "P2", "P3"]);

/** metrics.ts hands back the enum as text; only the four real tiers light the ramp. */
const asPriority = (p: string | null): Priority | null =>
  p !== null && TIERS.has(p) ? (p as Priority) : null;

/**
 * `caller` is the customer's name when we know them, otherwise the E.164
 * number the call came from. A bare number is a thing to dial, so it gets
 * dialling punctuation and mono figures; a name is left alone.
 */
const E164 = /^\+?\d{10,15}$/;
function Caller({ value }: { value: string }) {
  return E164.test(value) ? (
    <span className="font-mono font-normal tabular-nums">{formatPhone(value)}</span>
  ) : (
    <>{value}</>
  );
}

export function Followups({
  items,
  now,
  showingResolved = false,
}: {
  items: FollowupItem[];
  now: Date;
  /** Whether resolved rows were asked for — changes only what an empty table says. */
  showingResolved?: boolean;
}) {
  if (items.length === 0) {
    return (
      <Panel>
        <Empty>
          {showingResolved
            ? "No follow-ups on record, open or resolved."
            : "Nothing waiting on a person."}
        </Empty>
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
            <Th>Summary</Th>
            <Th className="w-px pr-3">
              <span className="sr-only">Resolve</span>
            </Th>
          </HeadRow>
        </TableHeader>
        <TableBody>
          {items.map((f) => {
            const priority = asPriority(f.priority);
            // Every data cell carries the same link — the pattern calls-table.tsx
            // uses — so the row is the click target without an onClick on the
            // <tr>. Only the caller is underlined; one affordance per row is
            // enough. The resolve cell is added by ResolvableRow, outside the
            // link, so pressing it never navigates.
            const href = `/calls/${f.callId}`;
            const summary = present(f.summary);
            return (
              <ResolvableRow
                key={f.callId}
                kind="followup"
                id={f.callId}
                resolved={f.resolvedAt !== null}
              >
                <TableCell className="relative pl-4 text-muted-foreground">
                  {/* Severity before you read a word — same rail as the calls list. */}
                  <span
                    className={`absolute inset-y-0 left-0 w-[3px] ${ramp(priority).rail}`}
                    aria-hidden
                  />
                  <Link href={href} className="block">
                    <When iso={f.startedAt} now={now} />
                  </Link>
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={href} className="block underline-offset-4 hover:underline">
                    <Caller value={f.caller} />
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <Link href={href} className="block">
                    {present(f.town) ?? <Dash />}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={href} className="block">
                    <PriorityChip priority={priority} />
                  </Link>
                </TableCell>
                <TableCell className="max-w-[32ch] whitespace-normal">
                  <Link href={href} className="block">
                    {present(f.reason) ?? <Dash />}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[48ch] whitespace-normal text-muted-foreground">
                  <Link href={href} className="block">
                    {summary ? (
                      <span className="line-clamp-2 group-data-[resolved=true]:line-through">
                        {summary}
                      </span>
                    ) : (
                      <Dash />
                    )}
                  </Link>
                </TableCell>
              </ResolvableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
