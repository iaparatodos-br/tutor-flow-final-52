import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useProfile } from "@/contexts/ProfileContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle, AlertTriangle, PlayCircle, Loader2 } from "lucide-react";
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
export function PaymentRoutingTest() {
  const {
    profile
  } = useProfile();
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Buscar alunos
  const {
    data: students
  } = useQuery({
    queryKey: ["students-test"],
    queryFn: async () => {
      const {
        data
      } = await supabase.rpc('get_teacher_students', {
        teacher_user_id: profile?.id
      });
      return data as Student[];
    },
    enabled: !!profile?.id
  });

  // Executar testes de roteamento usando a edge function
  const runTestsMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const {
        data,
        error
      } = await supabase.functions.invoke('validate-payment-routing', {
        body: {
          student_id: studentId
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
    if (!selectedStudent) {
      toast.error("Selecione um aluno para executar os testes");
      return;
    }
    setIsRunning(true);
    setTestResults([]);
    runTestsMutation.mutate(selectedStudent);
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
  return;
}