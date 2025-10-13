import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/contexts/ProfileContext";
import { toast } from "sonner";
import { Palette } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryAdded: () => void;
  category?: {
    id: string;
    name: string;
    description: string | null;
    color: string;
  } | null;
}

const PRESET_COLORS = [
  "#3B82F6", // blue
  "#EF4444", // red
  "#10B981", // green
  "#F59E0B", // yellow
  "#8B5CF6", // purple
  "#F97316", // orange
  "#06B6D4", // cyan
  "#84CC16", // lime
  "#EC4899", // pink
  "#6B7280", // gray
  "#DC2626", // red-600
  "#059669"  // green-600
];

export function CategoryModal({ 
  isOpen, 
  onClose, 
  onCategoryAdded, 
  category = null 
}: CategoryModalProps) {
  const { profile } = useProfile();
  const { t } = useTranslation('materials');
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setDescription(category.description || "");
      setColor(category.color);
    } else {
      setName("");
      setDescription("");
      setColor(PRESET_COLORS[0]);
    }
  }, [category, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile || !name.trim()) {
      toast.error(t('category.nameRequired'));
      return;
    }

    setLoading(true);
    
    try {
      if (category) {
        // Update existing category
        const { error } = await supabase
          .from('material_categories')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            color
          })
          .eq('id', category.id);

        if (error) throw error;
        toast.success(t('category.updated'));
      } else {
        // Create new category
        const { error } = await supabase
          .from('material_categories')
          .insert({
            name: name.trim(),
            description: description.trim() || null,
            color,
            teacher_id: profile.id
          });

        if (error) throw error;
        toast.success(t('category.created'));
      }

      onCategoryAdded();
      onClose();
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error(t('category.saveError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category ? t('category.edit') : t('category.new')}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('category.name')} *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('category.namePlaceholder')}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('category.description')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('category.descriptionPlaceholder')}
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              {t('category.color')}
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
              <span className="font-medium">{t('category.preview')}:</span>
              <span>{name || t('category.previewPlaceholder')}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || loading}
            >
              {loading 
                ? t('actions.saving')
                : category 
                  ? t('actions.update')
                  : t('actions.create')
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}