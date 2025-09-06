import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
  requireAuth?: boolean;
}

export function Layout({ children, requireAuth = true }: LayoutProps) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-subtle">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (!requireAuth) {
    return <div className="min-h-screen bg-gradient-subtle">{children}</div>;
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar />
        
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header com trigger sempre visível */}
          <header className="flex h-16 items-center border-b bg-card px-4">
            <SidebarTrigger className="mr-2 hover:bg-accent hover:text-accent-foreground rounded-md p-2 transition-colors">
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
            <span className="font-semibold">TutorFlow</span>
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-auto bg-gradient-subtle p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}