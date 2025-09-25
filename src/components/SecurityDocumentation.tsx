import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Shield, 
  Database, 
  Users, 
  Lock, 
  Eye, 
  AlertTriangle,
  CheckCircle,
  FileText,
  Code,
  Settings
} from 'lucide-react';

export function SecurityDocumentation() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Documentação de Segurança</h2>
        <p className="text-muted-foreground">
          Guia completo das políticas de segurança e boas práticas implementadas
        </p>
      </div>

      {/* Visão Geral */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Visão Geral da Segurança
          </CardTitle>
          <CardDescription>
            Arquitetura de segurança do Tutor Flow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p>
              O Tutor Flow implementa múltiplas camadas de segurança para proteger dados sensíveis 
              de professores e alunos, garantindo isolamento completo e auditoria contínua.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <Database className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                <h3 className="font-semibold">Row Level Security</h3>
                <p className="text-sm text-muted-foreground">
                  Isolamento de dados no nível do banco
                </p>
              </div>
              
              <div className="text-center p-4 border rounded-lg">
                <Users className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <h3 className="font-semibold">Controle de Acesso</h3>
                <p className="text-sm text-muted-foreground">
                  Permissões baseadas em roles e contexto
                </p>
              </div>
              
              <div className="text-center p-4 border rounded-lg">
                <Eye className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                <h3 className="font-semibold">Auditoria Contínua</h3>
                <p className="text-sm text-muted-foreground">
                  Monitoramento e logging de segurança
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Políticas RLS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Políticas Row Level Security (RLS)
          </CardTitle>
          <CardDescription>
            Detalhamento das políticas de segurança implementadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            
            {/* Tabela Profiles */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Tabela: profiles (Dados PII Críticos)
              </h3>
              <div className="space-y-2 ml-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Usuários só podem ver e editar seu próprio perfil</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Professores podem ver perfis de seus alunos vinculados</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Professores podem criar perfis apenas para alunos (não admin/professor)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Validação obrigatória de role ao criar perfis</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Tabela Invoices */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Tabela: invoices (Dados Financeiros)
              </h3>
              <div className="space-y-2 ml-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Professores só acessam faturas se tiverem módulo financeiro ativo</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Isolamento por business_profile_id validado</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Alunos podem ver apenas suas próprias faturas</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Verificação dupla: teacher_id e business_profile ownership</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Tabelas Stripe */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Tabelas Stripe (Dados Sensíveis de Pagamento)
              </h3>
              <div className="space-y-2 ml-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>processed_stripe_events: Acesso completamente bloqueado para usuários</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>archived_stripe_events: Acesso completamente bloqueado para usuários</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>stripe_connect_accounts: Apenas professores com módulo financeiro</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>payment_accounts: Isolamento por teacher_id + validação de módulo</span>
                </div>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Sistema de Auditoria */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Sistema de Auditoria e Monitoramento
          </CardTitle>
          <CardDescription>
            Logging e monitoramento de segurança implementados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Auditoria Automática Ativa</AlertTitle>
              <AlertDescription>
                Todas as operações em dados sensíveis são automaticamente logadas para auditoria.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Tabelas Monitoradas:</h3>
                <div className="grid grid-cols-2 gap-2 ml-4">
                  <Badge variant="outline">profiles</Badge>
                  <Badge variant="outline">invoices</Badge>
                  <Badge variant="outline">stripe_connect_accounts</Badge>
                  <Badge variant="outline">payment_accounts</Badge>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Eventos Auditados:</h3>
                <div className="grid grid-cols-3 gap-2 ml-4">
                  <Badge variant="secondary">INSERT</Badge>
                  <Badge variant="secondary">UPDATE</Badge>
                  <Badge variant="secondary">DELETE</Badge>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Informações Coletadas:</h3>
                <ul className="list-disc ml-8 space-y-1 text-sm">
                  <li>ID do usuário que executou a operação</li>
                  <li>Timestamp da operação</li>
                  <li>Tipo de operação (INSERT/UPDATE/DELETE)</li>
                  <li>Tabela e registro afetado</li>
                  <li>Nível de segurança (info/warning/critical)</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Testes de Segurança */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Testes de Segurança Automatizados
          </CardTitle>
          <CardDescription>
            Sistema de auditoria automática implementado via Edge Function
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p>
              O sistema inclui uma Edge Function dedicada (<code>security-rls-audit</code>) que executa 
              testes automatizados para validar a segurança:
            </p>

            <div className="space-y-3">
              <div className="border rounded-lg p-3">
                <h4 className="font-medium mb-2">Teste 1: Validação de Políticas RLS</h4>
                <p className="text-sm text-muted-foreground">
                  Verifica se todas as tabelas têm políticas RLS adequadas e identifica 
                  problemas críticos ou avisos.
                </p>
              </div>

              <div className="border rounded-lg p-3">
                <h4 className="font-medium mb-2">Teste 2: Isolamento de Dados Entre Professores</h4>
                <p className="text-sm text-muted-foreground">
                  Tenta acessar dados de outros professores para garantir que o isolamento 
                  está funcionando corretamente.
                </p>
              </div>

              <div className="border rounded-lg p-3">
                <h4 className="font-medium mb-2">Teste 3: Controle de Acesso Financeiro</h4>
                <p className="text-sm text-muted-foreground">
                  Valida que apenas usuários com módulo financeiro ativo podem acessar 
                  dados financeiros.
                </p>
              </div>

              <div className="border rounded-lg p-3">
                <h4 className="font-medium mb-2">Teste 4: Proteção de Dados PII</h4>
                <p className="text-sm text-muted-foreground">
                  Verifica se informações pessoais (emails, CPF, telefones) estão 
                  adequadamente protegidas.
                </p>
              </div>

              <div className="border rounded-lg p-3">
                <h4 className="font-medium mb-2">Teste 5: Sistema de Auditoria</h4>
                <p className="text-sm text-muted-foreground">
                  Valida se os logs de auditoria estão sendo gerados corretamente.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configurações Recomendadas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurações Recomendadas
          </CardTitle>
          <CardDescription>
            Configurações adicionais recomendadas para máxima segurança
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Configuração Pendente</AlertTitle>
              <AlertDescription>
                Habilite a proteção contra senhas vazadas nas configurações de Auth do Supabase 
                para aumentar a segurança das contas de usuário.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h4 className="font-medium">Proteção contra Senhas Vazadas</h4>
                  <p className="text-sm text-muted-foreground">
                    Impede o uso de senhas conhecidamente comprometidas
                  </p>
                </div>
                <Badge variant="outline">Recomendado</Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h4 className="font-medium">Autenticação de Dois Fatores</h4>
                  <p className="text-sm text-muted-foreground">
                    Camada adicional de segurança para contas críticas
                  </p>
                </div>
                <Badge variant="secondary">Futuro</Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h4 className="font-medium">Rate Limiting</h4>
                  <p className="text-sm text-muted-foreground">
                    Proteção contra ataques de força bruta
                  </p>
                </div>
                <Badge variant="secondary">Implementado</Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h4 className="font-medium">Monitoramento de IP Suspeito</h4>
                  <p className="text-sm text-muted-foreground">
                    Detecção automática de atividades suspeitas
                  </p>
                </div>
                <Badge variant="secondary">Implementado</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processo de Revisão */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Processo de Revisão de Segurança
          </CardTitle>
          <CardDescription>
            Diretrizes para manutenção contínua da segurança
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">1. Auditoria Regular</h4>
                <p className="text-sm text-muted-foreground">
                  Execute auditorias de segurança mensalmente ou após mudanças significativas 
                  no sistema. Use o dashboard de monitoramento para acompanhar o status.
                </p>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">2. Revisão de Código</h4>
                <p className="text-sm text-muted-foreground">
                  Toda modificação em políticas RLS ou funções de segurança deve passar por 
                  revisão de código focada em segurança.
                </p>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">3. Testes de Penetração</h4>
                <p className="text-sm text-muted-foreground">
                  Execute testes de penetração semestralmente ou após implementações 
                  significativas de novas funcionalidades.
                </p>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">4. Monitoramento Contínuo</h4>
                <p className="text-sm text-muted-foreground">
                  Monitore logs de segurança diariamente e configure alertas para 
                  atividades suspeitas ou tentativas de acesso não autorizado.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}