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
  Package,
  Archive
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useProfile } from "@/contexts/ProfileContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useTeacherContext } from "@/contexts/TeacherContext";
import { TeacherContextSwitcher } from "@/components/TeacherContextSwitcher";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

const getProfessorItems = (t: any) => [
  { title: t('navigation:sidebar.dashboard'), url: "/dashboard", icon: BookOpen },
  { title: t('navigation:sidebar.students'), url: "/alunos", icon: Users },
  { title: t('navigation:sidebar.agenda'), url: "/agenda", icon: Calendar },
  { title: t('navigation:sidebar.materials'), url: "/materiais", icon: FileText },
  { title: t('navigation:sidebar.financial'), url: "/financeiro", icon: DollarSign },
  { title: "Negócios", url: "/painel/negocios", icon: Package },
  { title: t('navigation:sidebar.history'), url: "/historico", icon: Archive },
  { title: t('navigation:sidebar.cancellationPolicies'), url: "/politicas-cancelamento", icon: Settings },
];

const getAlunoItems = (t: any) => [
  { title: t('navigation:sidebar.studentPortal'), url: "/portal-do-aluno", icon: Users },
  { title: t('navigation:sidebar.myClasses'), url: "/aulas", icon: Calendar },
  { title: t('navigation:sidebar.myMaterials'), url: "/meus-materiais", icon: FileText },
  { title: t('navigation:sidebar.invoices'), url: "/faturas", icon: DollarSign },
];

interface AppSidebarProps {
  isOpen: boolean;
}

