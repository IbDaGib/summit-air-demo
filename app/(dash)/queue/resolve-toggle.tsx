"use client";

/**
 * The one interactive thing on /queue: a person marks a row done, or takes
 * that back.
 *
 * Why this wraps the whole row rather than just the button: the row's resolved
 * look (faded, summary struck through) has to flip the instant the button is
 * pressed, before the server answers, and a <td> cannot restyle its <tr>. So
 * the <tr> is rendered here, with the optimistic state on it as a data
 * attribute, and the cells arrive as `children` — rendered on the server, so
 * no row data ships to the browser as JavaScript. Cells that should strike
 * through opt in with `group-data-[resolved=true]:line-through`.
 *
 * Plain toggle by decision (DECISIONS.md): no who, no why, no confirm. Undo is
 * the safety net, offered on every toast.
 */
import { Check, Undo2 } from "lucide-react";
import { useOptimistic, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resolveCallback, resolveFollowup, type ResolveResult } from "./actions";
import { STICKY_ON_MOBILE } from "./cells";

type Kind = "followup" | "callback";

const ACTION: Record<Kind, (id: string, resolved: boolean) => Promise<ResolveResult>> = {
  followup: resolveFollowup,
  callback: resolveCallback,
};

export function ResolvableRow({
  kind,
  id,
  resolved,
  className,
  children,
}: {
  kind: Kind;
  id: string;
  /** The server's answer. The optimistic copy tracks it whenever it changes. */
  resolved: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(resolved);

  const toggle = (next: boolean) =>
    startTransition(async () => {
      setShown(next);
      const result = await ACTION[kind](id, next);
      if (!result.ok) {
        // The transition ends without the server state changing, so the
        // optimistic value falls back to `resolved` on its own.
        toast.error(next ? "Could not mark resolved" : "Could not reopen", {
          description: result.error,
        });
        return;
      }
      toast(next ? "Marked resolved" : "Reopened", {
        action: { label: "Undo", onClick: () => toggle(!next) },
      });
    });

  return (
    <TableRow
      data-resolved={shown}
      className={cn(
        "group transition-all duration-300",
        shown && "opacity-60 hover:opacity-100",
        className,
      )}
    >
      {children}
      {/*
        Its own cell, outside any row link, so a tap here never navigates.
        Below md the table scrolls sideways and this column would be a swipe
        away on every row, so it is pinned to the right edge there — opaque,
        with a hairline, so scrolled cells pass beneath it cleanly. Desktop is
        left alone: the table fits, and an opaque cell would mask the row hover.
      */}
      <TableCell className={cn("w-px pr-3 text-right", STICKY_ON_MOBILE)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={shown ? "Reopen" : "Mark resolved"}
              aria-pressed={shown}
              disabled={pending}
              onClick={() => toggle(!shown)}
              className="text-muted-foreground hover:text-foreground"
            >
              {shown ? <Undo2 aria-hidden /> : <Check aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{shown ? "Reopen" : "Mark resolved"}</TooltipContent>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}
