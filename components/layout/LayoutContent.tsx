"use client";

import { usePathname } from "next/navigation";
import { SidebarProvider, useSidebar } from "@/lib/SidebarContext";
import { AppSidebar } from "./AppSidebar";

function LayoutContentInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname?.startsWith("/auth");
  const { sidebarOpen, closeSidebar } = useSidebar()!;

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen min-w-0 bg-[var(--background)]">
      {sidebarOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={closeSidebar}
            aria-label="Fermer le menu"
          />
          <AppSidebar />
        </>
      )}
      <div className="main-content-bg flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
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
