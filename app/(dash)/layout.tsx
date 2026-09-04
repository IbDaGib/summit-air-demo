import Link from "next/link";
import type { Metadata } from "next";
import { NavLink } from "./_ui/nav-link";

export const metadata: Metadata = {
  title: "Summit Air — Dispatch",
  description: "Read-only operator view of inbound calls and the schedule.",
};

/**
 * Dark, dense chrome. This is an operator tool that lives on a wall display, so
 * it does not follow the system colour scheme — it is dark in both.
 */
export default function DashLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-zinc-100 [color-scheme:dark]">
      <header className="sticky top-0 z-10 flex items-center gap-6 border-b border-zinc-800 bg-zinc-950/95 px-5 py-2.5 backdrop-blur">
        <Link href="/calls" className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight">Summit Air</span>
          <span className="text-xs text-zinc-500">Dispatch</span>
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink href="/calls">Calls</NavLink>
          <NavLink href="/schedule">Schedule</NavLink>
        </nav>
        <span className="ml-auto rounded bg-zinc-900 px-2 py-0.5 font-mono text-[10px] tracking-wide text-zinc-500 ring-1 ring-inset ring-zinc-800">
          READ ONLY
        </span>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
