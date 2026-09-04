"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CircleDollarSign,
  LayoutDashboard,
  ListTodo,
  Phone,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * Two groups, because the two audiences are different. Dispatch works the
 * operations pages during the day; the stakeholder pages exist to be
 * screen-shared to the person who signs the contract.
 */
const OPERATIONS = [
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/queue", label: "Needs a human", icon: ListTodo },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
] as const;

const STAKEHOLDER = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/cost", label: "Cost & ROI", icon: CircleDollarSign },
] as const;

function Group({
  label,
  items,
  pathname,
}: {
  label: string;
  items: ReadonlyArray<{ href: string; label: string; icon: typeof Phone }>;
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={label}
                  // The base variant already transitions width/height/padding for
                  // the collapse; `cn` would let `transition-colors` replace it, so
                  // the colour channels are appended to the same list instead.
                  className="transition-[width,height,padding,color,background-color] duration-200"
                >
                  <Link href={href}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <>
      <Group label="Operations" items={OPERATIONS} pathname={pathname} />
      <Group label="For Summit Air" items={STAKEHOLDER} pathname={pathname} />
    </>
  );
}
