import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SecurityTestResult {
  test_name: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
}

interface SecurityAuditReport {
  overall_status: 'SECURE' | 'WARNING' | 'CRITICAL';
  timestamp: string;
  tests: SecurityTestResult[];
  recommendations: string[];
}

interface SecurityAlert {
  id: string;
  action: string;
  resource_type: string;
  security_level: string; // Mudado para string para aceitar qualquer valor do banco
  created_at: string;
  details?: any;
}

export function useSecurityMonitoring() {
  const queryClient = useQueryClient();

  // Executar auditoria de segurança
  const runSecurityAudit = useMutation({
    mutationFn: async (): Promise<SecurityAuditReport> => {
      const { data, error } = await supabase.functions.invoke('security-rls-audit');
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.overall_status === 'CRITICAL') {
        toast.error('Auditoria de segurança detectou problemas críticos!');
      } else if (data.overall_status === 'WARNING') {
        toast.warning('Auditoria de segurança detectou alguns avisos.');
      } else {
        toast.success('Auditoria de segurança concluída com sucesso!');
      }
      
      // Invalidar queries relacionadas à segurança
      queryClient.invalidateQueries({ queryKey: ['security-alerts'] });
    },
    onError: (error: any) => {
      toast.error(`Erro na auditoria de segurança: ${error?.message || 'Erro desconhecido'}`);
    },
  });

  // Buscar alertas de segurança recentes
  const { data: securityAlerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['security-alerts'],
    queryFn: async (): Promise<SecurityAlert[]> => {
      const { data, error } = await supabase
        .from('security_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });

  // Verificar status geral de segurança
  const { data: securityStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['security-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('validate_rls_policies');
      
      if (error) throw error;
      
      const criticalIssues = data.filter((table: any) => 
        table.security_status.includes('CRITICAL')
      );
      
      const warningIssues = data.filter((table: any) => 
        table.security_status.includes('WARNING')
      );

      return {
        critical_count: criticalIssues.length,
        warning_count: warningIssues.length,
        total_tables: data.length,
        status: criticalIssues.length > 0 ? 'CRITICAL' : 
                warningIssues.length > 0 ? 'WARNING' : 'SECURE'
      };
    },
    refetchInterval: 300000, // Atualizar a cada 5 minutos
  });

  // Função para marcar um alerta como lido/resolvido
  const markAlertAsRead = useMutation({
    mutationFn: async (alertId: string) => {
      await supabase.rpc('log_security_event', {
        p_action: 'alert_acknowledged',
        p_resource_type: 'security_alert',
        p_resource_id: alertId,
        p_security_level: 'info'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-alerts'] });
    },
  });

  // Contar alertas críticos não lidos
  const criticalAlertsCount = securityAlerts?.filter(
    alert => alert.security_level === 'critical'
  ).length || 0;

  const warningAlertsCount = securityAlerts?.filter(
    alert => alert.security_level === 'warning'
  ).length || 0;

  return {
    // Auditoria
    runSecurityAudit: runSecurityAudit.mutate,
    isRunningAudit: runSecurityAudit.isPending,
    auditError: runSecurityAudit.error,
    
    // Alertas
    securityAlerts,
    alertsLoading,
    criticalAlertsCount,
    warningAlertsCount,
    markAlertAsRead: markAlertAsRead.mutate,
    
    // Status geral
    securityStatus,
    statusLoading,
    
    // Funções utilitárias
    hasSecurityIssues: (securityStatus?.critical_count || 0) > 0,
    hasWarnings: (securityStatus?.warning_count || 0) > 0,
    isSecure: securityStatus?.status === 'SECURE',
  };
}