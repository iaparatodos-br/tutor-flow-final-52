import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/contexts/ProfileContext";
import { toast } from "sonner";
import { Palette } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ExpenseCategoryModalProps {
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
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B",
  "#8B5CF6", "#F97316", "#06B6D4", "#84CC16",
  "#EC4899", "#6B7280", "#DC2626", "#059669"
];

export function ExpenseCategoryModal({ 
  isOpen, 
  onClose, 
  onCategoryAdded, 
  category = null 
}: ExpenseCategoryModalProps) {
  const { profile } = useProfile();
  const { t } = useTranslation('expenses');
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setColor(category.color);
    } else {
      setName("");
      setColor(PRESET_COLORS[0]);
    }
  }, [category, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile || !name.trim()) {
      toast.error(t('categoryModal.nameRequired'));
      return;
    }

    setLoading(true);
    
    try {
      if (category) {
        const { error } = await supabase
          .from('expense_categories')
          .update({ name: name.trim(), color })
          .eq('id', category.id);

        if (error) throw error;
        toast.success(t('categoryModal.updated'));
      } else {
        const { error } = await supabase
          .from('expense_categories')
          .insert({
            name: name.trim(),
            color,
            teacher_id: profile.id
          });

        if (error) throw error;
        toast.success(t('categoryModal.created'));
      }

      onCategoryAdded();
      onClose();
    } catch (error) {
      console.error('Error saving expense category:', error);
      toast.error(t('categoryModal.saveError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {category ? t('categoryModal.editTitle') : t('categoryModal.newTitle')}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expense-cat-name">{t('categoryModal.name')} *</Label>
            <Input
              id="expense-cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('categoryModal.namePlaceholder')}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              {t('categoryModal.color')}
            </Label>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  className={`
                    w-8 h-8 rounded-full border-2 transition-all
                    ${color === presetColor 
                      ? 'border-foreground scale-110' 
                      : 'border-border hover:scale-105'
                    }
                  `}
                  style={{ backgroundColor: presetColor }}
                  onClick={() => setColor(presetColor)}
                  disabled={loading}
                />
              ))}
            </div>
          </div>

          <div className="p-3 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded-full" 
                style={{ backgroundColor: color }}
              />
              <span className="font-medium">{t('categoryModal.preview')}:</span>
              <span>{name || t('categoryModal.previewPlaceholder')}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading 
                ? t('actions.saving')
                : category 
                  ? t('actions.update')
                  : t('actions.register')
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
