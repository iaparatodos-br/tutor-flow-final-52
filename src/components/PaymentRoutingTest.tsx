import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useProfile } from "@/contexts/ProfileContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle, AlertTriangle, PlayCircle, Loader2, Users, Baby } from "lucide-react";

interface TestResult {
  test_name: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  details?: any;
}

interface Student {
  student_id: string;
  student_name: string;
  business_profile_id: string | null;
  relationship_id: string;
}

interface Dependent {
  id: string;
  name: string;
  responsible_id: string;
  responsible_name?: string;
}

export function PaymentRoutingTest() {
  const { profile } = useProfile();
  const [selectedEntity, setSelectedEntity] = useState<string>("");
  const [entityType, setEntityType] = useState<'student' | 'dependent'>('student');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Buscar alunos
  const { data: students } = useQuery({
    queryKey: ["students-test", profile?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_teacher_students', {
        teacher_user_id: profile?.id
      });
      return data as Student[];
    },
    enabled: !!profile?.id
  });

  // Buscar dependentes
  const { data: dependents } = useQuery({
    queryKey: ["dependents-test", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      
      const { data: deps } = await supabase
        .from('dependents')
        .select('id, name, responsible_id')
        .eq('teacher_id', profile.id);

      if (!deps || deps.length === 0) return [];

      // Buscar nomes dos responsáveis
      const responsibleIds = [...new Set(deps.map(d => d.responsible_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', responsibleIds);

      const responsibleMap = new Map(profiles?.map(p => [p.id, p.name]) || []);

      return deps.map(d => ({
        ...d,
        responsible_name: responsibleMap.get(d.responsible_id) || 'Desconhecido'
      })) as Dependent[];
    },
    enabled: !!profile?.id
  });

  // Executar testes de roteamento usando a edge function
  const runTestsMutation = useMutation({
    mutationFn: async ({ studentId, dependentId }: { studentId: string; dependentId?: string }) => {
      const { data, error } = await supabase.functions.invoke('validate-payment-routing', {
        body: {
          student_id: studentId,
          dependent_id: dependentId
        }
      });
      if (error) {
        throw new Error(error.message);
      }
      return data.results as TestResult[];
    },
    onSuccess: results => {
      setTestResults(results);
      const hasErrors = results.some(r => r.status === 'error');
      const hasWarnings = results.some(r => r.status === 'warning');
      if (hasErrors) {
        toast.error("Testes concluídos com erros");
      } else if (hasWarnings) {
        toast.warning("Testes concluídos com avisos");
      } else {
        toast.success("Todos os testes passaram!");
      }
    },
    onError: (error: any) => {
      toast.error(`Erro ao executar testes: ${error.message}`);
    },
    onSettled: () => {
      setIsRunning(false);
    }
  });

  const handleRunTests = () => {
    if (!selectedEntity) {
      toast.error("Selecione um aluno ou dependente para executar os testes");
      return;
    }
    setIsRunning(true);
    setTestResults([]);

    if (entityType === 'dependent') {
      // Para dependentes, encontrar o responsável e passar ambos IDs
      const dependent = dependents?.find(d => d.id === selectedEntity);
      if (dependent) {
        runTestsMutation.mutate({ 
          studentId: dependent.responsible_id, 
          dependentId: dependent.id 
        });
      }
    } else {
      runTestsMutation.mutate({ studentId: selectedEntity });
    }
  };

  const handleSelectChange = (value: string) => {
    // Determinar se é aluno ou dependente pelo prefixo
    if (value.startsWith('dep_')) {
      setEntityType('dependent');
      setSelectedEntity(value.replace('dep_', ''));
    } else {
      setEntityType('student');
      setSelectedEntity(value);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-100 text-green-800">Sucesso</Badge>;
      case 'error':
        return <Badge variant="destructive">Erro</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Aviso</Badge>;
      default:
        return null;
    }
  };

  const getCurrentValue = () => {
    if (!selectedEntity) return "";
    return entityType === 'dependent' ? `dep_${selectedEntity}` : selectedEntity;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5" />
          Testes de Integridade de Pagamentos
        </CardTitle>
        <CardDescription>
          Valida o roteamento correto de pagamentos para contas Stripe Connect (alunos e dependentes)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <Select value={getCurrentValue()} onValueChange={handleSelectChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um aluno ou dependente" />
              </SelectTrigger>
              <SelectContent>
                {students && students.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="flex items-center gap-2">
                      <Users className="h-3 w-3" />
                      Alunos
                    </SelectLabel>
                    {students.map((student) => (
                      <SelectItem key={student.student_id} value={student.student_id}>
                        {student.student_name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {dependents && dependents.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="flex items-center gap-2">
                      <Users className="h-3 w-3" />
                      Dependentes
                    </SelectLabel>
                    {dependents.map((dependent) => (
                      <SelectItem key={`dep_${dependent.id}`} value={`dep_${dependent.id}`}>
                        <span className="flex items-center gap-1.5">
                          <Baby className="h-3.5 w-3.5 text-purple-600" />
                          {dependent.name}
                          <span className="text-muted-foreground">(resp: {dependent.responsible_name})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button 
            onClick={handleRunTests}
            disabled={!selectedEntity || isRunning}
          >
            {isRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Executar Testes
          </Button>
        </div>

        {entityType === 'dependent' && selectedEntity && (
          <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
            💡 Testando dependente: a cobrança será roteada para o responsável
          </div>
        )}

        {testResults.length > 0 && (
          <div className="space-y-2 mt-4">
            <h4 className="font-semibold text-sm">Resultados:</h4>
            {testResults.map((result, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 border rounded-lg"
              >
                <div className="mt-0.5">{getStatusIcon(result.status)}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{result.test_name}</span>
                    {getStatusBadge(result.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{result.message}</p>
                  {result.details && (
                    <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-x-auto">
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}