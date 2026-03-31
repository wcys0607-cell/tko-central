import { AuthProvider } from "@/components/providers/auth-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <div className="flex flex-1 flex-col w-full">
            <TopBar />
            <main className="flex-1 p-4 md:p-6">{children}</main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    </AuthProvider>
  );
}
