import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Store, Users, ShoppingCart, HandCoins, BookOpen, Wallet, FileText, Settings, LogOut, Receipt,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Restaurants", url: "/restaurants", icon: Store },
  { title: "Vendors", url: "/vendors", icon: Users },
  { title: "Purchases", url: "/purchases", icon: ShoppingCart },
  { title: "Payments", url: "/payments", icon: HandCoins },
  { title: "Expenses & Overheads", url: "/expenses", icon: Receipt },
  { title: "Vendor Ledger", url: "/vendor-ledger", icon: BookOpen },
  { title: "Vaults / Cash in Hand", url: "/vaults", icon: Wallet },
  { title: "Report", url: "/report", icon: FileText },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;


export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const qc = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center">
            <Wallet className="h-4 w-4" />
          </div>
          {!collapsed && <span className="font-semibold text-sm tracking-tight">V&C Manager</span>}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => {
                const active = pathname === it.url || pathname.startsWith(it.url + "/");
                return (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={it.title}>
                      <Link to={it.url} className="flex items-center gap-2">
                        <it.icon className="h-4 w-4" />
                        <span>{it.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
