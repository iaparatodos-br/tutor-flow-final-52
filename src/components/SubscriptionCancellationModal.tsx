import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Users, CreditCard, Loader2 } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

interface Student {
  student_id: string;
  student_name: string;
  student_email: string;
  pendingInvoices: number;
}

interface SubscriptionCancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function SubscriptionCancellationModal({
  isOpen,
  onClose,
  onConfirm
}: SubscriptionCancellationModalProps) {
  const { t, i18n } = useTranslation('subscription');
  const { currentPlan } = useSubscription();
  const [confirmationText, setConfirmationText] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [totalPendingInvoices, setTotalPendingInvoices] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const hasFinancialModule = currentPlan?.features?.financial_module;
  const expectedConfirmationText = i18n.language === 'pt' ? 'CANCELAR' : 'CANCEL';
  const isConfirmationValid = confirmationText === expectedConfirmationText;

  useEffect(() => {
    if (isOpen && hasFinancialModule) {
      loadStudentsAndInvoices();
    }
  }, [isOpen, hasFinancialModule]);

  const loadStudentsAndInvoices = async () => {
    setLoading(true);
    try {
      // Buscar alunos do professor
      const { data: studentsData, error: studentsError } = await supabase
        .rpc('get_teacher_students', {
          teacher_user_id: (await supabase.auth.getUser()).data.user?.id
        });

      if (studentsError) throw studentsError;

      // Para cada aluno, buscar faturas pendentes
      const studentsWithInvoices = await Promise.all(
        (studentsData || []).map(async (student: any) => {
          const { count } = await supabase
            .from('invoices')
            .select('*', { count: 'exact', head: true })
            .eq('student_id', student.student_id)
            .eq('status', 'pendente');

          return {
            student_id: student.student_id,
            student_name: student.student_name,
            student_email: student.student_email,
            pendingInvoices: count || 0
          };
        })
      );

      setStudents(studentsWithInvoices);
      setTotalPendingInvoices(
        studentsWithInvoices.reduce((sum, student) => sum + student.pendingInvoices, 0)
      );
    } catch (error) {
      console.error('Error loading students and invoices:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar informações dos alunos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setCancelling(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Error cancelling subscription:', error);
    } finally {
      setCancelling(false);
    }
  };

  const resetModal = () => {
    setConfirmationText('');
    setStudents([]);
    setTotalPendingInvoices(0);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            {t('cancellation.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {hasFinancialModule ? (
            <>
              {/* Warning Alert */}
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t('cancellation.warning')}</AlertTitle>
                <AlertDescription className="mt-2">
                  <p className="font-semibold mb-2">
                    {t('cancellation.financialModuleWarning')}
                  </p>
                  <ul className="space-y-1 text-sm">
                    <li>• {t('cancellation.consequences.invoicesWillBeCancelled')}</li>
                    <li>• {t('cancellation.consequences.loseFinancialAccess')}</li>
                    <li>• {t('cancellation.consequences.noRefunds')}</li>
                    <li>• {t('cancellation.consequences.dataWillBePreserved')}</li>
                  </ul>
                </AlertDescription>
              </Alert>

              {/* Loading state */}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>{t('cancellation.loadingStudents')}</span>
                </div>
              )}

              {/* Students and Invoices Info */}
              {!loading && students.length > 0 && (
                <>
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4" />
                      {t('cancellation.studentsAffected')} ({students.length})
                    </h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {students.map((student) => (
                        <div key={student.student_id} className="flex justify-between text-sm">
                          <span>{student.student_name}</span>
                          <span className="text-muted-foreground">
                            {student.pendingInvoices} {t('cancellation.pendingInvoicesCount')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {totalPendingInvoices > 0 && (
                    <Alert>
                      <CreditCard className="h-4 w-4" />
                      <AlertTitle>{t('cancellation.pendingInvoices')}</AlertTitle>
                      <AlertDescription>
                        <span className="font-semibold text-lg">
                          {totalPendingInvoices} {t('cancellation.invoicesWillBeCancelledCount')}
                        </span>
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}

              {/* Confirmation Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('cancellation.confirmationRequired')}
                </label>
                <Input
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder={expectedConfirmationText}
                  className="font-mono"
                />
              </div>
            </>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('cancellation.simpleConfirmationTitle')}</AlertTitle>
              <AlertDescription>
                {t('cancellation.simpleConfirmationDescription')}
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={cancelling}
            >
              {hasFinancialModule 
                ? t('cancellation.backToSafety')
                : t('cancellation.cancelAction')
              }
            </Button>
            
            <Button
              variant="destructive"
              onClick={handleConfirm}
              className="flex-1"
              disabled={hasFinancialModule ? !isConfirmationValid : false || cancelling}
            >
              {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('cancellation.confirmCancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}