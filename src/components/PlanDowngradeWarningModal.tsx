import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CreditCard, Users, Calendar, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PlanDowngradeWarningModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentPlan: any;
  targetPlan: any;
  currentStudentCount: number;
  subscriptionEndDate?: string;
}

export function PlanDowngradeWarningModal({
  open,
  onClose,
  onConfirm,
  currentPlan,
  targetPlan,
  currentStudentCount,
  subscriptionEndDate
}: PlanDowngradeWarningModalProps) {
  const limit = targetPlan?.student_limit ?? 0;
  const excessStudents = currentStudentCount - limit;
  const hasExcess = excessStudents > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Confirmar Downgrade do Plano
          </DialogTitle>
          <DialogDescription>
            Você está prestes a alterar seu plano para um com menor limite de alunos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Plan Change Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Alteração de Plano
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-center">
                  <Badge variant="secondary">{currentPlan?.name}</Badge>
                  <p className="text-sm text-muted-foreground mt-1">
                    R$ {((currentPlan?.price_cents || 0) / 100).toFixed(2)}/mês
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {currentPlan?.student_limit} alunos
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-4" />
                <div className="text-center">
                  <Badge variant="default">{targetPlan?.name}</Badge>
                  <p className="text-sm text-muted-foreground mt-1">
                    R$ {((targetPlan?.price_cents || 0) / 100).toFixed(2)}/mês
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {targetPlan?.student_limit} alunos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Status */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Alunos Atuais</span>
                </div>
                <p className="text-2xl font-bold text-blue-600 mt-1">{currentStudentCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Mudança em</span>
                </div>
                <p className="text-lg font-semibold text-green-600 mt-1">
                  {subscriptionEndDate 
                    ? format(new Date(subscriptionEndDate), 'dd/MM/yyyy', { locale: ptBR })
                    : 'Imediatamente'
                  }
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Warning Alert */}
          {hasExcess && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>⚠️ ATENÇÃO: Limite de Alunos Excedido</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  <strong>Você possui {currentStudentCount} alunos, mas o plano {targetPlan?.name} 
                  permite apenas {targetPlan?.student_limit ?? 0} alunos.</strong>
                </p>
                <p>
                  <strong className="text-red-600">
                    {subscriptionEndDate ? 'No fim do período atual' : 'Imediatamente'}, 
                    você precisará selecionar quais {targetPlan?.student_limit ?? 0} alunos deseja manter.
                  </strong>
                </p>
                <p>
                  <strong className="text-red-600">
                    Os {excessStudents} aluno(s) não selecionado(s) serão EXCLUÍDOS PERMANENTEMENTE 
                    do sistema, incluindo todos os dados, aulas e histórico.
                  </strong>
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">O que acontece agora?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <div>
                  <p className="font-medium">Agora</p>
                  <p className="text-sm text-muted-foreground">
                    Seu plano será alterado e a cobrança ajustada
                  </p>
                </div>
              </div>
              
              {subscriptionEndDate && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                  <div>
                    <p className="font-medium">
                      {format(new Date(subscriptionEndDate), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Fim do período atual - você manterá acesso até esta data
                    </p>
                  </div>
                </div>
              )}

              {hasExcess && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                  <div>
                    <p className="font-medium">
                      {subscriptionEndDate 
                        ? format(new Date(subscriptionEndDate), 'dd/MM/yyyy', { locale: ptBR })
                        : 'Imediatamente'
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <strong>Seleção obrigatória de alunos</strong> - você deve escolher quais {targetPlan?.student_limit ?? 0} alunos manter
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alternative Options */}
          {hasExcess && targetPlan?.slug !== 'free' && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Alternativas Disponíveis</AlertTitle>
              <AlertDescription>
                <ul className="space-y-1 mt-2 text-sm">
                  <li>• <strong>Manter plano atual:</strong> Cancele esta alteração</li>
                  <li>• <strong>Plano que comporta todos os alunos:</strong> Escolha um plano com limite maior</li>
                  {(targetPlan?.student_limit ?? 0) > 3 && (
                    <li>• <strong>Alunos extras:</strong> Pague R$ 5,00/mês por cada aluno adicional</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar Alteração
          </Button>
          <Button 
            variant={hasExcess ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {hasExcess ? 'Confirmar Downgrade' : 'Confirmar Alteração'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}