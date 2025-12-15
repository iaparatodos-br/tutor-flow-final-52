import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export interface Dependent {
  dependent_id: string;
  dependent_name: string;
  birth_date: string | null;
  notes: string | null;
  responsible_id: string;
  responsible_name: string;
  responsible_email: string;
  created_at: string;
}

export interface DependentFormData {
  name: string;
  birth_date?: string;
  notes?: string;
}

interface UseDependentsOptions {
  teacherId?: string;
  responsibleId?: string;
}

export function useDependents(options: UseDependentsOptions = {}) {
  const { teacherId, responsibleId } = options;
  const { toast } = useToast();
  const { t } = useTranslation('students');
  
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all dependents for a teacher
  const fetchDependents = useCallback(async (forTeacherId?: string) => {
    const targetTeacherId = forTeacherId || teacherId;
    if (!targetTeacherId) return [];

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_teacher_dependents', { p_teacher_id: targetTeacherId });

      if (fetchError) throw fetchError;

      setDependents(data || []);
      return data || [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error fetching dependents';
      setError(errorMessage);
      console.error('Error fetching dependents:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [teacherId]);

  // Fetch dependents for a specific responsible
  const fetchDependentsForResponsible = useCallback(async (forResponsibleId: string) => {
    if (!teacherId) return [];

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_teacher_dependents', { p_teacher_id: teacherId });

      if (fetchError) throw fetchError;

      // Filter by responsible_id
      const filtered = (data || []).filter(
        (d: Dependent) => d.responsible_id === forResponsibleId
      );
      
      return filtered;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error fetching dependents';
      setError(errorMessage);
      console.error('Error fetching dependents for responsible:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [teacherId]);

  // Create a new dependent
  const createDependent = useCallback(async (
    formData: DependentFormData,
    forResponsibleId: string,
    forTeacherId?: string
  ) => {
    const targetTeacherId = forTeacherId || teacherId;
    if (!targetTeacherId) {
      toast({
        title: t('dependents.errors.missingTeacherId', 'Erro'),
        description: t('dependents.errors.teacherIdRequired', 'ID do professor é necessário'),
        variant: "destructive",
      });
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: createError } = await supabase.functions.invoke('create-dependent', {
        body: {
          responsible_id: forResponsibleId,
          teacher_id: targetTeacherId,
          name: formData.name,
          birth_date: formData.birth_date || null,
          notes: formData.notes || null,
        },
      });

      if (createError) throw createError;
      if (data?.error) throw new Error(data.error);

      toast({
        title: t('dependents.success.created', 'Dependente adicionado'),
        description: t('dependents.success.createdDescription', 'Dependente foi adicionado com sucesso.'),
      });

      // Refresh dependents list
      await fetchDependents(targetTeacherId);

      return data?.dependent;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error creating dependent';
      setError(errorMessage);
      toast({
        title: t('dependents.errors.createFailed', 'Erro ao adicionar dependente'),
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [teacherId, toast, t, fetchDependents]);

  // Update an existing dependent
  const updateDependent = useCallback(async (
    dependentId: string,
    formData: Partial<DependentFormData>
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: updateError } = await supabase.functions.invoke('update-dependent', {
        body: {
          dependent_id: dependentId,
          ...formData,
        },
      });

      if (updateError) throw updateError;
      if (data?.error) throw new Error(data.error);

      toast({
        title: t('dependents.success.updated', 'Dependente atualizado'),
        description: t('dependents.success.updatedDescription', 'Dados do dependente foram atualizados.'),
      });

      // Refresh dependents list
      if (teacherId) {
        await fetchDependents(teacherId);
      }

      return data?.dependent;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error updating dependent';
      setError(errorMessage);
      toast({
        title: t('dependents.errors.updateFailed', 'Erro ao atualizar dependente'),
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [teacherId, toast, t, fetchDependents]);

  // Delete a dependent
  const deleteDependent = useCallback(async (dependentId: string, force: boolean = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: deleteError } = await supabase.functions.invoke('delete-dependent', {
        body: {
          dependent_id: dependentId,
          force,
        },
      });

      if (deleteError) throw deleteError;
      if (data?.error) throw new Error(data.error);

      toast({
        title: t('dependents.success.deleted', 'Dependente removido'),
        description: t('dependents.success.deletedDescription', 'Dependente foi removido com sucesso.'),
      });

      // Refresh dependents list
      if (teacherId) {
        await fetchDependents(teacherId);
      }

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error deleting dependent';
      setError(errorMessage);
      toast({
        title: t('dependents.errors.deleteFailed', 'Erro ao remover dependente'),
        description: errorMessage,
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [teacherId, toast, t, fetchDependents]);

  // Get count of students + dependents
  const getStudentAndDependentCount = useCallback(async (forTeacherId?: string) => {
    const targetTeacherId = forTeacherId || teacherId;
    if (!targetTeacherId) return { total_students: 0, regular_students: 0, dependents_count: 0 };

    try {
      const { data, error: countError } = await supabase
        .rpc('count_teacher_students_and_dependents', { p_teacher_id: targetTeacherId });

      if (countError) throw countError;

      return data?.[0] || { total_students: 0, regular_students: 0, dependents_count: 0 };
    } catch (err) {
      console.error('Error getting student count:', err);
      return { total_students: 0, regular_students: 0, dependents_count: 0 };
    }
  }, [teacherId]);

  return {
    dependents,
    isLoading,
    error,
    fetchDependents,
    fetchDependentsForResponsible,
    createDependent,
    updateDependent,
    deleteDependent,
    getStudentAndDependentCount,
  };
}
