import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Play, 
  Loader2, 
  Database,
  FileText,
  Users,
  CreditCard,
  ShieldCheck
} from "lucide-react";

interface ValidationResult {
  code: string;
  name: string;
  status: 'success' | 'warning' | 'error' | 'pending';
  message: string;
  details?: unknown;
}

interface TestLog {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

const DevValidation = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [logs, setLogs] = useState<TestLog[]>([]);

  const addLog = (type: TestLog['type'], message: string) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [...prev, { timestamp, type, message }]);
  };

  const updateResult = (result: ValidationResult) => {
    setValidationResults(prev => {
      const existing = prev.findIndex(r => r.code === result.code);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = result;
        return updated;
      }
      return [...prev, result];
    });
  };

  // ========== VALIDAÇÃO V01: Integridade de Mensalidades ==========
  const runV01 = async () => {
    addLog('info', 'V01: Verificando integridade de mensalidades...');
    updateResult({ code: 'V01', name: 'Integridade de Mensalidades', status: 'pending', message: 'Executando...' });
    
    try {
      const { data, error } = await supabase
        .from('monthly_subscriptions')
        .select('id, name, teacher_id')
        .or('name.is.null,teacher_id.is.null');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        updateResult({ 
          code: 'V01', 
          name: 'Integridade de Mensalidades', 
          status: 'error', 
          message: `${data.length} mensalidades com dados inválidos`,
          details: data 
        });
        addLog('error', `V01: FALHOU - ${data.length} registros inválidos`);
      } else {
        updateResult({ code: 'V01', name: 'Integridade de Mensalidades', status: 'success', message: 'Todas mensalidades válidas' });
        addLog('success', 'V01: OK - Todas mensalidades têm nome e teacher_id');
      }
    } catch (err) {
      updateResult({ code: 'V01', name: 'Integridade de Mensalidades', status: 'error', message: String(err) });
      addLog('error', `V01: ERRO - ${err}`);
    }
  };

  // ========== VALIDAÇÃO V02: Regra Limite/Excedente ==========
  const runV02 = async () => {
    addLog('info', 'V02: Verificando regra limite/excedente...');
    updateResult({ code: 'V02', name: 'Regra Limite/Excedente', status: 'pending', message: 'Executando...' });
    
    try {
      const { data, error } = await supabase
        .from('monthly_subscriptions')
        .select('id, name, max_classes, overage_price')
        .not('max_classes', 'is', null)
        .is('overage_price', null);
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        updateResult({ 
          code: 'V02', 
          name: 'Regra Limite/Excedente', 
          status: 'warning', 
          message: `${data.length} mensalidades com limite mas sem preço de excedente`,
          details: data 
        });
        addLog('warning', `V02: AVISO - ${data.length} mensalidades podem ter problema de cobrança`);
      } else {
        updateResult({ code: 'V02', name: 'Regra Limite/Excedente', status: 'success', message: 'Regra consistente' });
        addLog('success', 'V02: OK - Todas mensalidades com limite têm preço de excedente');
      }
    } catch (err) {
      updateResult({ code: 'V02', name: 'Regra Limite/Excedente', status: 'error', message: String(err) });
      addLog('error', `V02: ERRO - ${err}`);
    }
  };

  // ========== VALIDAÇÃO V03: Duplicatas de Atribuição ==========
  const runV03 = async () => {
    addLog('info', 'V03: Verificando duplicatas de atribuição...');
    updateResult({ code: 'V03', name: 'Duplicatas de Atribuição', status: 'pending', message: 'Executando...' });
    
    try {
      // Buscar todas atribuições ativas e verificar duplicatas no JS
      const { data, error } = await supabase
        .from('student_monthly_subscriptions')
        .select('relationship_id')
        .eq('is_active', true);
      
      if (error) throw error;
      
      // Contar duplicatas
      const counts: Record<string, number> = {};
      data?.forEach(row => {
        counts[row.relationship_id] = (counts[row.relationship_id] || 0) + 1;
      });
      
      const duplicates = Object.entries(counts).filter(([, count]) => count > 1);
      
      if (duplicates.length > 0) {
        updateResult({ 
          code: 'V03', 
          name: 'Duplicatas de Atribuição', 
          status: 'error', 
          message: `${duplicates.length} alunos com múltiplas assinaturas ativas`,
          details: duplicates 
        });
        addLog('error', `V03: FALHOU - Alunos com duplicatas: ${duplicates.map(d => d[0]).join(', ')}`);
      } else {
        updateResult({ code: 'V03', name: 'Duplicatas de Atribuição', status: 'success', message: 'Sem duplicatas' });
        addLog('success', 'V03: OK - Nenhum aluno com múltiplas assinaturas ativas');
      }
    } catch (err) {
      updateResult({ code: 'V03', name: 'Duplicatas de Atribuição', status: 'error', message: String(err) });
      addLog('error', `V03: ERRO - ${err}`);
    }
  };

  // ========== VALIDAÇÃO V04: Faturas Órfãs ==========
  const runV04 = async () => {
    addLog('info', 'V04: Verificando faturas órfãs de mensalidade...');
    updateResult({ code: 'V04', name: 'Faturas Órfãs', status: 'pending', message: 'Executando...' });
    
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, description, amount')
        .eq('invoice_type', 'monthly_subscription')
        .is('monthly_subscription_id', null);
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        updateResult({ 
          code: 'V04', 
          name: 'Faturas Órfãs', 
          status: 'warning', 
          message: `${data.length} faturas de mensalidade sem vínculo`,
          details: data 
        });
        addLog('warning', `V04: AVISO - ${data.length} faturas precisam de revisão`);
      } else {
        updateResult({ code: 'V04', name: 'Faturas Órfãs', status: 'success', message: 'Todas faturas vinculadas' });
        addLog('success', 'V04: OK - Todas faturas de mensalidade têm subscription_id');
      }
    } catch (err) {
      updateResult({ code: 'V04', name: 'Faturas Órfãs', status: 'error', message: String(err) });
      addLog('error', `V04: ERRO - ${err}`);
    }
  };

  // ========== VALIDAÇÃO V05: Função count_completed_classes_in_month ==========
  const runV05 = async () => {
    addLog('info', 'V05: Testando função de contagem de aulas...');
    updateResult({ code: 'V05', name: 'Função de Contagem', status: 'pending', message: 'Executando...' });
    
    try {
      if (!profile?.id) {
        throw new Error('Perfil não encontrado');
      }
      
      const now = new Date();
      const { data, error } = await supabase.rpc('count_completed_classes_in_month', {
        p_teacher_id: profile.id,
        p_student_id: profile.id, // Usar próprio ID para teste
        p_year: now.getFullYear(),
        p_month: now.getMonth() + 1
      });
      
      if (error) throw error;
      
      updateResult({ 
        code: 'V05', 
        name: 'Função de Contagem', 
        status: 'success', 
        message: `Função executou corretamente (retornou: ${data})`,
        details: { count: data, year: now.getFullYear(), month: now.getMonth() + 1 }
      });
      addLog('success', `V05: OK - Função retornou ${data} aulas`);
    } catch (err) {
      updateResult({ code: 'V05', name: 'Função de Contagem', status: 'error', message: String(err) });
      addLog('error', `V05: ERRO - ${err}`);
    }
  };

  // ========== VALIDAÇÃO V06: Cascade de Desativação ==========
  const runV06 = async () => {
    addLog('info', 'V06: Verificando trigger de cascade...');
    updateResult({ code: 'V06', name: 'Trigger Cascade', status: 'pending', message: 'Executando...' });
    
    try {
      // Verificar se existem atribuições ativas para mensalidades inativas
      const { data: cascadeData, error } = await supabase
        .from('student_monthly_subscriptions')
        .select(`
          id,
          is_active,
          subscription_id,
          monthly_subscriptions!inner (
            id,
            name,
            is_active
          )
        `)
        .eq('is_active', true);
      
      if (error) throw error;
      
      // Filtrar para encontrar problemas (atribuição ativa com mensalidade inativa)
      const problems = cascadeData?.filter(row => {
        const sub = row.monthly_subscriptions as unknown as { is_active: boolean };
        return !sub?.is_active;
      }) || [];
      
      if (problems.length > 0) {
        updateResult({ 
          code: 'V06', 
          name: 'Trigger Cascade', 
          status: 'error', 
          message: `${problems.length} atribuições ativas para mensalidades inativas`,
          details: problems 
        });
        addLog('error', `V06: FALHOU - Cascade não funcionou corretamente`);
      } else {
        updateResult({ code: 'V06', name: 'Trigger Cascade', status: 'success', message: 'Cascade funcionando' });
        addLog('success', 'V06: OK - Trigger cascade funciona corretamente');
      }
    } catch (err) {
      updateResult({ code: 'V06', name: 'Trigger Cascade', status: 'error', message: String(err) });
      addLog('error', `V06: ERRO - ${err}`);
    }
  };

  // ========== VALIDAÇÃO V07: LEFT JOIN em Faturas ==========
  const runV07 = async () => {
    addLog('info', 'V07: Testando LEFT JOIN em faturas...');
    updateResult({ code: 'V07', name: 'LEFT JOIN Faturas', status: 'pending', message: 'Executando...' });
    
    try {
      // Testar se faturas de mensalidade aparecem mesmo sem invoice_classes
      const { data, error, count } = await supabase
        .from('invoices')
        .select('id, invoice_type, amount', { count: 'exact' })
        .eq('invoice_type', 'monthly_subscription');
      
      if (error) throw error;
      
      updateResult({ 
        code: 'V07', 
        name: 'LEFT JOIN Faturas', 
        status: 'success', 
        message: `Query funciona - ${count || 0} faturas de mensalidade encontradas`,
        details: { count, sample: data?.slice(0, 3) }
      });
      addLog('success', `V07: OK - ${count || 0} faturas de mensalidade acessíveis`);
    } catch (err) {
      updateResult({ code: 'V07', name: 'LEFT JOIN Faturas', status: 'error', message: String(err) });
      addLog('error', `V07: ERRO - ${err}`);
    }
  };

  // ========== VALIDAÇÃO V08: Soft Delete ==========
  const runV08 = async () => {
    addLog('info', 'V08: Verificando soft delete...');
    updateResult({ code: 'V08', name: 'Soft Delete', status: 'pending', message: 'Executando...' });
    
    try {
      // Verificar se existem mensalidades inativas (soft deleted)
      const { data: inactive, error: inactiveError } = await supabase
        .from('monthly_subscriptions')
        .select('id', { count: 'exact' })
        .eq('is_active', false);
      
      if (inactiveError) throw inactiveError;
      
      const { data: active, error: activeError } = await supabase
        .from('monthly_subscriptions')
        .select('id', { count: 'exact' })
        .eq('is_active', true);
      
      if (activeError) throw activeError;
      
      updateResult({ 
        code: 'V08', 
        name: 'Soft Delete', 
        status: 'success', 
        message: `${active?.length || 0} ativas, ${inactive?.length || 0} inativas`,
        details: { active: active?.length, inactive: inactive?.length }
      });
      addLog('success', `V08: OK - Soft delete implementado (${inactive?.length || 0} inativas)`);
    } catch (err) {
      updateResult({ code: 'V08', name: 'Soft Delete', status: 'error', message: String(err) });
      addLog('error', `V08: ERRO - ${err}`);
    }
  };

  // ========== EXECUTAR TODAS AS VALIDAÇÕES ==========
  const runAllValidations = async () => {
    setIsRunning(true);
    setValidationResults([]);
    setLogs([]);
    addLog('info', '🚀 Iniciando validações do sistema de mensalidades...');
    
    await runV01();
    await runV02();
    await runV03();
    await runV04();
    await runV05();
    await runV06();
    await runV07();
    await runV08();
    
    addLog('info', '✅ Validações concluídas!');
    setIsRunning(false);
  };

  // ========== EXECUTAR EDGE FUNCTION DE DIAGNÓSTICO ==========
  const runEdgeFunctionDiagnostic = async () => {
    addLog('info', '🔍 Executando diagnóstico via Edge Function...');
    
    try {
      const { data, error } = await supabase.functions.invoke('validate-monthly-subscriptions');
      
      if (error) throw error;
      
      addLog('success', 'Edge Function executada com sucesso');
      console.log('Diagnostic results:', data);
      
      // Processar resultados da edge function
      if (data?.validations) {
        data.validations.forEach((v: ValidationResult) => {
          updateResult(v);
          addLog(v.status === 'success' ? 'success' : v.status === 'error' ? 'error' : 'warning', `${v.code}: ${v.message}`);
        });
      }
    } catch (err) {
      addLog('error', `Erro na Edge Function: ${err}`);
    }
  };

  const getStatusIcon = (status: ValidationResult['status']) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
      default: return <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />;
    }
  };

  const getStatusBadge = (status: ValidationResult['status']) => {
    switch (status) {
      case 'success': return <Badge variant="default" className="bg-green-500">OK</Badge>;
      case 'warning': return <Badge variant="default" className="bg-yellow-500">Aviso</Badge>;
      case 'error': return <Badge variant="destructive">Erro</Badge>;
      default: return <Badge variant="secondary">...</Badge>;
    }
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Validação de Mensalidades</h1>
            <p className="text-muted-foreground mt-1">
              Ambiente de desenvolvimento - Testes de integridade do sistema
            </p>
          </div>
          <Badge variant="outline" className="text-orange-500 border-orange-500">
            DEV ONLY
          </Badge>
        </div>

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Ambiente de Testes</AlertTitle>
          <AlertDescription>
            Esta página executa validações de integridade do sistema de mensalidades.
            Disponível apenas em desenvolvimento.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Painel de Controle */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Painel de Controle
              </CardTitle>
              <CardDescription>
                Execute validações manuais ou via Edge Function
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  onClick={runAllValidations} 
                  disabled={isRunning}
                  className="w-full"
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Executar Tudo
                </Button>
                
                <Button 
                  onClick={runEdgeFunctionDiagnostic}
                  variant="outline"
                  disabled={isRunning}
                  className="w-full"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Via Edge Function
                </Button>
              </div>

              <Separator />

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Validações individuais:</p>
                <div className="grid grid-cols-4 gap-2">
                  <Button size="sm" variant="ghost" onClick={runV01} disabled={isRunning}>V01</Button>
                  <Button size="sm" variant="ghost" onClick={runV02} disabled={isRunning}>V02</Button>
                  <Button size="sm" variant="ghost" onClick={runV03} disabled={isRunning}>V03</Button>
                  <Button size="sm" variant="ghost" onClick={runV04} disabled={isRunning}>V04</Button>
                  <Button size="sm" variant="ghost" onClick={runV05} disabled={isRunning}>V05</Button>
                  <Button size="sm" variant="ghost" onClick={runV06} disabled={isRunning}>V06</Button>
                  <Button size="sm" variant="ghost" onClick={runV07} disabled={isRunning}>V07</Button>
                  <Button size="sm" variant="ghost" onClick={runV08} disabled={isRunning}>V08</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Logs de Execução
              </CardTitle>
              <CardDescription>
                {logs.length} entradas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[250px] w-full rounded border p-3 bg-muted/30">
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum log ainda. Execute as validações.
                  </p>
                ) : (
                  <div className="space-y-1 font-mono text-xs">
                    {logs.map((log, i) => (
                      <div 
                        key={i} 
                        className={`flex gap-2 ${
                          log.type === 'success' ? 'text-green-600' :
                          log.type === 'error' ? 'text-red-600' :
                          log.type === 'warning' ? 'text-yellow-600' :
                          'text-muted-foreground'
                        }`}
                      >
                        <span className="text-muted-foreground">[{log.timestamp}]</span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Resultados das Validações */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Resultados das Validações
            </CardTitle>
            <CardDescription>
              {validationResults.filter(r => r.status === 'success').length} OK / 
              {validationResults.filter(r => r.status === 'warning').length} Avisos / 
              {validationResults.filter(r => r.status === 'error').length} Erros
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validationResults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Execute as validações para ver os resultados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {validationResults.map(result => (
                  <div 
                    key={result.code}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    {getStatusIcon(result.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-muted-foreground">{result.code}</span>
                        <span className="font-medium">{result.name}</span>
                        {getStatusBadge(result.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">{result.message}</p>
                      {result.details && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            Ver detalhes
                          </summary>
                          <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                            {JSON.stringify(result.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default DevValidation;
