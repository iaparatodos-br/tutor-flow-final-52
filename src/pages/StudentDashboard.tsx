import { useEffect, useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { useTeacherContext } from "@/contexts/TeacherContext";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, Clock, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface TeacherPolicyData {
  id: string;
  name: string;
  policy_document_url: string | null;
  cancellation_policy: {
    hours_before_class: number;
    charge_percentage: number;
    allow_amnesty: boolean;
  } | null;
}

export default function StudentDashboard() {
  const { profile, isAluno } = useProfile();
  const { selectedTeacherId } = useTeacherContext();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [teacherData, setTeacherData] = useState<TeacherPolicyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedTeacherId) {
      loadTeacherData();
    }
  }, [selectedTeacherId]);

  const loadTeacherData = async () => {
    if (!selectedTeacherId) return;

    setLoading(true);
    try {
      // Load teacher profile data
      const { data: teacherProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, policy_document_url')
        .eq('id', selectedTeacherId)
        .maybeSingle();

      if (profileError) {
        console.error('Erro ao buscar perfil do professor:', profileError);
        throw profileError;
      }

      if (!teacherProfile) {
        throw new Error('Professor não encontrado');
      }

      // Load teacher's cancellation policy
      const { data: policy, error: policyError } = await supabase
        .from('cancellation_policies')
        .select('hours_before_class, charge_percentage, allow_amnesty')
        .eq('teacher_id', selectedTeacherId)
        .eq('is_active', true)
        .maybeSingle();

      if (policyError && policyError.code !== 'PGRST116') {
        throw policyError;
      }

      setTeacherData({
        ...teacherProfile,
        cancellation_policy: policy
      });
    } catch (error) {
      console.error('Erro ao carregar dados do professor:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as informações do professor.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadPolicyDocument = async () => {
    if (!teacherData?.policy_document_url) return;

    try {
      const { data, error } = await supabase.storage
        .from('policies')
        .download(teacherData.policy_document_url);

      if (error) throw error;

      // Create download link
      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `politica-${teacherData.name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Sucesso",
        description: "Download iniciado com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao baixar documento:', error);
      toast({
        title: "Erro",
        description: "Não foi possível baixar o documento.",
        variant: "destructive",
      });
    }
  };

  if (!isAluno) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Acesso Restrito</h1>
          <p className="text-muted-foreground">
            Esta página é exclusiva para alunos.
          </p>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!teacherData) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Nenhum Professor Selecionado</h1>
          <p className="text-muted-foreground">
            Por favor, selecione um professor no menu lateral.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Portal do Aluno</h1>
          <p className="text-muted-foreground">
            Informações e políticas do professor {teacherData.name}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Política de Cancelamento
            </CardTitle>
            <CardDescription>
              Termos e condições para cancelamento de aulas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {teacherData.cancellation_policy ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p><strong>Política atual do professor {teacherData.name}:</strong></p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>
                        Cancelamentos devem ser feitos com pelo menos{' '}
                        <strong>{teacherData.cancellation_policy.hours_before_class} horas</strong> de antecedência
                      </li>
                      <li>
                        Cancelamentos tardios serão cobrados em{' '}
                        <strong>{teacherData.cancellation_policy.charge_percentage}%</strong> do valor da aula
                      </li>
                      <li>
                        Anistia {teacherData.cancellation_policy.allow_amnesty ? "permitida" : "não permitida"} pelo professor
                      </li>
                      <li>Cancelamentos pelo professor são sempre gratuitos para o aluno</li>
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  O professor ainda não configurou uma política de cancelamento específica.
                </AlertDescription>
              </Alert>
            )}

            {teacherData.policy_document_url && (
              <div className="mt-4 pt-4 border-t">
                <Button onClick={downloadPolicyDocument} className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Baixar Política Completa (PDF)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {teacherData.policy_document_url && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Documento da Política
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Política Completa de Aulas</p>
                    <p className="text-sm text-muted-foreground">
                      Documento fornecido por {teacherData.name}
                    </p>
                  </div>
                </div>
                <Button onClick={downloadPolicyDocument} size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Baixar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}