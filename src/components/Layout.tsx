import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebarState } from "@/contexts/SidebarContext";
import { TeacherContextSwitcher } from "@/components/TeacherContextSwitcher";
interface LayoutProps {
  children: ReactNode;
  requireAuth?: boolean;
}
export function Layout({
  children,
  requireAuth = true
}: LayoutProps) {
  const {
    loading,
    isAuthenticated,
    isAluno
  } = useAuth();
  const {
    isOpen,
    toggle
  } = useSidebarState();
  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gradient-subtle">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>;
  }
  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }
  if (!requireAuth) {
    return <div className="min-h-screen bg-gradient-subtle">{children}</div>;
  }
  const content = <div className="flex h-screen w-full bg-background">
      <AppSidebar isOpen={isOpen} />
      
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header com trigger sempre visível */}
        <header className="flex h-16 items-center border-b bg-card px-4">
          <Button variant="ghost" size="sm" onClick={toggle} className="mr-2 hover:bg-accent hover:text-accent-foreground rounded-md p-2 transition-colors">
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold">TutorFlow</span>
          
          <div className="ml-auto flex items-center gap-4">
            {/* Teacher context switcher for students */}
            {isAluno}
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-gradient-subtle p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>;
  return content;
}