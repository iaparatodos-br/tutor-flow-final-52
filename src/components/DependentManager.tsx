import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Baby, Calendar, Edit2, Plus, Trash2, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDependents, Dependent, DependentFormData } from "@/hooks/useDependents";
import { DependentFormModal } from "@/components/DependentFormModal";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface DependentManagerProps {
  teacherId: string;
  responsibleId: string;
  responsibleName: string;
  onDependentsChange?: (dependents: Dependent[]) => void;
  compact?: boolean;
}

export function DependentManager({
  teacherId,
  responsibleId,
  responsibleName,
  onDependentsChange,
  compact = false,
}: DependentManagerProps) {
  const { t, i18n } = useTranslation('students');
  const dateLocale = i18n.language === 'pt' ? ptBR : enUS;
  
  const {
    isLoading,
    createDependent,
    updateDependent,
    deleteDependent,
    fetchDependentsForResponsible,
  } = useDependents({ teacherId });

  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedDependent, setSelectedDependent] = useState<Dependent | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [dependentToDelete, setDependentToDelete] = useState<Dependent | null>(null);

  // Load dependents on mount
  useEffect(() => {
    const loadDependents = async () => {
      const deps = await fetchDependentsForResponsible(responsibleId);
      setDependents(deps);
      onDependentsChange?.(deps);
    };
    
    if (responsibleId && teacherId) {
      loadDependents();
    }
  }, [responsibleId, teacherId, fetchDependentsForResponsible, onDependentsChange]);

  const handleAddClick = () => {
    setSelectedDependent(null);
    setIsFormOpen(true);
  };

  const handleEditClick = (dependent: Dependent) => {
    setSelectedDependent(dependent);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (dependent: Dependent) => {
    setDependentToDelete(dependent);
    setDeleteConfirmOpen(true);
  };

  const handleFormSubmit = async (formData: DependentFormData) => {
    setIsSubmitting(true);
    try {
      if (selectedDependent) {
        // Update existing
        await updateDependent(selectedDependent.dependent_id, formData);
      } else {
        // Create new
        await createDependent(formData, responsibleId, teacherId);
      }
      
      // Refresh list
      const deps = await fetchDependentsForResponsible(responsibleId);
      setDependents(deps);
      onDependentsChange?.(deps);
      setIsFormOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!dependentToDelete) return;
    
    setIsSubmitting(true);
    try {
      const success = await deleteDependent(dependentToDelete.dependent_id);
      if (success) {
        // Refresh list
        const deps = await fetchDependentsForResponsible(responsibleId);
        setDependents(deps);
        onDependentsChange?.(deps);
      }
    } finally {
      setIsSubmitting(false);
      setDeleteConfirmOpen(false);
      setDependentToDelete(null);
    }
  };

  const formatBirthDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy', { locale: dateLocale });
    } catch {
      return dateStr;
    }
  };

  if (isLoading && dependents.length === 0) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium flex items-center gap-2">
            <Baby className="h-4 w-4" />
            {t('dependents.title', 'Dependentes')} ({dependents.length})
          </span>
          <Button variant="ghost" size="sm" onClick={handleAddClick}>
            <Plus className="h-4 w-4 mr-1" />
            {t('dependents.add', 'Adicionar')}
          </Button>
        </div>

        {dependents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            {t('dependents.empty', 'Nenhum dependente cadastrado')}
          </p>
        ) : (
          <div className="space-y-1">
            {dependents.map((dep) => (
              <div
                key={dep.dependent_id}
                className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{dep.dependent_name}</span>
                  {dep.birth_date && (
                    <Badge variant="outline" className="text-xs">
                      {formatBirthDate(dep.birth_date)}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleEditClick(dep)}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteClick(dep)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <DependentFormModal
          isOpen={isFormOpen}
          onOpenChange={setIsFormOpen}
          onSubmit={handleFormSubmit}
          isSubmitting={isSubmitting}
          dependent={selectedDependent}
          responsibleName={responsibleName}
        />

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('dependents.deleteConfirm.title', 'Remover dependente?')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('dependents.deleteConfirm.description', 'Esta ação irá remover o dependente {{name}}. Aulas futuras associadas serão canceladas.', {
                  name: dependentToDelete?.dependent_name,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>
                {t('common.cancel', 'Cancelar')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isSubmitting}
              >
                {t('common.delete', 'Remover')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Full card view
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Baby className="h-5 w-5" />
              {t('dependents.title', 'Dependentes')}
            </CardTitle>
            <CardDescription>
              {t('dependents.description', 'Menores sob responsabilidade de {{name}}', {
                name: responsibleName,
              })}
            </CardDescription>
          </div>
          <Button onClick={handleAddClick} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t('dependents.addButton', 'Adicionar Dependente')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {dependents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Baby className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t('dependents.emptyState', 'Nenhum dependente cadastrado para este responsável.')}</p>
            <Button variant="link" onClick={handleAddClick} className="mt-2">
              {t('dependents.addFirst', 'Adicionar primeiro dependente')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {dependents.map((dep) => (
              <div
                key={dep.dependent_id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{dep.dependent_name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {dep.birth_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatBirthDate(dep.birth_date)}
                        </span>
                      )}
                      {dep.notes && (
                        <span className="truncate max-w-[200px]">
                          {dep.notes}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditClick(dep)}
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    {t('common.edit', 'Editar')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteClick(dep)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <DependentFormModal
          isOpen={isFormOpen}
          onOpenChange={setIsFormOpen}
          onSubmit={handleFormSubmit}
          isSubmitting={isSubmitting}
          dependent={selectedDependent}
          responsibleName={responsibleName}
        />

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('dependents.deleteConfirm.title', 'Remover dependente?')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('dependents.deleteConfirm.description', 'Esta ação irá remover o dependente {{name}}. Aulas futuras associadas serão canceladas.', {
                  name: dependentToDelete?.dependent_name,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>
                {t('common.cancel', 'Cancelar')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isSubmitting}
              >
                {t('common.delete', 'Remover')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
