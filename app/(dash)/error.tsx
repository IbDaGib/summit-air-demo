"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Route-segment error boundary for every dashboard page.
 *
 * Each page awaits its metrics in one Promise.all; if Neon hiccups mid
 * screen-share the rejection would otherwise surface as Next's default
 * "Application error" page. This is deliberately NOT a fallback to the
 * empty-data shape — showing "No calls in the last 30 days" when the truth is
 * "database unreachable" would be dishonest. Say what happened, offer a retry.
 */
export default function DashError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <Card className="max-w-xl border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-destructive" aria-hidden />
            Couldn&rsquo;t load this page
          </CardTitle>
          <CardDescription>
            The dashboard could not reach the database. The phone agent is unaffected — calls
            are still being answered and recorded.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/*
            Next replaces server-component error messages with a generic
            "Minified React error #441" string in production so nothing leaks.
            error.message is therefore never informative here; the digest is the
            key that matches the server log, so that is what gets shown.
          */}
          <p className="font-mono text-[11px] text-muted-foreground">
            {error.digest
              ? <>Reference <span className="tabular-nums text-foreground">{error.digest}</span> — matches the server log.</>
              : "No reference id was returned."}
          </p>
          <div>
            <Button size="sm" onClick={reset}>
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
