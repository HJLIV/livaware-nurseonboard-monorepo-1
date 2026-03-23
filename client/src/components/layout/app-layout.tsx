import { SidebarNav } from "./sidebar-nav";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SidebarNav />
      <main id="main-content" className="pl-64">
        <div className="px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