export function AppSidebar({ isOpen }: AppSidebarProps) {
  const location = useLocation();
  const { profile, isProfessor, isAluno } = useProfile();
  const { signOut, loading } = useAuth();
  const { currentPlan, hasFeature, hasTeacherFeature } = useSubscription();
  const teacherContext = isAluno ? useTeacherContext() : null;
  const currentPath = location.pathname;
  const { t } = useTranslation();
  
  const navigate = useNavigate();
  
  // Don't render role-specific content until we're sure of the user's role
  if (loading || !profile || (!isProfessor && !isAluno)) {
    return (
      <div className={`${isOpen ? 'w-64' : 'w-16'} transition-all duration-300 border-r bg-card flex-shrink-0`}>
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center border-b px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary text-white">
                <GraduationCap className="h-4 w-4" />
              </div>
              {isOpen && (
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
      </div>
    );
  }
  
  const items = isProfessor ? getProfessorItems(t) : getAlunoItems(t).filter(item => {
    // Filter financial items for students based on teacher's plan
    if (item.title === t('navigation:sidebar.invoices')) {
      return hasTeacherFeature('financial_module');
    }
    return true;
  });
  
  const isActive = (path: string) => currentPath === path;

  const handleSignOut = async () => {
    await signOut();
  };

  const handleNavigation = (url: string) => {
    // Block access to financial module for free and basic plans
    if (url === '/financeiro') {
      const hasAccess = isProfessor ? hasFeature('financial_module') : hasTeacherFeature('financial_module');
      if (!hasAccess) {
        return; // Don't navigate
      }
    }
    navigate(url);
  };

  return (
    <TooltipProvider>
      <div className={`${isOpen ? 'w-64' : 'w-16'} transition-all duration-300 border-r bg-card flex-shrink-0`}>
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center border-b px-3">
            <div className={`flex items-center ${!isOpen ? 'justify-center w-full' : 'gap-3'}`}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary text-white flex-shrink-0">
                <GraduationCap className="h-4 w-4" />
              </div>
              {isOpen && (
                <span className="text-lg font-semibold bg-gradient-primary bg-clip-text text-transparent">
                  TutorFlow
                </span>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className={`flex-1 ${!isOpen ? 'px-2' : 'px-4'} py-4`}>
        {isAluno && !isProfessor && (
          <div className="mb-4">
            <TeacherContextSwitcher />
          </div>
        )}
            {isAluno && teacherContext && teacherContext.teachers.length > 1 && isOpen && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {t('navigation:sidebar.teacher')}
                </h3>
                <TeacherContextSwitcher />
              </div>
            )}
            
            <div className="mb-6">
              <h3 className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 ${!isOpen ? "sr-only" : ""}`}>
                {isProfessor ? t('navigation:roles.professor') : t('navigation:roles.student')}
              </h3>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.title}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          onClick={() => handleNavigation(item.url)}
                           className={`flex items-center ${!isOpen ? 'justify-center w-12 h-10 px-3 py-2' : 'px-3 py-3'} rounded-lg min-h-[44px] w-full transition-all duration-200 ${
                             item.title === t('navigation:sidebar.financial') && !(isProfessor ? hasFeature('financial_module') : hasTeacherFeature('financial_module'))
                               ? 'cursor-not-allowed opacity-50' 
                               : 'cursor-pointer'
                           } ${isActive(item.url) ? 'bg-primary/20 text-primary font-semibold border border-primary/30 shadow-md backdrop-blur-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                        >
                          <item.icon className={`h-4 w-4 flex-shrink-0 text-primary`} />
                          {isOpen && (
                            <div className="flex items-center justify-between w-full ml-4">
                              <span>{item.title}</span>
                               {/* Show premium indicators */}
                               {item.title === t('navigation:sidebar.financial') && !(isProfessor ? hasFeature('financial_module') : hasTeacherFeature('financial_module')) && (
                                 <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded">
                                   {t('navigation:tooltips.premium')}
                                 </span>
                               )}
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.title}</p>
                      </TooltipContent>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </div>

            {/* Subscription Section for Professors */}
            {isProfessor && (
              <div>
                <h3 className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 ${!isOpen ? "sr-only" : ""}`}>
                  {t('navigation:sidebar.subscription')}
                </h3>
                <ul className="space-y-1">
                  <li>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          onClick={() => handleNavigation("/planos")}
                          className={`flex items-center ${!isOpen ? 'justify-center w-12 h-10 px-3 py-2' : 'px-3 py-3'} rounded-lg min-h-[44px] w-full transition-all duration-200 cursor-pointer ${isActive("/planos") ? 'bg-primary/20 text-primary font-semibold border border-primary/30 shadow-md backdrop-blur-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                        >
                          <Package className={`h-4 w-4 flex-shrink-0 text-primary`} />
                          {isOpen && <span className="ml-4">{t('navigation:sidebar.plans')}</span>}
                        </div>
                      </TooltipTrigger>
                       <TooltipContent side="right">
                         <p>{t('navigation:sidebar.plans')}</p>
                       </TooltipContent>
                    </Tooltip>
                  </li>
                  <li>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          onClick={() => handleNavigation("/subscription")}
                          className={`flex items-center ${!isOpen ? 'justify-center w-12 h-10 px-3 py-2' : 'px-3 py-3'} rounded-lg min-h-[44px] w-full transition-all duration-200 cursor-pointer ${isActive("/subscription") ? 'bg-primary/20 text-primary font-semibold border border-primary/30 shadow-md backdrop-blur-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                        >
                          <CreditCard className={`h-4 w-4 flex-shrink-0 text-primary`} />
                          {isOpen && (
                             <div className="flex items-center justify-between w-full ml-4">
                               <span>{t('navigation:sidebar.subscription')}</span>
                              {currentPlan && (
                                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                  {currentPlan.name}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                       <TooltipContent side="right">
                         <p>{t('navigation:sidebar.subscription')}</p>
                       </TooltipContent>
                    </Tooltip>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* User info and logout */}
          <div className={`border-t ${!isOpen ? 'p-3' : 'p-4'}`}>
            <div className={`flex items-center ${!isOpen ? "justify-center" : "justify-between"}`}>
              {isOpen && (
                <div className="flex flex-col">
                  <p className="text-sm font-medium">{profile?.name}</p>
                   <p className="text-xs text-muted-foreground">
                     {isProfessor ? t('navigation:roles.professor') : t('navigation:roles.student')}
                   </p>
                </div>
              )}
              {!isOpen ? (
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
                     <p>{t('navigation:tooltips.logout')}</p>
                   </TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="hover:bg-destructive hover:text-destructive-foreground"
                  title={t('navigation:tooltips.logout')}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}