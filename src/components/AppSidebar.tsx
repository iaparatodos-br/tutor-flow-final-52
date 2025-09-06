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
      ? "bg-primary/20 text-primary font-semibold border border-primary/30 shadow-md backdrop-blur-sm" 
      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200";

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <TooltipProvider>
      <Sidebar 
        className="border-r bg-card data-[state=collapsed]:w-16"
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
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                         <Tooltip>
                           <TooltipTrigger asChild>
                                  <NavLink 
                                    to={item.url} 
                                    className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-10 px-3 py-2' : 'px-0 py-3'} rounded-lg min-h-[44px] w-full transition-all duration-200 ${isActive(item.url) ? '!bg-primary/20 !text-primary font-semibold border border-primary/30 shadow-md backdrop-blur-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                                 >
                                  <item.icon className={`h-4 w-4 flex-shrink-0 ${isActive(item.url) && !isCollapsed ? 'text-primary ml-2' : 'text-primary'}`} />
                                 {!isCollapsed && (
                                   <div className="flex items-center justify-between w-full ml-4">
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
                      <SidebarMenuButton asChild isActive={isActive("/planos")}>
                         <Tooltip>
                           <TooltipTrigger asChild>
                                   <NavLink 
                                     to="/planos" 
                                     className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-10 px-3 py-2' : 'px-0 py-3'} rounded-lg min-h-[44px] w-full transition-all duration-200 ${isActive("/planos") ? '!bg-primary/20 !text-primary font-semibold border border-primary/30 shadow-md backdrop-blur-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                                  >
                                   <Package className={`h-4 w-4 flex-shrink-0 ${isActive("/planos") && !isCollapsed ? 'text-primary ml-2' : 'text-primary'}`} />
                                 {!isCollapsed && <span className="ml-4">Planos</span>}
                               </NavLink>
                           </TooltipTrigger>
                           <TooltipContent side="right">
                             <p>Planos</p>
                           </TooltipContent>
                         </Tooltip>
                       </SidebarMenuButton>
                     </SidebarMenuItem>
                     <SidebarMenuItem>
                       <SidebarMenuButton asChild isActive={isActive("/subscription")}>
                         <Tooltip>
                           <TooltipTrigger asChild>
                                    <NavLink 
                                      to="/subscription" 
                                      className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-10 px-3 py-2' : 'px-0 py-3'} rounded-lg min-h-[44px] w-full transition-all duration-200 ${isActive("/subscription") ? '!bg-primary/20 !text-primary font-semibold border border-primary/30 shadow-md backdrop-blur-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                                   >
                                    <CreditCard className={`h-4 w-4 flex-shrink-0 ${isActive("/subscription") && !isCollapsed ? 'text-primary ml-2' : 'text-primary'}`} />
                                  {!isCollapsed && (
                                    <div className="flex items-center justify-between w-full ml-4">
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