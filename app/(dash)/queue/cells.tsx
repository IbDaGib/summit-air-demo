/**
 * The small pieces the three queue tables share, so a change to how a
 * timestamp or an empty state looks lands in one place.
 *
 * No "use client" here, but not everything below is a server component. `Th`
 * is a re-export of TableHead from components/ui/table, a client module, so
 * it carries that module's JavaScript. `When` renders a Radix Tooltip, which
 * only works under the TooltipProvider that app/(dash)/layout.tsx mounts —
 * used outside the dashboard layout it throws. The rows around them stay on
 * the server.
 */
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { TableHead, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { denverStamp, relativeTime } from "./_format";

/** The frame every tab renders into, populated or empty. */
export function Panel({ children }: { children: ReactNode }) {
  return <Card className="gap-0 overflow-hidden py-0">{children}</Card>;
}

/**
 * Empty state with the same horizontal padding and type scale as a populated
 * table, so the frame does not collapse when there is nothing in it.
 */
export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-sm text-muted-foreground">{children}</div>;
}

/** Dense header row: small caps, muted, shorter than the shadcn default. */
export function HeadRow({ children }: { children: ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent [&_th]:h-8 [&_th]:text-[11px] [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase">
      {children}
    </TableRow>
  );
}

export { TableHead as Th };

/**
 * For the resolve column: below md the tables scroll sideways, and the one
 * thing a person can press should not be a swipe away on every row. Pinned to
 * the right edge, opaque, with a hairline so scrolled cells pass beneath it
 * cleanly. Applied to the header cell too, so the column reads as one.
 */
export const STICKY_ON_MOBILE = "max-md:sticky max-md:right-0 max-md:border-l max-md:bg-card";

/** Relative age, with the exact Denver time one hover away. */
export function When({ iso, now }: { iso: string; now: Date }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={iso} className="cursor-default tabular-nums whitespace-nowrap">
          {relativeTime(iso, now)}
        </time>
      </TooltipTrigger>
      <TooltipContent className="font-mono tabular-nums">{denverStamp(iso)}</TooltipContent>
    </Tooltip>
  );
}

/** A value that is legitimately absent. Quiet, not alarming. */
export function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
