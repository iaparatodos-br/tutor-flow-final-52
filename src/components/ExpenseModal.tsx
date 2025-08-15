import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryModal } from "./CategoryModal";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Image, X, Plus, Settings } from "lucide-react";
import { formatDate } from "date-fns";

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseAdded: () => void;
  expense?: {
    id: string;
    description: string;
    amount: number;
    expense_date: string;
    category: string;
    receipt_url?: string;
  } | null;
}

interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
}

export function ExpenseModal({ isOpen, onClose, onExpenseAdded, expense }: ExpenseModalProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    expense_date: formatDate(new Date(), 'yyyy-MM-dd'),
    category: "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      if (expense) {
        setFormData({
          description: expense.description,
          amount: expense.amount.toString(),
          expense_date: expense.expense_date,
          category: expense.category,
        });
        if (expense.receipt_url) {
          setReceiptPreview(expense.receipt_url);
        }
      } else {
        resetForm();
      }
    }
  }, [isOpen, expense]);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('id, name, color')
        .or(`teacher_id.eq.${profile!.id},is_default.eq.true`)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      
      console.log('Categories loaded:', data); // Debug log
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      description: "",
      amount: "",
      expense_date: formatDate(new Date(), 'yyyy-MM-dd'),
      category: "",
    });
    setReceiptFile(null);
    setReceiptPreview(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
          title: "Erro",
          description: "O arquivo deve ter no máximo 5MB.",
          variant: "destructive",
        });
        return;
      }

      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Erro", 
          description: "Apenas arquivos JPG, PNG ou PDF são permitidos.",
          variant: "destructive",
        });
        return;
      }

      setReceiptFile(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setReceiptPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setReceiptPreview(null);
      }
    }
  };

  const uploadReceipt = async (): Promise<string | null> => {
    if (!receiptFile || !profile) return null;

    const fileExt = receiptFile.name.split('.').pop();
    const fileName = `${profile.id}/${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from('expense-receipts')
      .upload(fileName, receiptFile);

    if (error) {
      console.error('Error uploading receipt:', error);
      throw error;
    }

    // Return the file path instead of public URL since the bucket is private
    return fileName;
  };

  const handleSubmit = async () => {
    if (!formData.description.trim() || !formData.amount || !formData.category) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      let receiptUrl = expense?.receipt_url || null;
      
      if (receiptFile) {
        receiptUrl = await uploadReceipt();
      }

      const expenseData = {
        teacher_id: profile!.id,
        description: formData.description.trim(),
        amount: parseFloat(formData.amount),
        expense_date: formData.expense_date,
        category: formData.category,
        receipt_url: receiptUrl,
      };

      let error;
      if (expense) {
        ({ error } = await supabase
          .from('expenses')
          .update(expenseData)
          .eq('id', expense.id));
      } else {
        ({ error } = await supabase
          .from('expenses')
          .insert([expenseData]));
      }

      if (error) throw error;

      toast({
        title: expense ? "Despesa Atualizada" : "Despesa Cadastrada",
        description: expense ? "A despesa foi atualizada com sucesso." : "A despesa foi cadastrada com sucesso.",
      });

      onExpenseAdded();
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error saving expense:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a despesa. Tente novamente.",
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
          <DialogTitle>{expense ? "Editar Despesa" : "Nova Despesa"}</DialogTitle>
          <DialogDescription>
            {expense ? "Atualize os dados da despesa" : "Cadastre uma nova despesa"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Descrição *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descreva a despesa..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0,00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense_date">Data *</Label>
              <Input
                id="expense_date"
                type="date"
                value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="category">Categoria *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCategoryModalOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Nova Categoria
              </Button>
            </div>
            <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.length === 0 ? (
                  <div className="p-2 text-center text-muted-foreground">
                    Nenhuma categoria encontrada
                  </div>
                ) : (
                  categories.map((category) => (
                    <SelectItem key={category.id} value={category.name}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Comprovante</Label>
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4">
              {receiptPreview ? (
                <div className="space-y-2">
                  {receiptPreview.startsWith('data:image/') ? (
                    <div className="relative">
                      <img 
                        src={receiptPreview} 
                        alt="Comprovante" 
                        className="w-full h-32 object-cover rounded"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setReceiptFile(null);
                          setReceiptPreview(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-muted rounded">
                      <FileText className="h-4 w-4" />
                      <span className="text-sm">Comprovante anexado</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReceiptFile(null);
                          setReceiptPreview(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="h-8 w-8" />
                    <p className="text-sm">Clique para fazer upload</p>
                    <p className="text-xs">JPG, PNG ou PDF até 5MB</p>
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Salvando..." : expense ? "Atualizar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <CategoryModal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onCategoryAdded={() => {
          loadCategories();
          setCategoryModalOpen(false);
        }}
      />
    </Dialog>
  );
}