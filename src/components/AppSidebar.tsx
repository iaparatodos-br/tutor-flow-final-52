import { 
  BookOpen, 
  Users, 
  Calendar, 
  DollarSign, 
  LogOut,
  GraduationCap
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { 
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from "@/components/ui/sidebar";

const professorItems = [
  { title: "Dashboard", url: "/dashboard", icon: BookOpen },
  { title: "Alunos", url: "/alunos", icon: Users },
  { title: "Agenda", url: "/agenda", icon: Calendar },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
];

const alunoItems = [
  { title: "Minhas Aulas", url: "/aulas", icon: Calendar },
  { title: "Faturas", url: "/faturas", icon: DollarSign },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { profile, signOut, isProfessor } = useAuth();
  const currentPath = location.pathname;
  
  const isCollapsed = state === 'collapsed';
  const items = isProfessor ? professorItems : alunoItems;
  
  const isActive = (path: string) => currentPath === path;
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive 
      ? "bg-primary text-primary-foreground font-medium shadow-primary" 
      : "hover:bg-accent text-muted-foreground hover:text-foreground transition-colors";

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar 
      className={`${isCollapsed ? "w-14" : "w-64"} border-r bg-card transition-all duration-300`}
      collapsible="icon"
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex h-16 items-center border-b px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary text-white">
              <GraduationCap className="h-4 w-4" />
            </div>
            {!isCollapsed && (
              <span className="text-lg font-semibold bg-gradient-primary bg-clip-text text-transparent">
                TutorFlow
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <SidebarContent className="flex-1 p-4">
          <SidebarGroup>
            <SidebarGroupLabel className={isCollapsed ? "sr-only" : ""}>
              {isProfessor ? "Professor" : "Aluno"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className={getNavCls}>
                        <item.icon className="h-4 w-4" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* User info and logout */}
        <div className="border-t p-4">
          <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"}`}>
            {!isCollapsed && (
              <div className="flex flex-col">
                <p className="text-sm font-medium">{profile?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {isProfessor ? "Professor" : "Aluno"}
                </p>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="hover:bg-destructive hover:text-destructive-foreground"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Sidebar>
  );
}