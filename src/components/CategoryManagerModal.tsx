import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface CategoryManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  category?: { id: string; name: string; description: string | null; color: string };
}

const colorOptions = [
  { name: 'Azul', value: '#3B82F6' },
  { name: 'Verde', value: '#10B981' },
  { name: 'Roxo', value: '#8B5CF6' },
  { name: 'Rosa', value: '#EC4899' },
  { name: 'Amarelo', value: '#F59E0B' },
  { name: 'Vermelho', value: '#EF4444' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Laranja', value: '#F97316' },
  { name: 'Cinza', value: '#6B7280' },
];

export function CategoryManagerModal({
  open,
  onOpenChange,
  onSuccess,
  category
}: CategoryManagerModalProps) {
  const { profile } = useAuth();
  const [name, setName] = useState(category?.name || "");
  const [description, setDescription] = useState(category?.description || "");
  const [color, setColor] = useState(category?.color || colorOptions[0].value);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile || !name.trim()) {
      toast.error("Nome da categoria é obrigatório");
      return;
    }

    setLoading(true);

    try {
      const categoryData = {
        teacher_id: profile.id,
        name: name.trim(),
        description: description.trim() || null,
        color
      };

      if (category) {
        // Update existing category
        const { error } = await supabase
          .from('material_categories')
          .update(categoryData)
          .eq('id', category.id);

        if (error) throw error;
        toast.success("Categoria atualizada com sucesso!");
      } else {
        // Create new category
        const { error } = await supabase
          .from('material_categories')
          .insert(categoryData);

        if (error) throw error;
        toast.success("Categoria criada com sucesso!");
      }

      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error("Erro ao salvar categoria");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName(category?.name || "");
      setDescription(category?.description || "");
      setColor(category?.color || colorOptions[0].value);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {category ? 'Editar Categoria' : 'Nova Categoria'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Categoria *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Nível A1, Gramática, Provas..."
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional da categoria"
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label>Cor da Categoria</Label>
            <div className="grid grid-cols-5 gap-2">
              {colorOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`w-full h-10 rounded-md border-2 transition-all hover:scale-105 ${
                    color === option.value 
                      ? 'border-foreground shadow-md' 
                      : 'border-transparent hover:border-muted-foreground'
                  }`}
                  style={{ backgroundColor: option.value }}
                  onClick={() => setColor(option.value)}
                  disabled={loading}
                  title={option.name}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cor selecionada: {colorOptions.find(opt => opt.value === color)?.name}
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg border bg-muted/50">
              <div className="text-sm font-medium mb-1">Preview:</div>
              <div className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm">
                  {name || "Nome da categoria"}
                </span>
              </div>
              {description && (
                <p className="text-xs text-muted-foreground mt-1">
                  {description}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Salvando..." : category ? "Atualizar" : "Criar Categoria"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}