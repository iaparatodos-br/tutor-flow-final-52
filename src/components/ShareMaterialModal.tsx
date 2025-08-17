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
import { Search, Users, UserCheck, UserX } from "lucide-react";

interface Student {
  id: string;
  name: string;
  email: string;
  hasAccess: boolean;
}

interface ShareMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShared: () => void;
  material: {
    id: string;
    title: string;
  } | null;
}

export function ShareMaterialModal({ 
  isOpen, 
  onClose, 
  onShared,
  material 
}: ShareMaterialModalProps) {
  const { profile } = useProfile();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && material) {
      loadStudents();
    }
  }, [isOpen, material]);

  const loadStudents = async () => {
    if (!profile || !material) return;

    setLoading(true);
    try {
      // Load all students of this teacher
      const { data: studentsData, error: studentsError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('teacher_id', profile.id)
        .eq('role', 'aluno')
        .order('name');

      if (studentsError) throw studentsError;

      // Load existing access for this material
      const { data: accessData, error: accessError } = await supabase
        .from('material_access')
        .select('student_id')
        .eq('material_id', material.id);

      if (accessError) throw accessError;

      const existingAccess = new Set(accessData.map(item => item.student_id));

      const studentsWithAccess = studentsData.map(student => ({
        ...student,
        hasAccess: existingAccess.has(student.id)
      }));

      setStudents(studentsWithAccess);
      setSelectedStudents(new Set(studentsWithAccess.filter(s => s.hasAccess).map(s => s.id)));

    } catch (error) {
      console.error('Error loading students:', error);
      toast.error("Erro ao carregar alunos");
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStudentToggle = (studentId: string) => {
    const newSelection = new Set(selectedStudents);
    if (newSelection.has(studentId)) {
      newSelection.delete(studentId);
    } else {
      newSelection.add(studentId);
    }
    setSelectedStudents(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedStudents.size === filteredStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const handleSave = async () => {
    if (!material || !profile) return;

    setSaving(true);
    try {
      // Get current access
      const currentAccess = new Set(students.filter(s => s.hasAccess).map(s => s.id));
      
      // Find students to add and remove
      const toAdd = Array.from(selectedStudents).filter(id => !currentAccess.has(id));
      const toRemove = Array.from(currentAccess).filter(id => !selectedStudents.has(id));

      // Add new access
      if (toAdd.length > 0) {
        const { error: insertError } = await supabase
          .from('material_access')
          .insert(
            toAdd.map(studentId => ({
              material_id: material.id,
              student_id: studentId,
              granted_by: profile.id
            }))
          );

        if (insertError) throw insertError;
      }

      // Remove access
      if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('material_access')
          .delete()
          .eq('material_id', material.id)
          .in('student_id', toRemove);

        if (deleteError) throw deleteError;
      }

      const addedCount = toAdd.length;
      const removedCount = toRemove.length;

      if (addedCount > 0 || removedCount > 0) {
        toast.success(
          `Material ${addedCount > 0 ? `compartilhado com ${addedCount} aluno${addedCount !== 1 ? 's' : ''}` : ''}${
            addedCount > 0 && removedCount > 0 ? ' e ' : ''
          }${removedCount > 0 ? `acesso removido de ${removedCount} aluno${removedCount !== 1 ? 's' : ''}` : ''}`
        );
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
      setSelectedStudents(new Set());
      onClose();
    }
  };

  if (!material) return null;

  const selectedCount = selectedStudents.size;
  const totalCount = filteredStudents.length;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Compartilhar Material
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
                placeholder="Buscar alunos..."
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

          <ScrollArea className="h-64 border rounded-lg p-2">
            {loading ? (
              <div className="text-center py-8">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Carregando alunos...</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? "Nenhum aluno encontrado" : "Nenhum aluno cadastrado"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedStudents.has(student.id)}
                      onCheckedChange={() => handleStudentToggle(student.id)}
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
                    {selectedStudents.has(student.id) ? (
                      <UserCheck className="h-4 w-4 text-success" />
                    ) : (
                      <UserX className="h-4 w-4 text-muted-foreground" />
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
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || saving}
            >
              {saving ? "Salvando..." : "Salvar Compartilhamento"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}