"use client";

import { usePathname } from "next/navigation";
import { SidebarProvider, useSidebar } from "@/lib/SidebarContext";
import { AppSidebar } from "./AppSidebar";

function LayoutContentInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname?.startsWith("/auth");
  const { sidebarOpen } = useSidebar()!;

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {sidebarOpen && <AppSidebar />}
      <div className="main-content-bg flex min-h-screen flex-1 flex-col min-w-0">{children}</div>
    </div>
  );
}

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname?.startsWith("/auth");

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <LayoutContentInner>{children}</LayoutContentInner>
    </SidebarProvider>
  );
}
