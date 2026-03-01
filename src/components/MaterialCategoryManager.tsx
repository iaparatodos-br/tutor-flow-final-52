import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/contexts/ProfileContext";
import { toast } from "sonner";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CategoryModal } from "./CategoryModal";
import { Skeleton } from "@/components/ui/skeleton";

interface MaterialCategory {
  id: string;
  name: string;
  description: string | null;
  color: string;
}

interface MaterialCategoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoriesChanged: () => void;
}

export function MaterialCategoryManager({ isOpen, onClose, onCategoriesChanged }: MaterialCategoryManagerProps) {
  const { profile } = useProfile();
  const { t } = useTranslation('materials');
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MaterialCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<MaterialCategory | null>(null);

  useEffect(() => {
    if (isOpen) loadCategories();
  }, [isOpen]);

  const loadCategories = async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('material_categories')
        .select('id, name, description, color')
        .eq('teacher_id', profile.id)
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;
    try {
      const { error } = await supabase
        .from('material_categories')
        .delete()
        .eq('id', deletingCategory.id);

      if (error) throw error;
      toast.success(t('categoryManager.deleted'));
      loadCategories();
      onCategoriesChanged();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error(t('categoryManager.deleteError'));
    } finally {
      setDeletingCategory(null);
    }
  };

  const handleEdit = (cat: MaterialCategory) => {
    setEditingCategory(cat);
    setCategoryModalOpen(true);
  };

  const handleNewCategory = () => {
    setEditingCategory(null);
    setCategoryModalOpen(true);
  };

  const handleCategoryAdded = () => {
    loadCategories();
    onCategoriesChanged();
    setCategoryModalOpen(false);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('categoryManager.title')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))
            ) : categories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('categoryManager.noCategories')}
              </p>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm font-medium">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(cat)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingCategory(cat)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <Button onClick={handleNewCategory} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            {t('categoryManager.newCategory')}
          </Button>
        </DialogContent>
      </Dialog>

      <CategoryModal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onCategoryAdded={handleCategoryAdded}
        category={editingCategory}
      />

      <AlertDialog open={!!deletingCategory} onOpenChange={() => setDeletingCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('categoryManager.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('categoryManager.confirmDeleteDescription', { name: deletingCategory?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('categoryManager.deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
