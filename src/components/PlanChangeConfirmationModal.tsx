import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Calendar, CreditCard, Users, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PlanChangeConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentPlan: any;
  newPlan: any;
  currentStudentCount: number;
  isLoading?: boolean;
}

export function PlanChangeConfirmationModal({
  open,
  onClose,
  onConfirm,
  currentPlan,
  newPlan,
  currentStudentCount,
  isLoading = false
}: PlanChangeConfirmationModalProps) {
  if (!currentPlan || !newPlan) return null;

  const isDowngrade = newPlan.student_limit < currentPlan.student_limit;
  const hasExcessStudents = currentStudentCount > newPlan.student_limit;
  const excessCount = Math.max(0, currentStudentCount - newPlan.student_limit);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Confirmação de Mudança de Plano
          </DialogTitle>
          <DialogDescription>
            Revise as informações abaixo antes de prosseguir
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Plan -> New Plan */}
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Plano Atual</p>
                <p className="text-lg font-semibold">{currentPlan.name}</p>
                <p className="text-sm text-muted-foreground">
                  Até {currentPlan.student_limit} alunos
                </p>
              </div>
              <div className="text-2xl">→</div>
              <div>
                <p className="text-sm text-muted-foreground">Novo Plano</p>
                <p className="text-lg font-semibold text-primary">{newPlan.name}</p>
                <p className="text-sm text-muted-foreground">
                  Até {newPlan.student_limit} alunos
                </p>
              </div>
            </div>
          </div>

          {/* Immediate Cancellation Warning */}
          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-semibold text-yellow-900 dark:text-yellow-100">
                  Cancelamento Imediato
                </p>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Ao confirmar, sua assinatura do plano <strong>{currentPlan.name}</strong> será 
                  cancelada imediatamente. Você não terá mais acesso às funcionalidades exclusivas 
                  deste plano após o cancelamento.
                </p>
              </div>
            </div>
          </div>

          {/* Student Limit Warning */}
          {isDowngrade && hasExcessStudents && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-red-600 dark:text-red-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-semibold text-red-900 dark:text-red-100">
                    Atenção: Alunos Excedentes
                  </p>
                  <p className="text-sm text-red-800 dark:text-red-200">
                    Você possui atualmente <strong>{currentStudentCount} alunos</strong>, mas o plano{' '}
                    <strong>{newPlan.name}</strong> permite apenas <strong>{newPlan.student_limit} alunos</strong>.
                  </p>
                  <p className="text-sm text-red-800 dark:text-red-200">
                    Após a mudança de plano, você precisará <strong>selecionar quais {newPlan.student_limit} alunos deseja manter</strong>. 
                    Os {excessCount} alunos não selecionados serão permanentemente removidos do sistema.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* New Plan Cost */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CreditCard className="h-4 w-4" />
              Detalhes da Cobrança
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Valor do plano</span>
                <span className="font-semibold">
                  R$ {(newPlan.price_cents / 100).toFixed(2)}/mês
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Frequência</span>
                <span className="text-sm">Mensal</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Primeira cobrança</span>
                <span className="text-sm">Imediata</span>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  O que acontecerá agora?
                </p>
                <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                  <li>Seu plano {currentPlan.name} será cancelado imediatamente</li>
                  <li>Você será redirecionado para o checkout do plano {newPlan.name}</li>
                  <li>Após o pagamento, o novo plano será ativado</li>
                  {isDowngrade && hasExcessStudents && (
                    <li>Você deverá selecionar quais alunos manter no sistema</li>
                  )}
                </ol>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processando...' : 'Confirmar Mudança de Plano'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
