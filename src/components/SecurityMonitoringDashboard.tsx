import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useSecurityMonitoring } from '@/hooks/useSecurityMonitoring';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  Eye, 
  Play,
  Clock,
  Database,
  Users,
  Lock
} from 'lucide-react';

export function SecurityMonitoringDashboard() {
  const {
    runSecurityAudit,
    isRunningAudit,
    securityAlerts,
    alertsLoading,
    criticalAlertsCount,
    warningAlertsCount,
    securityStatus,
    statusLoading,
    hasSecurityIssues,
    hasWarnings,
    isSecure,
    markAlertAsRead
  } = useSecurityMonitoring();

  const getStatusIcon = () => {
    if (hasSecurityIssues) return <ShieldAlert className="h-6 w-6 text-red-500" />;
    if (hasWarnings) return <AlertTriangle className="h-6 w-6 text-yellow-500" />;
    return <ShieldCheck className="h-6 w-6 text-green-500" />;
  };

  const getStatusColor = (): "default" | "destructive" | "secondary" | "outline" => {
    if (hasSecurityIssues) return 'destructive';
    if (hasWarnings) return 'outline';
    return 'secondary';
  };

  const getStatusText = () => {
    if (hasSecurityIssues) return 'Problemas Críticos Detectados';
    if (hasWarnings) return 'Avisos de Segurança';
    return 'Sistema Seguro';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const getAlertIcon = (level: string) => {
    switch (level) {
      case 'critical': return <ShieldAlert className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Eye className="h-4 w-4 text-blue-500" />;
    }
  };

  const getAlertBadgeVariant = (level: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (level) {
      case 'critical': return 'destructive';
      case 'warning': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Monitoramento de Segurança</h2>
          <p className="text-muted-foreground">
            Auditoria e monitoramento de segurança do sistema
          </p>
        </div>
        <Button
          onClick={() => runSecurityAudit()}
          disabled={isRunningAudit}
          size="lg"
        >
          {isRunningAudit ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
              Executando Auditoria...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Executar Auditoria
            </>
          )}
        </Button>
      </div>

      {/* Status Geral */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Status de Segurança
          </CardTitle>
          <CardDescription>
            Visão geral do estado de segurança do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon()}
                <div>
                  <h3 className="font-semibold">{getStatusText()}</h3>
                  <p className="text-sm text-muted-foreground">
                    {securityStatus?.total_tables} tabelas monitoradas
                  </p>
                </div>
              </div>
              <Badge variant={getStatusColor()}>
                {securityStatus?.status || 'VERIFICANDO'}
              </Badge>
            </div>
          )}

          {securityStatus && (
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-500">
                  {securityStatus.critical_count}
                </div>
                <div className="text-sm text-muted-foreground">Críticos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-500">
                  {securityStatus.warning_count}
                </div>
                <div className="text-sm text-muted-foreground">Avisos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">
                  {securityStatus.total_tables - securityStatus.critical_count - securityStatus.warning_count}
                </div>
                <div className="text-sm text-muted-foreground">Seguros</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alertas Críticos */}
      {hasSecurityIssues && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Ação Imediata Necessária</AlertTitle>
          <AlertDescription>
            Foram detectados {criticalAlertsCount} problemas críticos de segurança que requerem atenção imediata.
            Execute uma auditoria completa para ver detalhes.
          </AlertDescription>
        </Alert>
      )}

      {/* Alertas de Segurança Recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Alertas Recentes
            {(criticalAlertsCount > 0 || warningAlertsCount > 0) && (
              <Badge variant="destructive" className="ml-2">
                {criticalAlertsCount + warningAlertsCount}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Eventos de segurança detectados pelo sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alertsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : securityAlerts && securityAlerts.length > 0 ? (
            <div className="space-y-3">
              {securityAlerts.slice(0, 10).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-start gap-3">
                    {getAlertIcon(alert.security_level)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{alert.action}</span>
                        <Badge 
                          variant={getAlertBadgeVariant(alert.security_level)}
                        >
                          {alert.security_level.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {alert.resource_type}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {formatDate(alert.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {alert.security_level === 'critical' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markAlertAsRead(alert.id)}
                    >
                      Reconhecer
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ShieldCheck className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-muted-foreground">
                Nenhum alerta de segurança recente
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recomendações de Segurança */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Recomendações de Segurança
          </CardTitle>
          <CardDescription>
            Melhores práticas e configurações recomendadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Proteção de Senha Desabilitada</AlertTitle>
              <AlertDescription>
                A proteção contra senhas vazadas está desabilitada. 
                Recomendamos habilitar esta funcionalidade nas configurações de Auth do Supabase.
                <br />
                <Button variant="link" className="p-0 h-auto mt-2" asChild>
                  <a 
                    href="https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver documentação →
                  </a>
                </Button>
              </AlertDescription>
            </Alert>

            <div className="grid gap-3">
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Database className="h-5 w-5 text-blue-500" />
                <div>
                  <h4 className="font-medium">Row Level Security (RLS)</h4>
                  <p className="text-sm text-muted-foreground">
                    Todas as tabelas com dados sensíveis têm RLS habilitado
                  </p>
                </div>
                <Badge variant="secondary">Ativo</Badge>
              </div>

              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Users className="h-5 w-5 text-green-500" />
                <div>
                  <h4 className="font-medium">Isolamento de Dados</h4>
                  <p className="text-sm text-muted-foreground">
                    Professores não podem acessar dados de outros professores
                  </p>
                </div>
                <Badge variant="secondary">Implementado</Badge>
              </div>

              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Eye className="h-5 w-5 text-purple-500" />
                <div>
                  <h4 className="font-medium">Auditoria Automática</h4>
                  <p className="text-sm text-muted-foreground">
                    Monitoramento contínuo de acesso a dados sensíveis
                  </p>
                </div>
                <Badge variant="secondary">Ativo</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}