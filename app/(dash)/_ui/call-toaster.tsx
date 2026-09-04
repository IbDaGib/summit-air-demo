"use client";

/**
 * One toast per new call, anywhere in the dashboard.
 *
 * Mounted once in app/(dash)/layout.tsx next to the `<Toaster>`; renders
 * nothing itself. Polls `GET /api/dash/calls?since=<cursor>` every 5s, seeds
 * the cursor from the server's `fetchedAt` (browser and server clocks disagree
 * on a wall display), dedupes on call id, sleeps while the tab is hidden, and
 * eases off to 30s after three failed polls.
 *
 * Two kinds of toast, because two things happen on this phone line:
 *  - an ordinary call: sonner's default toast, auto-dismisses, "Open" action;
 *  - an escalation (P0 or an escalated outcome): a persistent ember card via
 *    `toast.custom` that stays until someone dismisses it. It is deliberately
 *    not a recoloured version of the ordinary toast.
 *
 * Every decision here is made by call-toaster.logic.ts, which is tested; this
 * file is the timers, the fetch, and the JSX.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Siren, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CallSummary } from "../_data/types";
import { PriorityChip, ramp } from "./priority";
import { denverTime } from "./time";
import {
  CURSOR_LAG_MS,
  nextCursor,
  nextDelay,
  pickNew,
  toastDescription,
  toastKind,
  toastTitle,
} from "./call-toaster.logic";

/** Long enough to read a one-line summary across the room; still auto-dismisses. */
const CALL_TOAST_MS = 8_000;

interface Feed {
  calls: CallSummary[];
  fetchedAt: string;
}

async function fetchSince(since: string): Promise<Feed> {
  const res = await fetch(`/api/dash/calls?since=${encodeURIComponent(since)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`calls feed ${res.status}`);
  return (await res.json()) as Feed;
}

export function CallToaster() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let paused = false;
    let failures = 0;
    let cursor: string | null = null;
    const seen = new Set<string>();

    const open = (id: string) => router.push(`/calls/${id}`);

    const fire = (call: CallSummary) => {
      if (toastKind(call) === "escalation") {
        toast.custom(
          (toastId) => (
            <EscalationCard
              call={call}
              onOpen={() => {
                toast.dismiss(toastId);
                open(call.id);
              }}
              onDismiss={() => toast.dismiss(toastId)}
            />
          ),
          { id: call.id, duration: Infinity },
        );
        return;
      }
      toast(toastTitle(call), {
        id: call.id,
        description: toastDescription(call),
        duration: CALL_TOAST_MS,
        action: { label: "Open", onClick: () => open(call.id) },
      });
    };

    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      if (cancelled) return;
      // Nobody is looking. Stop the clock; `visibilitychange` restarts it.
      if (document.hidden) {
        paused = true;
        return;
      }
      try {
        if (cursor === null) {
          // First contact: everything already in the window is history, not
          // news. The seed window is twice the poll lag so a browser clock
          // that is off by up to the lag itself still cannot replay history.
          const seed = await fetchSince(new Date(Date.now() - 2 * CURSOR_LAG_MS).toISOString());
          for (const c of seed.calls) seen.add(c.id);
          cursor = nextCursor(seed.fetchedAt);
        } else {
          const feed = await fetchSince(cursor);
          for (const c of pickNew(feed.calls, seen)) {
            seen.add(c.id);
            fire(c);
          }
          cursor = nextCursor(feed.fetchedAt);
        }
        failures = 0;
      } catch {
        failures += 1;
      }
      if (!cancelled) schedule(nextDelay(failures));
    };

    const onVisibility = () => {
      if (document.hidden || !paused) return;
      paused = false;
      void tick();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}

/**
 * The escalation card. Ember on every surface the ramp offers — rail, panel
 * tint, chip — plus a siren, so it reads as an alarm from across the room and
 * cannot be mistaken for the ordinary "someone called" toast.
 */
function EscalationCard({
  call,
  onOpen,
  onDismiss,
}: {
  call: CallSummary;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const ember = ramp("P0");
  const who = call.callerName ?? call.town ?? call.fromNumber ?? "Unknown caller";
  return (
    <div className="w-full overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-lg">
      <div className={`relative flex items-start gap-3 rounded-lg border p-3 pl-4 ${ember.panel}`}>
        <span className={`absolute inset-y-0 left-0 w-[3px] ${ember.rail}`} aria-hidden />
        <Siren className="mt-0.5 size-4 shrink-0 text-red-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold tracking-wider text-red-200 uppercase">
              Escalation
            </span>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {denverTime(call.startedAt)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="truncate text-sm font-medium">{who}</span>
            <PriorityChip priority={call.priority} size="sm" />
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {toastDescription(call)}
          </p>
          <div className="mt-2.5">
            <Button
              size="xs"
              variant="destructive"
              onClick={onOpen}
              className="bg-red-500/20 text-red-100 hover:bg-red-500/30"
            >
              Open call
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss escalation"
          className="-mr-1 -mt-1 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
