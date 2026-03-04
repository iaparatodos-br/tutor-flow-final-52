import { useState } from "react";
import { StripeAccountGuard } from "@/components/StripeAccountGuard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DollarSign, AlertTriangle, AlertCircle, Baby, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { calculateBoletoFees, formatCurrency, validateBoletoAmount, MINIMUM_BOLETO_AMOUNT } from "@/utils/stripe-fees";
import { parse, format as dfFormat } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/contexts/ProfileContext";
import { todayDateString, DEFAULT_TIMEZONE } from "@/utils/timezone";
interface Student {
  id: string;
  name: string;
  email: string;
}
interface Dependent {
  id: string;
  name: string;
  responsible_id: string;
  responsible_name: string;
}
interface CreateInvoiceModalProps {
  students: Student[];
  dependents?: Dependent[];
  onInvoiceCreated?: () => void;
}
export function CreateInvoiceModal({
  students,
  dependents = [],
  onInvoiceCreated
}: CreateInvoiceModalProps) {
  const {
    t
  } = useTranslation('financial');
  const { profile } = useProfile();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    student_id: "",
    dependent_id: "",
    amount: "",
    description: "",
    due_date: ""
  });

  // Parse selected value - format: "student:{id}" or "dependent:{id}"
  const handleRecipientChange = (value: string) => {
    const [type, id] = value.split(':');
    if (type === 'student') {
      setFormData(prev => ({
        ...prev,
        student_id: id,
        dependent_id: ""
      }));
    } else if (type === 'dependent') {
      const dependent = dependents.find(d => d.id === id);
      if (dependent) {
        setFormData(prev => ({
          ...prev,
          student_id: dependent.responsible_id,
          dependent_id: id
        }));
      }
    }
  };

  // Get current selection value for display
  const getSelectedValue = () => {
    if (formData.dependent_id) {
      return `dependent:${formData.dependent_id}`;
    }
    if (formData.student_id && !formData.dependent_id) {
      return `student:${formData.student_id}`;
    }
    return "";
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      if (!formData.student_id || !formData.amount) {
        throw new Error(t('errors.studentAndAmountRequired') || "Destinatário e valor são obrigatórios");
      }
      const {
        data,
        error
      } = await supabase.functions.invoke('create-invoice', {
        body: {
          student_id: formData.student_id,
          dependent_id: formData.dependent_id || undefined,
          amount: parseFloat(formData.amount),
          description: formData.description || undefined,
          due_date: formData.due_date || undefined,
          invoice_type: 'manual'
        }
      });
      if (error) throw error;
      if (data && !data.success) {
        if (data.error?.includes("defina um negócio de recebimento")) {
          setError(data.error);
          return;
        }
        throw new Error(data.error || "Erro ao criar fatura");
      }
      toast.success(t('messages.invoiceCreated') || "Fatura criada com sucesso!");
      setIsOpen(false);
      setFormData({
        student_id: "",
        dependent_id: "",
        amount: "",
        description: "",
        due_date: ""
      });
      if (onInvoiceCreated) {
        onInvoiceCreated();
      }
    } catch (error: any) {
      console.error('Erro ao criar fatura:', error);

      // Tentar extrair mensagem amigável do FunctionsHttpError
      let errorMessage = "Erro inesperado ao criar fatura";

      // Se o erro tem context.body (FunctionsHttpError), tentar parsear
      if (error?.context?.body) {
        try {
          const body = typeof error.context.body === 'string' ? JSON.parse(error.context.body) : error.context.body;
          if (body?.error) {
            errorMessage = body.error;
          }
        } catch {
          // Se não conseguir parsear, usar mensagem padrão
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };
  return <StripeAccountGuard>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <DollarSign className="h-4 w-4 mr-2" />
          {t('actions.newInvoice') || 'Nova Fatura'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('modal.createTitle') || 'Criar Nova Fatura'}</DialogTitle>
            <DialogDescription>
              {t('modal.createDescription') || 'A fatura será direcionada automaticamente para a conta bancária configurada para o aluno selecionado.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && <Alert className="border-destructive bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-destructive">
                  {error}
                </AlertDescription>
              </Alert>}

            <div className="space-y-2">
              <Label htmlFor="recipient">{t('fields.recipient') || 'Destinatário'} *</Label>
              <Select value={getSelectedValue()} onValueChange={handleRecipientChange} required>
                <SelectTrigger>
                  <SelectValue placeholder={t('placeholders.selectRecipient') || 'Selecione um destinatário'} />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  {/* Students Group */}
                  {students.length > 0 && <SelectGroup>
                      <SelectLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t('groups.students') || 'Alunos'}
                      </SelectLabel>
                      {students.map(student => <SelectItem key={`student-${student.id}`} value={`student:${student.id}`}>
                          {student.name} ({student.email})
                        </SelectItem>)}
                    </SelectGroup>}
                  
                  {/* Dependents Group */}
                  {dependents.length > 0 && <SelectGroup>
                      <SelectLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t('groups.dependents') || 'Dependentes'}
                      </SelectLabel>
                      {dependents.map(dependent => <SelectItem key={`dependent-${dependent.id}`} value={`dependent:${dependent.id}`}>
                          <span className="flex items-center gap-1.5">
                            <Baby className="h-3.5 w-3.5 text-purple-600" />
                            {dependent.name}
                            <span className="text-muted-foreground">
                              ({t('groups.childOf') || 'filho de'} {dependent.responsible_name})
                            </span>
                          </span>
                        </SelectItem>)}
                    </SelectGroup>}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Valor (R$) *</Label>
              <Input id="amount" type="number" step="0.01" min={MINIMUM_BOLETO_AMOUNT} placeholder="5,00" value={formData.amount} onChange={e => setFormData(prev => ({
                ...prev,
                amount: e.target.value
              }))} required />
              {formData.amount && parseFloat(formData.amount) > 0 && !validateBoletoAmount(parseFloat(formData.amount)).valid && <p className="text-sm text-destructive">
                  {validateBoletoAmount(parseFloat(formData.amount)).error}
                </p>}
            </div>

            {/* Fee Breakdown */}
            {formData.amount && parseFloat(formData.amount) >= MINIMUM_BOLETO_AMOUNT && <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertTitle className="text-sm text-amber-900 dark:text-amber-100">Previsão de Recebimento</AlertTitle>
                <AlertDescription className="text-sm space-y-1">
                  <div className="flex justify-between text-amber-800 dark:text-amber-300">
                    <span>Valor da fatura:</span>
                    <span className="font-medium">{formatCurrency(parseFloat(formData.amount))}</span>
                  </div>
                  <div className="flex justify-between text-amber-700 dark:text-amber-400">
                    <span>Taxa Stripe (boleto):</span>
                    <span>-R$ 3,49</span>
                  </div>
                  <div className="flex justify-between font-bold text-green-600 dark:text-green-400 pt-1 border-t border-amber-200 dark:border-amber-800">
                    <span>Você receberá:</span>
                    <span>{formatCurrency(calculateBoletoFees(parseFloat(formData.amount)).netAmount)}</span>
                  </div>
                </AlertDescription>
              </Alert>}

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" placeholder="Descrição da fatura (opcional)" value={formData.description} onChange={e => setFormData(prev => ({
                ...prev,
                description: e.target.value
              }))} />
            </div>

            <div className="space-y-2">
              <Label>Data de Vencimento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10",
                      !formData.due_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
                    {formData.due_date
                      ? dfFormat(parse(formData.due_date, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM, yyyy", { locale: ptBR })
                      : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.due_date ? parse(formData.due_date, 'yyyy-MM-dd', new Date()) : undefined}
                    onSelect={(date) => {
                      if (date) setFormData(prev => ({ ...prev, due_date: dfFormat(date, 'yyyy-MM-dd') }));
                    }}
                    locale={ptBR}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Se não informada, será definida para 15 dias a partir de hoje
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || formData.amount && parseFloat(formData.amount) > 0 && !validateBoletoAmount(parseFloat(formData.amount)).valid}>
              {isSubmitting ? "Criando..." : "Criar Fatura"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>
    </StripeAccountGuard>;
}