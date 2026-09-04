/**
 * /queue — the page dispatch opens at 7am. Everything the agent could not
 * finish and a person must pick up, hottest first.
 *
 * Server component. Tabs is a client component, but it only needs `children`
 * from us; the tables are rendered on the server and passed through as slots,
 * so nothing here ships row data to the browser as JavaScript.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getCallbackQueue,
  getFollowupQueue,
  getResolvedFollowupQueue,
  getSafetyIncidents,
  getTechUtilization,
} from "../_data/metrics";
import { Callbacks } from "./callbacks";
import { Followups } from "./followups";
import { LIMIT, countLabel } from "./limit";
import { Safety } from "./safety";
import { sortFollowups } from "./sort";
import { Utilization } from "./utilization";

// A work queue is never stale on purpose. Nothing about it may be prerendered.
export const dynamic = "force-dynamic";

export default async function QueuePage({ searchParams }: PageProps<"/queue">) {
  // `?resolved=1` widens the follow-up fetch to rows a person already closed.
  // Anything else — absent, "0", garbage — is the default: open rows only.
  const { resolved } = await searchParams;
  const showResolved = resolved === "1";

  // One past the cap, so the badge can tell "exactly 50" from "50 and more".
  const [followups, resolvedFollowups, callbacks, incidents, techs] =
    await Promise.all([
      getFollowupQueue(LIMIT + 1),
      showResolved ? getResolvedFollowupQueue(LIMIT) : Promise.resolve([]),
      getCallbackQueue(LIMIT + 1),
      getSafetyIncidents(LIMIT + 1),
      getTechUtilization(),
    ]);
  // One clock for every "3m ago" on the page, so two rows never disagree.
  const now = new Date();
  const shownCallbacks = callbacks.slice(0, LIMIT);
  // Badges count open rows over the unsliced fetch: metrics orders unresolved
  // first, so ≤50 open is exact and ≥51 reads 50+. Counting the sliced list
  // capped it at 50 — the bug this comment exists to keep dead. With resolved
  // rows shown, the follow-up badge still counts only what is left to do.
  const openFollowups = followups.length;
  const openCallbacks = callbacks.filter((c) => !c.resolved).length;

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <div className="space-y-0.5">
        <h1 className="text-base font-semibold tracking-tight">Needs a human</h1>
        <p className="text-sm text-muted-foreground">
          What the agent could not finish. Work top to bottom.
        </p>
      </div>

      <Tabs defaultValue="followups">
        <TabsList variant="line">
          <TabsTrigger value="followups">
            Needs a human
            <Count n={openFollowups} />
          </TabsTrigger>
          <TabsTrigger value="callbacks">
            Callbacks
            <Count n={openCallbacks} />
          </TabsTrigger>
          <TabsTrigger value="safety">
            Safety incidents
            <Count n={incidents.length} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="followups" className="space-y-2">
          <div className="flex justify-end">
            {/* A link, not state: the choice lives in the URL and survives a reload. */}
            <Button variant="outline" size="sm" asChild>
              <Link href={showResolved ? "/queue" : "/queue?resolved=1"}>
                {showResolved ? "Hide resolved" : "Show resolved"}
              </Link>
            </Button>
          </div>
          <Followups
            items={sortFollowups([
              ...followups.slice(0, LIMIT),
              ...resolvedFollowups,
            ])}
            now={now}
            showingResolved={showResolved}
          />
        </TabsContent>
        <TabsContent value="callbacks">
          <Callbacks items={shownCallbacks} now={now} />
        </TabsContent>
        <TabsContent value="safety">
          <Safety items={incidents.slice(0, LIMIT)} now={now} />
        </TabsContent>
      </Tabs>

      <Utilization techs={techs} />
    </div>
  );
}

/**
 * Count in a tab trigger. Zero is a legitimate count, so it is shown, quietly.
 * `n` may be one over LIMIT — that is how the fetch reports "more than fit".
 */
function Count({ n }: { n: number }) {
  return (
    <Badge
      variant={n > 0 ? "secondary" : "outline"}
      className="h-4 min-w-5 px-1.5 text-[10px] tabular-nums"
    >
      {countLabel(n)}
    </Badge>
  );
}
