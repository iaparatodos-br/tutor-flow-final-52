import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Users, Share2, UserCheck } from "lucide-react";

interface Student {
  id: string;
  name: string;
  email: string;
}

interface Material {
  id: string;
  title: string;
  file_name: string;
  category?: {
    name: string;
    color: string;
  };
}

interface MaterialAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: Material | null;
  onSuccess: () => void;
}

interface StudentWithAccess extends Student {
  hasAccess: boolean;
  grantedAt?: string;
}

export function MaterialAccessModal({
  open,
  onOpenChange,
  material,
  onSuccess
}: MaterialAccessModalProps) {
  const { profile } = useAuth();
  const [students, setStudents] = useState<StudentWithAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (open && material && profile) {
      loadStudents();
    }
  }, [open, material, profile]);

  const loadStudents = async () => {
    if (!profile || !material) return;

    setLoading(true);
    try {
      // Get all students
      const { data: studentsData, error: studentsError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('teacher_id', profile.id)
        .eq('role', 'aluno')
        .order('name');

      if (studentsError) throw studentsError;

      // Get current access for this material
      const { data: accessData, error: accessError } = await supabase
        .from('material_access')
        .select('student_id, granted_at')
        .eq('material_id', material.id);

      if (accessError) throw accessError;

      // Combine data
      const studentsWithAccess: StudentWithAccess[] = (studentsData || []).map(student => {
        const access = accessData?.find(a => a.student_id === student.id);
        return {
          ...student,
          hasAccess: !!access,
          grantedAt: access?.granted_at
        };
      });

      setStudents(studentsWithAccess);
    } catch (error) {
      console.error('Error loading students:', error);
      toast.error("Erro ao carregar lista de alunos");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAccess = async (studentId: string, hasAccess: boolean) => {
    if (!material || !profile) return;

    setUpdating(true);
    try {
      if (hasAccess) {
        // Grant access
        const { error } = await supabase
          .from('material_access')
          .insert({
            material_id: material.id,
            student_id: studentId,
            granted_by: profile.id
          });

        if (error) throw error;
        toast.success("Acesso concedido!");
      } else {
        // Revoke access
        const { error } = await supabase
          .from('material_access')
          .delete()
          .eq('material_id', material.id)
          .eq('student_id', studentId);

        if (error) throw error;
        toast.success("Acesso revogado!");
      }

      // Reload data
      await loadStudents();
      onSuccess();
    } catch (error) {
      console.error('Error toggling access:', error);
      toast.error("Erro ao atualizar acesso");
    } finally {
      setUpdating(false);
    }
  };

  const handleGrantAllAccess = async () => {
    if (!material || !profile) return;

    setUpdating(true);
    try {
      const studentsWithoutAccess = students.filter(s => !s.hasAccess);
      
      if (studentsWithoutAccess.length === 0) {
        toast.info("Todos os alunos já têm acesso a este material");
        return;
      }

      const accessRecords = studentsWithoutAccess.map(student => ({
        material_id: material.id,
        student_id: student.id,
        granted_by: profile.id
      }));

      const { error } = await supabase
        .from('material_access')
        .insert(accessRecords);

      if (error) throw error;

      toast.success(`Acesso concedido para ${studentsWithoutAccess.length} aluno(s)!`);
      await loadStudents();
      onSuccess();
    } catch (error) {
      console.error('Error granting all access:', error);
      toast.error("Erro ao conceder acesso em lote");
    } finally {
      setUpdating(false);
    }
  };

  const handleRevokeAllAccess = async () => {
    if (!material || !profile) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('material_access')
        .delete()
        .eq('material_id', material.id);

      if (error) throw error;

      toast.success("Acesso revogado para todos os alunos!");
      await loadStudents();
      onSuccess();
    } catch (error) {
      console.error('Error revoking all access:', error);
      toast.error("Erro ao revogar acesso em lote");
    } finally {
      setUpdating(false);
    }
  };

  if (!material) return null;

  const studentsWithAccess = students.filter(s => s.hasAccess).length;
  const totalStudents = students.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[600px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Share2 className="h-5 w-5" />
            <span>Gerenciar Acesso</span>
          </DialogTitle>
        </DialogHeader>

        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center space-x-2">
              <span className="text-2xl">📄</span>
              <div>
                <div>{material.title}</div>
                <div className="text-sm font-normal text-muted-foreground">
                  {material.file_name}
                </div>
              </div>
            </CardTitle>
            {material.category && (
              <Badge
                variant="secondary"
                style={{ 
                  backgroundColor: `${material.category.color}20`, 
                  color: material.category.color 
                }}
              >
                {material.category.name}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>
                {studentsWithAccess} de {totalStudents} alunos com acesso
              </span>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Carregando alunos...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label className="text-base font-medium">Alunos</Label>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGrantAllAccess}
                  disabled={updating || students.every(s => s.hasAccess)}
                >
                  Dar acesso a todos
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRevokeAllAccess}
                  disabled={updating || !students.some(s => s.hasAccess)}
                >
                  Revogar todos
                </Button>
              </div>
            </div>

            {students.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">Nenhum aluno cadastrado</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={student.hasAccess}
                      onCheckedChange={(checked) => 
                        handleToggleAccess(student.id, checked as boolean)
                      }
                      disabled={updating}
                    />
                    <div className="flex-1">
                      <div className="font-medium flex items-center space-x-2">
                        <span>{student.name}</span>
                        {student.hasAccess && (
                          <UserCheck className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {student.email}
                      </div>
                      {student.hasAccess && student.grantedAt && (
                        <div className="text-xs text-muted-foreground">
                          Acesso concedido em {new Date(student.grantedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)} disabled={updating}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}