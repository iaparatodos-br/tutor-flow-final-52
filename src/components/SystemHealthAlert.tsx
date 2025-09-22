import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, Users, Building2 } from "lucide-react";
import { toast } from "sonner";

interface SystemHealthIssue {
  type: "critical" | "warning" | "info";
  title: string;
  description: string;
  count?: number;
  action?: () => void;
  actionText?: string;
}

export function SystemHealthAlert() {
  const { profile, isProfessor } = useProfile();
  const [issues, setIssues] = useState<SystemHealthIssue[]>([]);

  // Query para verificar alunos sem business profile
  const { data: orphanStudents, isLoading } = useQuery({
    queryKey: ["system-health-orphan-students", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      
      const { data } = await supabase.rpc('get_teacher_students', { 
        teacher_user_id: profile.id 
      });
      
      return data?.filter((student: any) => !student.business_profile_id) || [];
    },
    enabled: isProfessor && !!profile?.id,
    refetchInterval: 30000, // Atualiza a cada 30 segundos
  });

  // Query para verificar business profiles com problemas no Stripe
  const { data: businessProfiles } = useQuery({
    queryKey: ["system-health-business-profiles", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      
      const { data, error } = await supabase.functions.invoke("list-business-profiles");
      if (error) throw error;
      return data.business_profiles || [];
    },
    enabled: isProfessor && !!profile?.id,
  });

  useEffect(() => {
    if (!isProfessor || isLoading) return;

    const newIssues: SystemHealthIssue[] = [];

    // Verificar alunos órfãos (sem business profile)
    if (orphanStudents && orphanStudents.length > 0) {
      newIssues.push({
        type: "critical",
        title: "Alunos sem Negócio Vinculado",
        description: `${orphanStudents.length} aluno(s) não possuem negócio definido para roteamento de pagamentos. Isso pode causar falhas no processamento de faturas.`,
        count: orphanStudents.length,
      });
    }

    // Verificar business profiles sem Stripe ou com problemas
    if (businessProfiles && businessProfiles.length === 0) {
      newIssues.push({
        type: "warning",
        title: "Nenhum Negócio Configurado",
        description: "Você não possui nenhum perfil de negócio configurado. Isso limitará suas opções de recebimento de pagamentos.",
      });
    }

    setIssues(newIssues);
  }, [orphanStudents, businessProfiles, isProfessor, isLoading]);

  if (!isProfessor || issues.length === 0) {
    return null;
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "critical":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      default:
        return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
  };

  const getVariant = (type: string) => {
    switch (type) {
      case "critical":
        return "destructive" as const;
      case "warning":
        return "default" as const;
      default:
        return "default" as const;
    }
  };

  return (
    <Card className="border-l-4 border-l-yellow-500 mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          Alertas do Sistema
        </CardTitle>
        <CardDescription>
          Problemas identificados que podem afetar o funcionamento da plataforma
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {issues.map((issue, index) => (
          <Alert key={index} variant={getVariant(issue.type)}>
            <div className="flex items-start gap-3">
              {getIcon(issue.type)}
              <div className="flex-1">
                <AlertTitle className="flex items-center gap-2">
                  {issue.title}
                  {issue.count && (
                    <Badge variant="outline">{issue.count}</Badge>
                  )}
                </AlertTitle>
                <AlertDescription className="mt-1">
                  {issue.description}
                </AlertDescription>
                {issue.action && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={issue.action}
                  >
                    {issue.actionText || "Resolver"}
                  </Button>
                )}
              </div>
            </div>
          </Alert>
        ))}
      </CardContent>
    </Card>
  );
}