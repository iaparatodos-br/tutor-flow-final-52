import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/contexts/ProfileContext";
import { toast } from "sonner";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ExpenseCategoryModal } from "./ExpenseCategoryModal";
import { Skeleton } from "@/components/ui/skeleton";

interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
  is_default: boolean;
}

interface ExpenseCategoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoriesChanged: () => void;
}

export function ExpenseCategoryManager({ isOpen, onClose, onCategoriesChanged }: ExpenseCategoryManagerProps) {
  const { profile } = useProfile();
  const { t } = useTranslation('expenses');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ExpenseCategory | null>(null);

  useEffect(() => {
    if (isOpen) loadCategories();
  }, [isOpen]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('expense_categories')
        .select('id, name, color, is_default')
        .or(`teacher_id.eq.${profile!.id},is_default.eq.true`)
        .order('is_default', { ascending: false })
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
        .from('expense_categories')
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

  const handleEdit = (cat: ExpenseCategory) => {
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
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
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
                {t('category.noCategoriesFound')}
              </p>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm font-medium">{cat.name}</span>
                    {cat.is_default && (
                      <Badge variant="secondary" className="text-xs">
                        {t('categoryManager.default')}
                      </Badge>
                    )}
                  </div>
                  {!cat.is_default && (
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
                  )}
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

      <ExpenseCategoryModal
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
