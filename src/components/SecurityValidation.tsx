/**
 * Componente de Validação de Segurança para Páginas do Aluno
 * 
 * Este componente fornece validação automática de segurança
 * e auditoria para páginas que acessam dados contextualizados
 */

import React, { useEffect, useState } from 'react';
import { useTeacherContext } from '@/contexts/TeacherContext';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, CheckCircle } from 'lucide-react';

interface SecurityValidationProps {
  /** Nome da página para auditoria */
  pageName: string;
  /** Tipo de recurso sendo acessado */
  resourceType: string;
  /** Se deve validar permissões financeiras */
  requiresFinancialAccess?: boolean;
  /** Callback executado após validação bem-sucedida */
  onValidationSuccess?: () => void;
  /** Callback executado em caso de falha na validação */
  onValidationFailure?: (error: string) => void;
  /** Filhos que só serão renderizados após validação */
  children: React.ReactNode;
}

interface SecurityCheck {
  name: string;
  status: 'pending' | 'success' | 'error';
  message: string;
}

export const SecurityValidation: React.FC<SecurityValidationProps> = ({
  pageName,
  resourceType,
  requiresFinancialAccess = false,
  onValidationSuccess,
  onValidationFailure,
  children
}) => {
  const { selectedTeacherId, teachers, loading: contextLoading } = useTeacherContext();
  const [validationComplete, setValidationComplete] = useState(false);
  const [securityChecks, setSecurityChecks] = useState<SecurityCheck[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!contextLoading && selectedTeacherId) {
      performSecurityValidation();
    }
  }, [selectedTeacherId, contextLoading]);

  const performSecurityValidation = async () => {
    const checks: SecurityCheck[] = [
      { name: 'Contexto de Professor', status: 'pending', message: 'Validando contexto...' },
      { name: 'Relacionamento Válido', status: 'pending', message: 'Verificando relacionamento...' },
      { name: 'Permissões RLS', status: 'pending', message: 'Testando Row Level Security...' },
    ];

    if (requiresFinancialAccess) {
      checks.push({ name: 'Acesso Financeiro', status: 'pending', message: 'Validando módulo financeiro...' });
    }

    setSecurityChecks([...checks]);

    try {
      // 1. Validar contexto de professor
      await updateCheck(0, 'success', 'Contexto válido');

      // 2. Validar relacionamento professor-aluno
      const { data: relationship, error: relationshipError } = await supabase
        .from('teacher_student_relationships')
        .select('id, teacher_id, student_id')
        .eq('teacher_id', selectedTeacherId)
        .single();

      if (relationshipError || !relationship) {
        await updateCheck(1, 'error', 'Relacionamento não encontrado');
        throw new Error('Relacionamento professor-aluno inválido');
      }

      await updateCheck(1, 'success', 'Relacionamento válido');

      // 3. Testar RLS - tentar acessar dados básicos
      const { data: testData, error: rlsError } = await supabase
        .from('classes')
        .select('id, teacher_id')
        .eq('teacher_id', selectedTeacherId)
        .limit(1);

      if (rlsError) {
        await updateCheck(2, 'error', `RLS falhou: ${rlsError.message}`);
        throw new Error('Falha na validação de Row Level Security');
      }

      // Verificar se os dados retornados são do professor correto
      if (testData?.some(item => item.teacher_id !== selectedTeacherId)) {
        await updateCheck(2, 'error', 'Vazamento de dados detectado');
        throw new Error('Violação de segurança: dados de outros professores detectados');
      }

      await updateCheck(2, 'success', 'RLS funcionando corretamente');

      // 4. Validar acesso financeiro se necessário
      if (requiresFinancialAccess) {
        const { data: subscription } = await supabase
          .from('user_subscriptions')
          .select(`
            *,
            subscription_plans!inner(features)
          `)
          .eq('user_id', selectedTeacherId)
          .eq('status', 'active')
          .single();

        const features = subscription?.subscription_plans?.features as any;
        const hasFinancialModule = features?.financial_module === true;

        if (!hasFinancialModule) {
          await updateCheck(3, 'error', 'Módulo financeiro não disponível');
          throw new Error('Acesso ao módulo financeiro negado');
        }

        await updateCheck(3, 'success', 'Acesso financeiro autorizado');
      }

      // Log de auditoria para acesso bem-sucedido
      await supabase.functions.invoke('audit-logger', {
        body: {
          action: 'PAGE_ACCESS',
          resource_type: resourceType,
          resource_id: selectedTeacherId,
          details: {
            page_name: pageName,
            teacher_context: selectedTeacherId,
            requires_financial_access: requiresFinancialAccess,
            validation_checks_passed: checks.length
          }
        }
      });

      setValidationComplete(true);
      onValidationSuccess?.();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido na validação';
      setValidationError(errorMessage);
      onValidationFailure?.(errorMessage);

      // Log de auditoria para falha de segurança
      await supabase.functions.invoke('audit-logger', {
        body: {
          action: 'SECURITY_VIOLATION',
          resource_type: resourceType,
          resource_id: selectedTeacherId || 'unknown',
          details: {
            page_name: pageName,
            error_message: errorMessage,
            teacher_context: selectedTeacherId,
            requires_financial_access: requiresFinancialAccess
          }
        }
      });
    }
  };

  const updateCheck = async (index: number, status: 'success' | 'error', message: string) => {
    setSecurityChecks(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status, message };
      return updated;
    });
    
    // Pequeno delay para visualização
    await new Promise(resolve => setTimeout(resolve, 300));
  };

  // Estados de loading
  if (contextLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Shield className="h-8 w-8 animate-pulse mx-auto mb-2" />
          <p>Inicializando contexto de segurança...</p>
        </div>
      </div>
    );
  }

  if (!selectedTeacherId) {
    return (
      <Alert className="m-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Selecione um professor para acessar esta página.
        </AlertDescription>
      </Alert>
    );
  }

  if (validationError) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Erro de Segurança:</strong> {validationError}
        </AlertDescription>
      </Alert>
    );
  }

  if (!validationComplete) {
    return (
      <div className="p-6">
        <div className="flex items-center mb-4">
          <Shield className="h-5 w-5 mr-2" />
          <h3 className="text-lg font-medium">Validando Segurança</h3>
        </div>
        
        <div className="space-y-3">
          {securityChecks.map((check, index) => (
            <div key={index} className="flex items-center space-x-3">
              {check.status === 'pending' && (
                <div className="h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
              )}
              {check.status === 'success' && (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
              {check.status === 'error' && (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              )}
              
              <div className="flex-1">
                <p className="text-sm font-medium">{check.name}</p>
                <p className={`text-xs ${
                  check.status === 'error' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {check.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Renderizar conteúdo após validação bem-sucedida
  return <>{children}</>;
};

/**
 * Hook para validação de segurança em tempo real
 */
export const useSecurityMonitoring = (resourceType: string, pageName: string) => {
  const { selectedTeacherId } = useTeacherContext();
  const [violations, setViolations] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedTeacherId) return;

    const startTime = Date.now();

    return () => {
      // Log do tempo de permanência na página
      const duration = Date.now() - startTime;
      
      supabase.functions.invoke('audit-logger', {
        body: {
          action: 'PAGE_EXIT',
          resource_type: resourceType,
          resource_id: selectedTeacherId,
          details: {
            page_name: pageName,
            duration_ms: duration,
            violations_detected: violations.length
          }
        }
      });
    };
  }, [selectedTeacherId, resourceType, pageName, violations]);

  const reportViolation = (violation: string) => {
    setViolations(prev => [...prev, violation]);
    
    supabase.functions.invoke('audit-logger', {
      body: {
        action: 'SECURITY_VIOLATION',
        resource_type: resourceType,
        resource_id: selectedTeacherId || 'unknown',
        details: {
          page_name: pageName,
          violation_type: violation,
          teacher_context: selectedTeacherId
        }
      }
    });
  };

  return { violations, reportViolation };
};

export default SecurityValidation;