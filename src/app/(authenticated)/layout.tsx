"use client";

import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Toaster } from "sonner";
import { InstallBanner } from "@/components/pwa/install-banner";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <SidebarProvider>
            {/* Sidebar: hidden on mobile, visible on desktop */}
            <div className="hidden md:block">
              <AppSidebar />
            </div>
            <div className="flex flex-1 flex-col w-full">
              <TopBar />
              <main className="flex-1 overscroll-contain pb-20 md:pb-0">
                {children}
              </main>
            </div>
            {/* Bottom nav: visible on mobile only */}
            <MobileBottomNav />
            <InstallBanner />
          </SidebarProvider>
        </TooltipProvider>
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            className: "font-sans",
          }}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}
