import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Users, CreditCard, ArrowRight, Loader2, Baby } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ProgressModal } from './ProgressModal';
import { useProfile } from '@/contexts/ProfileContext';

interface Student {
  id: string;
  relationship_id: string;
  name: string;
  email: string;
  created_at: string;
}

interface Dependent {
  id: string;
  name: string;
  responsible_id: string;
  responsible_name: string;
  created_at: string;
}

interface SelectableEntity {
  id: string;
  name: string;
  email?: string;
  created_at: string;
  type: 'student' | 'dependent';
  responsibleName?: string;
}

interface PaymentFailureStudentSelectionModalProps {
  open: boolean;
  onClose: (completed?: boolean) => void;
  students: Student[];
  currentPlan: any;
  newPlan: any;
  currentCount: number;
  targetLimit: number;
  needToRemove: number;
}

export function PaymentFailureStudentSelectionModal({
  open,
  onClose,
  students,
  currentPlan,
  newPlan,
  currentCount,
  targetLimit,
  needToRemove
}: PaymentFailureStudentSelectionModalProps) {
  const { t } = useTranslation('subscription');
  const { profile } = useProfile();
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progressSteps, setProgressSteps] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [loadingDependents, setLoadingDependents] = useState(false);

  // Fetch dependents when modal opens
  useEffect(() => {
    if (open && profile?.id) {
      loadDependents();
    }
  }, [open, profile?.id]);

  const loadDependents = async () => {
    if (!profile?.id) return;
    setLoadingDependents(true);
    try {
      const { data, error } = await supabase.rpc('get_teacher_dependents', {
        p_teacher_id: profile.id
      });
      if (error) throw error;
      setDependents(data?.map((d: any) => ({
        id: d.dependent_id,
        name: d.dependent_name,
        responsible_id: d.responsible_id,
        responsible_name: d.responsible_name,
        created_at: d.created_at
      })) || []);
    } catch (error) {
      console.error('Error loading dependents:', error);
    } finally {
      setLoadingDependents(false);
    }
  };

  // Combine students and dependents into selectable entities
  const allEntities: SelectableEntity[] = [
    ...students.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      created_at: s.created_at,
      type: 'student' as const
    })),
    ...dependents.map(d => ({
      id: `dep_${d.id}`,
      name: d.name,
      created_at: d.created_at,
      type: 'dependent' as const,
      responsibleName: d.responsible_name
    }))
  ];

  const handleEntityToggle = (entityId: string) => {
    setSelectedEntities(prev => {
      if (prev.includes(entityId)) {
        return prev.filter(id => id !== entityId);
      } else if (prev.length < targetLimit) {
        return [...prev, entityId];
      }
      return prev;
    });
  };

  const handleSelectAll = () => {
    if (selectedEntities.length === targetLimit) {
      setSelectedEntities([]);
    } else {
      const sortedEntities = [...allEntities].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setSelectedEntities(sortedEntities.slice(0, targetLimit).map(e => e.id));
    }
  };

  const handleConfirmSelection = async () => {
    if (selectedEntities.length !== targetLimit) {
      toast({
        title: "Seleção incompleta",
        description: `Você deve selecionar exatamente ${targetLimit} aluno(s)/dependente(s).`,
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    setShowProgress(true);
    
    const steps = [
      {
        id: 'validate',
        label: 'Validando seleção',
        status: 'in-progress' as const,
        description: 'Verificando alunos e dependentes selecionados'
      },
      {
        id: 'cancel-invoices',
        label: 'Cancelando faturas',
        status: 'pending' as const,
        description: 'Cancelando faturas pendentes'
      },
      {
        id: 'delete',
        label: 'Removendo alunos/dependentes',
        status: 'pending' as const,
        description: 'Excluindo itens não selecionados'
      },
      {
        id: 'update',
        label: 'Atualizando plano',
        status: 'pending' as const,
        description: 'Alterando para plano gratuito'
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      setProgressSteps(prev => prev.map(step => 
        step.id === 'validate' 
          ? { ...step, status: 'completed' as const }
          : step.id === 'cancel-invoices'
          ? { ...step, status: 'in-progress' as const }
          : step
      ));
      setProgress(25);

      // Separate student IDs and dependent IDs
      const selectedStudentIds = selectedEntities.filter(id => !id.startsWith('dep_'));
      const selectedDependentIds = selectedEntities.filter(id => id.startsWith('dep_')).map(id => id.replace('dep_', ''));

      const { data, error } = await supabase.functions.invoke('process-payment-failure-downgrade', {
        body: {
          selectedStudentIds,
          selectedDependentIds,
          reason: 'payment_failure'
        }
      });

      if (error) throw error;

      setProgressSteps(prev => prev.map(step => 
        step.id === 'cancel-invoices' 
          ? { ...step, status: 'completed' as const }
          : step.id === 'delete'
          ? { ...step, status: 'in-progress' as const }
          : step
      ));
      setProgress(50);

      await new Promise(resolve => setTimeout(resolve, 1000));
      setProgressSteps(prev => prev.map(step => 
        step.id === 'delete' 
          ? { ...step, status: 'completed' as const }
          : step.id === 'update'
          ? { ...step, status: 'in-progress' as const }
          : step
      ));
      setProgress(75);

      await new Promise(resolve => setTimeout(resolve, 500));
      setProgressSteps(prev => prev.map(step => 
        step.id === 'update' 
          ? { ...step, status: 'completed' as const }
          : step.id === 'complete'
          ? { ...step, status: 'in-progress' as const }
          : step
      ));
      setProgress(90);

      await new Promise(resolve => setTimeout(resolve, 500));
      setProgressSteps(prev => prev.map(step => 
        step.id === 'complete' 
          ? { ...step, status: 'completed' as const }
          : step
      ));
      setProgress(100);

      if (data?.success) {
        toast({
          title: "Downgrade por falha de pagamento concluído",
          description: "Suas faturas pendentes foram canceladas e você foi movido para o plano gratuito.",
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        onClose(true);
      } else {
        throw new Error(data?.message || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Error processing payment failure downgrade:', error);
      
      setProgressSteps(prev => prev.map(step => 
        step.status === 'in-progress' 
          ? { ...step, status: 'error' as const, description: error.message }
          : step
      ));
      
      toast({
        title: "Erro no downgrade por falha de pagamento",
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

  const selectedCount = selectedEntities.length;
  const entitiesToRemove = allEntities.filter(e => !selectedEntities.includes(e.id));

  return (
    <Dialog open={open} onOpenChange={() => !processing && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Falha de Pagamento - Seleção de Alunos
          </DialogTitle>
          <DialogDescription>
            Sua assinatura foi cancelada por falha de pagamento. Selecione quais {targetLimit} alunos deseja manter no plano gratuito.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Plan Change Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Downgrade por Falha de Pagamento
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
                  <Badge variant="default" className="bg-green-600">Plano Gratuito</Badge>
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
            <AlertTitle>⚠️ ATENÇÃO: Falha de Pagamento</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                <strong>Sua assinatura foi cancelada</strong> devido à falha no pagamento.
              </p>
              <p>
                <strong>Você deve selecionar exatamente {targetLimit} aluno(s)</strong> dos {currentCount} atuais para manter no plano gratuito.
              </p>
              <p>
                <strong>Os {needToRemove} aluno(s) não selecionado(s) serão EXCLUÍDOS PERMANENTEMENTE</strong> do sistema.
              </p>
              <p>
                <strong>Todas as faturas pendentes serão canceladas automaticamente.</strong>
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
                <div className="text-2xl font-bold text-red-600">{entitiesToRemove.length}</div>
                <p className="text-sm text-muted-foreground">Serão Excluídos</p>
              </CardContent>
            </Card>
          </div>

          {/* Selection Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="font-medium">
                Selecione {targetLimit} aluno(s)/dependente(s) para manter
              </span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSelectAll}
              disabled={processing || loadingDependents}
            >
              {selectedCount === targetLimit ? 'Limpar Seleção' : 'Selecionar Primeiros'}
            </Button>
          </div>

          {/* Entities List (Students + Dependents) */}
          <div className="grid gap-2 max-h-64 overflow-y-auto">
            {loadingDependents ? (
              <div className="text-center py-4 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Carregando dependentes...
              </div>
            ) : (
              allEntities.map((entity) => {
                const isSelected = selectedEntities.includes(entity.id);
                const canSelect = isSelected || selectedEntities.length < targetLimit;
                
                return (
                  <div
                    key={entity.id}
                    className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      isSelected 
                        ? 'border-green-500 bg-green-50 dark:bg-green-950' 
                        : canSelect 
                          ? 'border-border hover:border-muted-foreground' 
                          : 'border-muted bg-muted/50 opacity-50'
                    }`}
                    onClick={() => canSelect && handleEntityToggle(entity.id)}
                  >
                    <Checkbox 
                      checked={isSelected}
                      disabled={!canSelect || processing}
                      className="pointer-events-none"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{entity.name}</p>
                        {entity.type === 'dependent' && (
                          <Badge variant="outline" className="text-xs">
                            <Baby className="h-3 w-3 mr-1" />
                            Dependente
                          </Badge>
                        )}
                      </div>
                      {entity.type === 'student' && entity.email && (
                        <p className="text-sm text-muted-foreground">{entity.email}</p>
                      )}
                      {entity.type === 'dependent' && entity.responsibleName && (
                        <p className="text-sm text-muted-foreground">Responsável: {entity.responsibleName}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {entity.type === 'student' ? 'Aluno' : 'Cadastrado'} desde {format(new Date(entity.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                    </div>
                    {isSelected && (
                      <Badge variant="default" className="bg-green-500">
                        Selecionado
                      </Badge>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Entities to be removed warning */}
          {entitiesToRemove.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Alunos/dependentes que serão excluídos permanentemente:</AlertTitle>
              <AlertDescription>
                <div className="space-y-1 mt-2">
                  {entitiesToRemove.map(entity => (
                    <div key={entity.id} className="text-sm flex items-center gap-1">
                      • {entity.name} 
                      {entity.type === 'dependent' && <Baby className="h-3 w-3" />}
                      {entity.email && `(${entity.email})`}
                      {entity.responsibleName && `(resp: ${entity.responsibleName})`}
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
            Cancelar
          </Button>
          <Button 
            variant="destructive"
            onClick={handleConfirmSelection}
            disabled={selectedCount !== targetLimit || processing}
          >
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {processing ? 'Processando...' : `Confirmar e Voltar ao Gratuito (${selectedCount}/${targetLimit})`}
          </Button>
        </DialogFooter>
      </DialogContent>
      
      <ProgressModal
        open={showProgress}
        title="Processando Downgrade por Falha de Pagamento"
        steps={progressSteps}
        progress={progress}
        allowClose={!processing}
        onClose={() => setShowProgress(false)}
      />
    </Dialog>
  );
}