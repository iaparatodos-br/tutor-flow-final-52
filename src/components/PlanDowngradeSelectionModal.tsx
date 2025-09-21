import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Users, CreditCard, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ProgressModal } from './ProgressModal';

interface Student {
  id: string;
  relationship_id: string;
  name: string;
  email: string;
  created_at: string;
}

interface PlanDowngradeSelectionModalProps {
  open: boolean;
  onClose: (completed?: boolean) => void;
  students: Student[];
  currentPlan: any;
  newPlan: any;
  currentCount: number;
  targetLimit: number;
  needToRemove: number;
}

export function PlanDowngradeSelectionModal({
  open,
  onClose,
  students,
  currentPlan,
  newPlan,
  currentCount,
  targetLimit,
  needToRemove
}: PlanDowngradeSelectionModalProps) {
  const { t } = useTranslation('subscription');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progressSteps, setProgressSteps] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);

  const handleStudentToggle = (studentId: string) => {
    setSelectedStudents(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId);
      } else if (prev.length < targetLimit) {
        return [...prev, studentId];
      }
      return prev; // Don't add if already at limit
    });
  };

  const handleSelectAll = () => {
    if (selectedStudents.length === targetLimit) {
      setSelectedStudents([]);
    } else {
      // Select first students up to limit (could be based on creation date)
      const sortedStudents = [...students].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setSelectedStudents(sortedStudents.slice(0, targetLimit).map(s => s.id));
    }
  };

  const handleConfirmSelection = async () => {
    if (selectedStudents.length !== targetLimit) {
      toast({
        title: "Seleção incompleta",
        description: `Você deve selecionar exatamente ${targetLimit} aluno(s).`,
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    setShowProgress(true);
    
    // Initialize progress steps
    const steps = [
      {
        id: 'validate',
        label: 'Validando seleção',
        status: 'in-progress' as const,
        description: 'Verificando alunos selecionados'
      },
      {
        id: 'delete',
        label: 'Removendo alunos',
        status: 'pending' as const,
        description: 'Excluindo alunos não selecionados'
      },
      {
        id: 'update',
        label: 'Atualizando plano',
        status: 'pending' as const,
        description: 'Alterando plano de assinatura'
      },
      {
        id: 'complete',
        label: 'Finalizando alterações',
        status: 'pending' as const,
        description: 'Salvando configurações'
      }
    ];
    
    setProgressSteps(steps);
    setProgress(10);

    try {
      // Step 1: Validation
      await new Promise(resolve => setTimeout(resolve, 1000));
      setProgressSteps(prev => prev.map(step => 
        step.id === 'validate' 
          ? { ...step, status: 'completed' as const }
          : step.id === 'delete'
          ? { ...step, status: 'in-progress' as const }
          : step
      ));
      setProgress(30);

      // Step 2: Delete students and update plan
      const { data, error } = await supabase.functions.invoke('handle-plan-downgrade-selection', {
        body: {
          selected_student_ids: selectedStudents,
          new_plan_id: newPlan.id
        }
      });

      if (error) throw error;

      setProgressSteps(prev => prev.map(step => 
        step.id === 'delete' 
          ? { ...step, status: 'completed' as const }
          : step.id === 'update'
          ? { ...step, status: 'in-progress' as const }
          : step
      ));
      setProgress(70);

      // Step 3: Update plan
      await new Promise(resolve => setTimeout(resolve, 500));
      setProgressSteps(prev => prev.map(step => 
        step.id === 'update' 
          ? { ...step, status: 'completed' as const }
          : step.id === 'complete'
          ? { ...step, status: 'in-progress' as const }
          : step
      ));
      setProgress(90);

      // Step 4: Complete
      await new Promise(resolve => setTimeout(resolve, 500));
      setProgressSteps(prev => prev.map(step => 
        step.id === 'complete' 
          ? { ...step, status: 'completed' as const }
          : step
      ));
      setProgress(100);

      if (data?.success) {
        toast({
          title: "Downgrade concluído",
          description: data.message,
        });
        
        // Wait a bit to show completion
        await new Promise(resolve => setTimeout(resolve, 1000));
        onClose(true); // Signal completion
      } else {
        throw new Error(data?.message || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Error processing downgrade selection:', error);
      
      setProgressSteps(prev => prev.map(step => 
        step.status === 'in-progress' 
          ? { ...step, status: 'error' as const, description: error.message }
          : step
      ));
      
      toast({
        title: "Erro no downgrade",
        description: "Não foi possível processar a seleção. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      setTimeout(() => {
        setShowProgress(false);
        setProgress(0);
      }, 2000);
    }
  };

  const selectedCount = selectedStudents.length;
  const studentsToRemove = students.filter(s => !selectedStudents.includes(s.id));

  return (
    <Dialog open={open} onOpenChange={() => !processing && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Seleção Obrigatória de Alunos
          </DialogTitle>
          <DialogDescription>
            Seu plano mudou para um com menor limite de alunos. Selecione quais alunos deseja manter.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Plan Change Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Mudança de Plano
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <div className="text-center">
                  <Badge variant="secondary">{currentPlan?.name}</Badge>
                  <p className="text-muted-foreground mt-1">
                    {currentPlan?.student_limit} alunos
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-4" />
                <div className="text-center">
                  <Badge variant="default">{newPlan?.name}</Badge>
                  <p className="text-muted-foreground mt-1">
                    {newPlan?.student_limit} alunos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warning Alert */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>⚠️ ATENÇÃO: Exclusão Permanente</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                <strong>Você deve selecionar exatamente {targetLimit} aluno(s)</strong> dos {currentCount} atuais.
              </p>
              <p>
                <strong>Os {needToRemove} aluno(s) não selecionado(s) serão EXCLUÍDOS PERMANENTEMENTE</strong> do sistema, 
                incluindo todos os dados, aulas, relatórios e histórico.
              </p>
              <p className="text-sm">
                Esta ação não pode ser desfeita. Considere fazer upgrade do seu plano para manter todos os alunos.
              </p>
            </AlertDescription>
          </Alert>

          {/* Selection Summary */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-blue-600">{currentCount}</div>
                <p className="text-sm text-muted-foreground">Alunos Atuais</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">{selectedCount}</div>
                <p className="text-sm text-muted-foreground">Selecionados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-red-600">{studentsToRemove.length}</div>
                <p className="text-sm text-muted-foreground">Serão Excluídos</p>
              </CardContent>
            </Card>
          </div>

          {/* Selection Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="font-medium">
                Selecione {targetLimit} aluno(s) para manter
              </span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSelectAll}
              disabled={processing}
            >
              {selectedCount === targetLimit ? 'Limpar Seleção' : 'Selecionar Primeiros'}
            </Button>
          </div>

          {/* Students List */}
          <div className="grid gap-2 max-h-64 overflow-y-auto">
            {students.map((student) => {
              const isSelected = selectedStudents.includes(student.id);
              const canSelect = isSelected || selectedStudents.length < targetLimit;
              
              return (
                <div
                  key={student.id}
                  className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    isSelected 
                      ? 'border-green-500 bg-green-50' 
                      : canSelect 
                        ? 'border-gray-200 hover:border-gray-300' 
                        : 'border-gray-100 bg-gray-50 opacity-50'
                  }`}
                  onClick={() => canSelect && handleStudentToggle(student.id)}
                >
                  <Checkbox 
                    checked={isSelected}
                    disabled={!canSelect || processing}
                    className="pointer-events-none"
                  />
                  <div className="flex-1">
                    <p className="font-medium">{student.name}</p>
                    <p className="text-sm text-muted-foreground">{student.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Aluno desde {format(new Date(student.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  </div>
                  {isSelected && (
                    <Badge variant="default" className="bg-green-500">
                      Selecionado
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>

          {/* Students to be removed warning */}
          {studentsToRemove.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Alunos que serão excluídos permanentemente:</AlertTitle>
              <AlertDescription>
                <div className="space-y-1 mt-2">
                  {studentsToRemove.map(student => (
                    <div key={student.id} className="text-sm">
                      • {student.name} ({student.email})
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => onClose()}
            disabled={processing}
          >
            Voltar
          </Button>
          <Button 
            variant="destructive"
            onClick={handleConfirmSelection}
            disabled={selectedCount !== targetLimit || processing}
          >
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {processing ? 'Processando...' : `Confirmar Seleção (${selectedCount}/${targetLimit})`}
          </Button>
        </DialogFooter>
      </DialogContent>
      
      <ProgressModal
        open={showProgress}
        title="Processando Downgrade do Plano"
        steps={progressSteps}
        progress={progress}
        allowClose={!processing}
        onClose={() => setShowProgress(false)}
      />
    </Dialog>
  );
}