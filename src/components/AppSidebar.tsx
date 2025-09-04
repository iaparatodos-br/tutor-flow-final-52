import { 
  BookOpen, 
  Users, 
  Calendar, 
  DollarSign, 
  LogOut,
  GraduationCap,
  Settings,
  FileText,
  CreditCard,
  Package
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useProfile } from "@/contexts/ProfileContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  { title: "Materiais", url: "/materiais", icon: FileText },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
  { title: "Políticas Cancelamento", url: "/politicas-cancelamento", icon: Settings },
];

const alunoItems = [
  { title: "Minhas Aulas", url: "/aulas", icon: Calendar },
  { title: "Meus Materiais", url: "/meus-materiais", icon: FileText },
  { title: "Faturas", url: "/faturas", icon: DollarSign },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { profile, isProfessor, isAluno } = useProfile();
  const { signOut, loading } = useAuth();
  const { currentPlan, hasFeature } = useSubscription();
  const currentPath = location.pathname;
  
  const isCollapsed = state === 'collapsed';
  
  // Don't render role-specific content until we're sure of the user's role
  if (loading || !profile || (!isProfessor && !isAluno)) {
    return (
      <Sidebar className="border-r bg-card">
        <div className="flex h-full flex-col">
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
          <div className="flex-1 p-4">
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      </Sidebar>
    );
  }
  
  const items = isProfessor ? professorItems : alunoItems;
  
  const isActive = (path: string) => currentPath === path;
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive 
      ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium" 
      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors";

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <TooltipProvider>
      <Sidebar 
        className="border-r bg-card"
        collapsible="icon"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center border-b px-3">
            <div className={`flex items-center ${isCollapsed ? 'justify-center w-full' : 'gap-3'}`}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary text-white flex-shrink-0">
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
          <SidebarContent className={`flex-1 ${isCollapsed ? 'px-2' : 'px-4'} py-4`}>
            <SidebarGroup>
              <SidebarGroupLabel className={isCollapsed ? "sr-only" : ""}>
                {isProfessor ? "Professor" : "Aluno"}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                         <Tooltip>
                           <TooltipTrigger asChild>
                              <NavLink 
                                to={item.url} 
                                className={({ isActive }) => `${getNavCls({ isActive })} flex items-center ${isCollapsed ? 'justify-center w-full p-2' : 'gap-3 px-0 py-2'} rounded-lg min-h-[40px] w-full`}
                              >
                                <item.icon className="h-4 w-4 flex-shrink-0" />
                                {!isCollapsed && (
                                  <div className="flex items-center justify-between w-full">
                                    <span>{item.title}</span>
                                    {/* Show premium indicators */}
                                    {item.title === 'Financeiro' && !hasFeature('financial_module') && (
                                      <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded">
                                        Premium
                                      </span>
                                    )}
                                  </div>
                                )}
                              </NavLink>
                           </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>{item.title}</p>
                          </TooltipContent>
                        </Tooltip>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Subscription Section for Professors */}
            {isProfessor && (
              <SidebarGroup>
                <SidebarGroupLabel className={isCollapsed ? "sr-only" : ""}>
                  Assinatura
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                         <Tooltip>
                           <TooltipTrigger asChild>
                              <NavLink 
                                to="/planos" 
                                className={({ isActive }) => `${getNavCls({ isActive })} flex items-center ${isCollapsed ? 'justify-center w-full p-2' : 'gap-3 px-0 py-2'} rounded-lg min-h-[40px] w-full`}
                              >
                                <Package className="h-4 w-4 flex-shrink-0" />
                                {!isCollapsed && <span>Planos</span>}
                              </NavLink>
                           </TooltipTrigger>
                           <TooltipContent side="right">
                             <p>Planos</p>
                           </TooltipContent>
                         </Tooltip>
                       </SidebarMenuButton>
                     </SidebarMenuItem>
                     <SidebarMenuItem>
                       <SidebarMenuButton asChild>
                         <Tooltip>
                           <TooltipTrigger asChild>
                               <NavLink 
                                 to="/subscription" 
                                 className={({ isActive }) => `${getNavCls({ isActive })} flex items-center ${isCollapsed ? 'justify-center w-full p-2' : 'gap-3 px-0 py-2'} rounded-lg min-h-[40px] w-full`}
                               >
                                 <CreditCard className="h-4 w-4 flex-shrink-0" />
                                 {!isCollapsed && (
                                   <div className="flex items-center justify-between w-full">
                                     <span>Assinatura</span>
                                     {currentPlan && (
                                       <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                         {currentPlan.name}
                                       </span>
                                     )}
                                   </div>
                                 )}
                               </NavLink>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>Assinatura</p>
                          </TooltipContent>
                        </Tooltip>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          {/* User info and logout */}
          <div className={`border-t ${isCollapsed ? 'p-3' : 'p-4'}`}>
            <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"}`}>
              {!isCollapsed && (
                <div className="flex flex-col">
                  <p className="text-sm font-medium">{profile?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isProfessor ? "Professor" : "Aluno"}
                  </p>
                </div>
              )}
              {isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSignOut}
                      className="hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Sair</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="hover:bg-destructive hover:text-destructive-foreground"
                  title="Sair"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </Sidebar>
    </TooltipProvider>
  );
}