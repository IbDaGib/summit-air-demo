import Link from "next/link";
import type { Metadata } from "next";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarNav } from "./_ui/sidebar-nav";

export const metadata: Metadata = {
  title: "Summit Air — Dispatch",
  description: "Inbound calls, the schedule, and what the agent is worth.",
};

/**
 * Dark in both colour schemes. Operations pages live on a wall display; the
 * stakeholder pages get screen-shared. Neither should flip with the viewer's
 * OS setting, so the `dark` class is forced rather than derived.
 */
export default function DashLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="dark flex min-h-full flex-1 bg-background text-foreground [color-scheme:dark]">
      <TooltipProvider delayDuration={200}>
        <SidebarProvider>
          <Sidebar collapsible="icon">
            <SidebarHeader className="px-3 py-3">
              <Link href="/overview" className="flex items-baseline gap-2 group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-semibold tracking-tight">Summit Air</span>
                <span className="text-xs text-muted-foreground">Dispatch</span>
              </Link>
            </SidebarHeader>
            <SidebarContent>
              <SidebarNav />
            </SidebarContent>
            <SidebarFooter className="px-3 pb-3">
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground ring-1 ring-inset ring-border group-data-[collapsible=icon]:hidden">
                READ ONLY
              </span>
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>
          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-10 flex h-11 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-4" />
              <span className="text-xs text-muted-foreground">
                Fictional company from the case study. All data is mock.
              </span>
            </header>
            <main className="flex flex-1 flex-col">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  );
}
