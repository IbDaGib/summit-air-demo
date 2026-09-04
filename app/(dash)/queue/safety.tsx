/**
 * Life-safety escalations. The agent hands these off immediately during the
 * call; this table is the log, not the alarm.
 *
 * Zero is the correct answer here, and the empty state is built to read that
 * way: same frame, same padding, same type scale as a populated table, with a
 * heading rather than a shrug. Nothing here is styled as an error.
 */
import { ShieldCheck } from "lucide-react";
import type { SafetyIncidentRow } from "../_data/metrics";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhone } from "./_format";
import { Dash, HeadRow, Panel, Th, When } from "./cells";

/** agent/policy/types.ts Hazard codes, as dispatch would say them. */
const HAZARD_LABEL: Record<string, string> = {
  gas_smell: "Gas smell",
  co_alarm: "CO alarm",
  smoke_or_burning: "Smoke / burning",
};

const hazardLabel = (code: string) => HAZARD_LABEL[code] ?? code.replace(/_/g, " ");

export function Safety({ items, now }: { items: SafetyIncidentRow[]; now: Date }) {
  if (items.length === 0) {
    return (
      <Panel>
        <div className="flex items-start gap-3 px-4 py-6">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">No safety incidents recorded</p>
            <p className="text-sm text-muted-foreground">
              Gas, CO and smoke reports escalate immediately and are logged here.
            </p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <Table>
        <TableHeader>
          <HeadRow>
            <Th className="w-px pl-4">When</Th>
            <Th>Hazard</Th>
            <Th>Town</Th>
            <Th className="pr-4">Phone</Th>
          </HeadRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="pl-4 text-muted-foreground">
                <When iso={i.createdAt} now={now} />
              </TableCell>
              <TableCell>
                <Badge variant="destructive">{hazardLabel(i.hazard)}</Badge>
              </TableCell>
              <TableCell>{i.town ?? <Dash />}</TableCell>
              <TableCell className="pr-4 font-mono tabular-nums">
                {i.phone ? (
                  <a href={`tel:${i.phone}`} className="underline-offset-4 hover:underline">
                    {formatPhone(i.phone)}
                  </a>
                ) : (
                  <Dash />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
