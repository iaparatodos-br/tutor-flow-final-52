import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/contexts/ProfileContext";
import { toast } from "sonner";
import { Search, Users, UserCheck, UserX, User } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Dependent {
  id: string;
  name: string;
  hasAccess: boolean;
}

interface Student {
  id: string;
  name: string;
  email: string;
  hasAccess: boolean;
  dependents: Dependent[];
}

// Chave única para identificar seleção: "studentId" para responsável, "studentId:dependentId" para dependente
type SelectionKey = string;

interface ShareMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShared: () => void;
  material: {
    id: string;
    title: string;
  } | null;
}

function makeKey(studentId: string, dependentId: string | null): SelectionKey {
  return dependentId ? `${studentId}:${dependentId}` : studentId;
}

function parseKey(key: SelectionKey): { studentId: string; dependentId: string | null } {
  const parts = key.split(':');
  return {
    studentId: parts[0],
    dependentId: parts[1] || null
  };
}

export function ShareMaterialModal({ 
  isOpen, 
  onClose, 
  onShared,
  material 
}: ShareMaterialModalProps) {
  const { t } = useTranslation('materials');
  const { profile } = useProfile();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<SelectionKey>>(new Set());

  useEffect(() => {
    if (isOpen && material) {
      loadStudentsAndDependents();
    }
  }, [isOpen, material]);

  const loadStudentsAndDependents = async () => {
    if (!profile || !material) return;

    setLoading(true);
    try {
      // 1. Carregar alunos do professor
      const { data: studentsData, error: studentsError } = await supabase
        .from('teacher_student_relationships')
        .select(`
          student_id,
          profiles!teacher_student_relationships_student_id_fkey (
            id,
            name,
            email
          )
        `)
        .eq('teacher_id', profile.id);

      if (studentsError) throw studentsError;

      // 2. Carregar dependentes do professor
      const { data: dependentsData, error: dependentsError } = await supabase
        .from('dependents')
        .select('id, name, responsible_id')
        .eq('teacher_id', profile.id);

      if (dependentsError) throw dependentsError;

      // 3. Carregar acessos existentes (incluindo dependent_id)
      const { data: accessData, error: accessError } = await supabase
        .from('material_access')
        .select('student_id, dependent_id')
        .eq('material_id', material.id);

      if (accessError) throw accessError;

      // 4. Transformar dados - extrair profiles
      const studentProfiles = studentsData?.map(rel => rel.profiles).filter(Boolean) || [];

      // 5. Montar estrutura hierárquica com dependentes
      const studentsWithDependents: Student[] = studentProfiles.map(student => {
        // Verificar se o responsável tem acesso direto (sem dependent_id)
        const studentHasAccess = accessData?.some(
          a => a.student_id === student.id && !a.dependent_id
        ) || false;

        // Encontrar dependentes deste responsável
        const studentDependents: Dependent[] = (dependentsData || [])
          .filter(d => d.responsible_id === student.id)
          .map(d => ({
            id: d.id,
            name: d.name,
            hasAccess: accessData?.some(
              a => a.student_id === student.id && a.dependent_id === d.id
            ) || false
          }));

        return {
          id: student.id,
          name: student.name,
          email: student.email,
          hasAccess: studentHasAccess,
          dependents: studentDependents
        };
      });

      setStudents(studentsWithDependents);

      // 6. Inicializar seleção com itens que já têm acesso
      const initialSelection = new Set<SelectionKey>();
      studentsWithDependents.forEach(student => {
        if (student.hasAccess) {
          initialSelection.add(makeKey(student.id, null));
        }
        student.dependents.forEach(dep => {
          if (dep.hasAccess) {
            initialSelection.add(makeKey(student.id, dep.id));
          }
        });
      });
      setSelectedItems(initialSelection);

    } catch (error) {
      console.error('Error loading students and dependents:', error);
      toast.error("Erro ao carregar alunos e dependentes");
    } finally {
      setLoading(false);
    }
  };

  // Filtrar por nome do aluno, email, ou nome do dependente
  const filteredStudents = students.filter(student => {
    const searchLower = searchTerm.toLowerCase();
    const studentMatches = 
      student.name.toLowerCase().includes(searchLower) ||
      student.email.toLowerCase().includes(searchLower);
    const dependentMatches = student.dependents.some(d => 
      d.name.toLowerCase().includes(searchLower)
    );
    return studentMatches || dependentMatches;
  });

  // Contar total de itens selecionáveis (alunos + dependentes)
  const getTotalSelectableCount = () => {
    return filteredStudents.reduce((count, student) => {
      return count + 1 + student.dependents.length;
    }, 0);
  };

  const handleToggle = (studentId: string, dependentId: string | null) => {
    const key = makeKey(studentId, dependentId);
    const newSelection = new Set(selectedItems);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    setSelectedItems(newSelection);
  };

  const handleSelectAll = () => {
    const totalSelectable = getTotalSelectableCount();
    if (selectedItems.size === totalSelectable) {
      setSelectedItems(new Set());
    } else {
      const allKeys = new Set<SelectionKey>();
      filteredStudents.forEach(student => {
        allKeys.add(makeKey(student.id, null));
        student.dependents.forEach(dep => {
          allKeys.add(makeKey(student.id, dep.id));
        });
      });
      setSelectedItems(allKeys);
    }
  };

  const handleSave = async () => {
    if (!material || !profile) return;

    setSaving(true);
    try {
      // Obter acessos atuais
      const currentAccess = new Set<SelectionKey>();
      students.forEach(student => {
        if (student.hasAccess) {
          currentAccess.add(makeKey(student.id, null));
        }
        student.dependents.forEach(dep => {
          if (dep.hasAccess) {
            currentAccess.add(makeKey(student.id, dep.id));
          }
        });
      });

      // Identificar o que adicionar e remover
      const toAdd = Array.from(selectedItems).filter(key => !currentAccess.has(key));
      const toRemove = Array.from(currentAccess).filter(key => !selectedItems.has(key));

      // Adicionar novos acessos
      if (toAdd.length > 0) {
        const insertData = toAdd.map(key => {
          const { studentId, dependentId } = parseKey(key);
          return {
            material_id: material.id,
            student_id: studentId,
            dependent_id: dependentId,
            granted_by: profile.id
          };
        });

        const { error: insertError } = await supabase
          .from('material_access')
          .insert(insertData);

        if (insertError) throw insertError;
      }

      // Remover acessos
      if (toRemove.length > 0) {
        for (const key of toRemove) {
          const { studentId, dependentId } = parseKey(key);
          
          let query = supabase
            .from('material_access')
            .delete()
            .eq('material_id', material.id)
            .eq('student_id', studentId);
          
          if (dependentId) {
            query = query.eq('dependent_id', dependentId);
          } else {
            query = query.is('dependent_id', null);
          }
          
          const { error: deleteError } = await query;
          if (deleteError) throw deleteError;
        }
      }

      // Separar IDs de alunos e dependentes para notificação
      const addedStudentIds: string[] = [];
      const addedDependentIds: string[] = [];
      
      toAdd.forEach(key => {
        const { studentId, dependentId } = parseKey(key);
        if (dependentId) {
          addedDependentIds.push(dependentId);
        } else {
          addedStudentIds.push(studentId);
        }
      });

      // Enviar notificações
      if (addedStudentIds.length > 0 || addedDependentIds.length > 0) {
        try {
          await supabase.functions.invoke('send-material-shared-notification', {
            body: {
              material_id: material.id,
              student_ids: addedStudentIds,
              dependent_ids: addedDependentIds
            }
          });
          console.log('✅ Notificações de material enviadas');
        } catch (notifError) {
          console.error('Erro ao enviar notificações:', notifError);
        }
      }

      // Feedback de sucesso
      const addedCount = toAdd.length;
      const removedCount = toRemove.length;

      if (addedCount > 0 || removedCount > 0) {
        const messages: string[] = [];
        if (addedCount > 0) {
          messages.push(`compartilhado com ${addedCount} pessoa${addedCount !== 1 ? 's' : ''}`);
        }
        if (removedCount > 0) {
          messages.push(`acesso removido de ${removedCount} pessoa${removedCount !== 1 ? 's' : ''}`);
        }
        toast.success(`Material ${messages.join(' e ')}`);
      }

      onShared();
      onClose();

    } catch (error) {
      console.error('Error updating material access:', error);
      toast.error("Erro ao atualizar compartilhamento");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setSearchTerm("");
      setSelectedItems(new Set());
      onClose();
    }
  };

  if (!material) return null;

  const selectedCount = selectedItems.size;
  const totalCount = getTotalSelectableCount();

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('share')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {material.title}
          </p>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t('search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                disabled={saving}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                disabled={loading || saving || totalCount === 0}
              >
                {selectedCount === totalCount ? "Desmarcar Todos" : "Selecionar Todos"}
              </Button>
              <Badge variant="secondary">
                {selectedCount} de {totalCount} selecionado{selectedCount !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>

          <ScrollArea className="h-72 border rounded-lg p-2">
            {loading ? (
              <div className="text-center py-8">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Carregando...</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? "Nenhum resultado encontrado" : "Nenhum aluno cadastrado"}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredStudents.map((student) => (
                  <div key={student.id}>
                    {/* Aluno (responsável) */}
                    <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <Checkbox
                        checked={selectedItems.has(makeKey(student.id, null))}
                        onCheckedChange={() => handleToggle(student.id, null)}
                        disabled={saving}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {student.name}
                          </p>
                          {student.hasAccess && (
                            <Badge variant="secondary" className="text-xs">
                              <UserCheck className="h-3 w-3 mr-1" />
                              Acesso
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {student.email}
                        </p>
                      </div>
                      {selectedItems.has(makeKey(student.id, null)) ? (
                        <UserCheck className="h-4 w-4 text-green-600" />
                      ) : (
                        <UserX className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>

                    {/* Dependentes (indentados) */}
                    {student.dependents.length > 0 && (
                      <div className="ml-6 space-y-1 border-l-2 border-muted pl-4 my-1">
                        {student.dependents.map((dependent) => (
                          <div
                            key={dependent.id}
                            className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <Checkbox
                              checked={selectedItems.has(makeKey(student.id, dependent.id))}
                              onCheckedChange={() => handleToggle(student.id, dependent.id)}
                              disabled={saving}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  <User className="h-3 w-3 mr-1" />
                                  {t('sharing.dependentsGroup', 'Dependente')}
                                </Badge>
                                <span className="text-sm truncate">{dependent.name}</span>
                                {dependent.hasAccess && (
                                  <Badge variant="secondary" className="text-xs">
                                    <UserCheck className="h-3 w-3 mr-1" />
                                    Acesso
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {t('sharing.childOf', 'filho(a) de')} {student.name}
                              </p>
                            </div>
                            {selectedItems.has(makeKey(student.id, dependent.id)) ? (
                              <UserCheck className="h-4 w-4 text-green-600" />
                            ) : (
                              <UserX className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={saving}
            >
              {t('actions.cancel', 'Cancelar')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || saving}
              className="flex-1"
            >
              {saving ? t('actions.saving', 'Salvando...') : t('sharing.shareWith', 'Salvar Compartilhamento')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
