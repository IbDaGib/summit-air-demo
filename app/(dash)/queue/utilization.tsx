/**
 * How full the next week is, per technician. Dispatch reads this next to the
 * queue to decide who gets the follow-ups: a P1 goes to whoever has room and
 * is on call, not to whoever is listed first.
 *
 * Capacity is four two-hour arrival windows a day over five business days,
 * the same arithmetic metrics.ts uses to compute `pct`.
 */
import type { TechUtilization } from "../_data/metrics";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Utilization({ techs }: { techs: TechUtilization[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Technician load — next five business days</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {techs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No technicians loaded.</p>
        ) : (
          <ul className="grid grid-cols-[minmax(9rem,auto)_minmax(5rem,auto)_auto_1fr_auto] items-center gap-x-4 gap-y-2 text-sm">
            {techs.map((t) => (
              <TechRow key={t.techId} tech={t} />
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Four two-hour arrival windows per day.</p>
      </CardContent>
    </Card>
  );
}

function TechRow({ tech }: { tech: TechUtilization }) {
  const pct = Math.min(100, Math.max(0, tech.pct));
  return (
    <li className="col-span-full grid grid-cols-subgrid items-center">
      <span className="truncate font-medium">{tech.name}</span>
      <span className="truncate text-muted-foreground">{tech.county}</span>
      <span className="w-14">
        {tech.onCall ? (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] uppercase tracking-wide">
            on call
          </Badge>
        ) : null}
      </span>
      <span
        className="h-1.5 w-full rounded bg-muted"
        role="meter"
        aria-label={`${tech.name} booked windows`}
        aria-valuemin={0}
        aria-valuemax={tech.capacityWindows}
        aria-valuenow={tech.bookedWindows}
      >
        <span
          className="block h-full rounded"
          style={{ width: `${pct}%`, background: "var(--chart-2)" }}
        />
      </span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        <span className="text-foreground">{tech.bookedWindows}</span>/{tech.capacityWindows}
      </span>
    </li>
  );
}
