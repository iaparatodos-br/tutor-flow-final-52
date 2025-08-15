import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryAdded: () => void;
  category?: {
    id: string;
    name: string;
    color: string;
  } | null;
}

const PRESET_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#8B5CF6', // Purple
  '#EF4444', // Red
  '#EC4899', // Pink
  '#6B7280', // Gray
  '#64748B', // Slate
];

export function CategoryModal({ isOpen, onClose, onCategoryAdded, category }: CategoryModalProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    color: PRESET_COLORS[0],
  });

  useEffect(() => {
    if (isOpen) {
      if (category) {
        setFormData({
          name: category.name,
          color: category.color,
        });
      } else {
        setFormData({
          name: "",
          color: PRESET_COLORS[0],
        });
      }
    }
  }, [isOpen, category]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "O nome da categoria é obrigatório.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const categoryData = {
        teacher_id: profile!.id,
        name: formData.name.trim(),
        color: formData.color,
        is_default: false,
      };

      let error;
      if (category) {
        ({ error } = await supabase
          .from('expense_categories')
          .update(categoryData)
          .eq('id', category.id));
      } else {
        ({ error } = await supabase
          .from('expense_categories')
          .insert([categoryData]));
      }

      if (error) throw error;

      toast({
        title: category ? "Categoria Atualizada" : "Categoria Criada",
        description: category ? "A categoria foi atualizada com sucesso." : "A categoria foi criada com sucesso.",
      });

      onCategoryAdded();
      onClose();
    } catch (error) {
      console.error('Error saving category:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a categoria. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
          <DialogDescription>
            {category ? "Atualize os dados da categoria" : "Crie uma nova categoria de despesas"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Categoria *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Material didático"
            />
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-12 h-12 rounded-lg border-2 ${
                    formData.color === color ? 'border-foreground' : 'border-border'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({ ...formData, color })}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <div 
              className="w-4 h-4 rounded-full" 
              style={{ backgroundColor: formData.color }}
            />
            <span className="text-sm">
              Preview: {formData.name || 'Nome da categoria'}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Salvando..." : category ? "Atualizar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}