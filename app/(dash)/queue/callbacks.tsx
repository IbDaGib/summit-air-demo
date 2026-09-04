/**
 * Callback requests the agent took. The phone column is the reason this tab
 * exists: a lead dispatch cannot dial is not a lead. An earlier bug saved
 * requests with an empty phone while the agent told the caller "I've passed
 * your number along" — that is fixed upstream, but if a row ever arrives with
 * no number it is rendered as a visible warning, never a blank cell.
 */
import { PhoneOff } from "lucide-react";
import type { CallbackItem } from "../_data/metrics";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader } from "@/components/ui/table";
import { formatPhone, present } from "./_format";
import { Dash, Empty, HeadRow, Panel, Th, When } from "./cells";
import { ResolvableRow } from "./resolve-toggle";

export function Callbacks({ items, now }: { items: CallbackItem[]; now: Date }) {
  if (items.length === 0) {
    return (
      <Panel>
        <Empty>No callback requests.</Empty>
      </Panel>
    );
  }

  return (
    <Panel>
      <Table>
        <TableHeader>
          <HeadRow>
            <Th className="w-px pl-4">Created</Th>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>Reason</Th>
            <Th>Notes</Th>
            <Th className="w-px">Status</Th>
            <Th className="w-px pr-3">
              <span className="sr-only">Resolve</span>
            </Th>
          </HeadRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            // Resolved rows stay for the record but recede; open ones are the work.
            <ResolvableRow key={c.id} kind="callback" id={c.id} resolved={c.resolved}>
              <TableCell className="pl-4 text-muted-foreground">
                <When iso={c.createdAt} now={now} />
              </TableCell>
              <TableCell className="font-medium">
                {present(c.customerName) ? (
                  c.customerName
                ) : (
                  <span className="font-normal text-muted-foreground italic">unknown</span>
                )}
              </TableCell>
              <TableCell>
                <PhoneCell phone={c.phone} />
              </TableCell>
              <TableCell className="max-w-[32ch] whitespace-normal">
                {present(c.reason) ? (
                  // The reason is the thing to do; when it is done, it reads as done.
                  <span className="group-data-[resolved=true]:line-through">{c.reason}</span>
                ) : (
                  <Dash />
                )}
              </TableCell>
              <TableCell className="max-w-[40ch] whitespace-normal text-muted-foreground">
                {present(c.notes) ? <span className="line-clamp-2">{c.notes}</span> : <Dash />}
              </TableCell>
              <TableCell>
                {/* Follows the optimistic row state, not the prop, so it flips with the row. */}
                <Badge variant="outline" className="group-data-[resolved=true]:hidden">
                  open
                </Badge>
                <Badge variant="secondary" className="hidden group-data-[resolved=true]:inline-flex">
                  resolved
                </Badge>
              </TableCell>
            </ResolvableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function PhoneCell({ phone }: { phone: string }) {
  if (phone.trim() === "") {
    return (
      <Badge variant="destructive">
        <PhoneOff aria-hidden />
        no number
      </Badge>
    );
  }
  return (
    <a href={`tel:${phone}`} className="font-mono tabular-nums underline-offset-4 hover:underline">
      {formatPhone(phone)}
    </a>
  );
}
