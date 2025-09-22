import { useState } from "react";
import { StripeAccountGuard } from "@/components/StripeAccountGuard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DollarSign, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Student {
  id: string;
  name: string;
  email: string;
}

interface CreateInvoiceModalProps {
  students: Student[];
  onInvoiceCreated?: () => void;
}

export function CreateInvoiceModal({ students, onInvoiceCreated }: CreateInvoiceModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    student_id: "",
    amount: "",
    description: "",
    due_date: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!formData.student_id || !formData.amount) {
        throw new Error("Estudante e valor são obrigatórios");
      }

      const { data, error } = await supabase.functions.invoke('create-invoice', {
        body: {
          student_id: formData.student_id,
          amount: parseFloat(formData.amount),
          description: formData.description || undefined,
          due_date: formData.due_date || undefined,
          invoice_type: 'manual',
        }
      });

      if (error) throw error;

      if (data && !data.success) {
        // Check for business profile validation error
        if (data.error?.includes("defina um negócio de recebimento")) {
          setError(data.error);
          return;
        }
        throw new Error(data.error || "Erro ao criar fatura");
      }

      toast.success("Fatura criada com sucesso!");
      setIsOpen(false);
      setFormData({
        student_id: "",
        amount: "",
        description: "",
        due_date: "",
      });

      if (onInvoiceCreated) {
        onInvoiceCreated();
      }

    } catch (error: any) {
      console.error('Erro ao criar fatura:', error);
      setError(error.message || "Erro inesperado ao criar fatura");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <StripeAccountGuard requireChargesEnabled={true}>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Nova Fatura
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Criar Nova Fatura</DialogTitle>
            <DialogDescription>
              A fatura será direcionada automaticamente para a conta bancária 
              configurada para o aluno selecionado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <Alert className="border-destructive bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-destructive">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="student">Aluno *</Label>
              <Select
                value={formData.student_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, student_id: value }))}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um aluno" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name} ({student.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Valor (R$) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descrição da fatura (opcional)"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">Data de Vencimento</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Se não informada, será definida para 15 dias a partir de hoje
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
            >
              {isSubmitting ? "Criando..." : "Criar Fatura"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>
    </StripeAccountGuard>
  );
}