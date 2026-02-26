import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Baby, CalendarIcon, FileText, Loader2 } from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Dependent, DependentFormData } from "@/hooks/useDependents";

interface DependentFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: DependentFormData) => Promise<void>;
  isSubmitting?: boolean;
  dependent?: Dependent | null;
  responsibleName?: string;
}

export function DependentFormModal({
  isOpen,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
  dependent,
  responsibleName,
}: DependentFormModalProps) {
  const { t } = useTranslation('students');
  const isEditing = !!dependent;

  const [formData, setFormData] = useState<DependentFormData>({
    name: "",
    birth_date: "",
    notes: "",
  });

  const [validationErrors, setValidationErrors] = useState({
    name: false,
  });

  // Reset form when modal opens/closes or dependent changes
  useEffect(() => {
    if (isOpen) {
      if (dependent) {
        setFormData({
          name: dependent.dependent_name || "",
          birth_date: dependent.birth_date || "",
          notes: dependent.notes || "",
        });
      } else {
        setFormData({
          name: "",
          birth_date: "",
          notes: "",
        });
      }
      setValidationErrors({ name: false });
    }
  }, [isOpen, dependent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const errors = {
      name: !formData.name.trim(),
    };
    setValidationErrors(errors);

    if (errors.name) {
      return;
    }

    await onSubmit(formData);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Baby className="h-5 w-5" />
              {isEditing
                ? t('dependents.modal.editTitle', 'Editar Dependente')
                : t('dependents.modal.addTitle', 'Adicionar Dependente')}
            </DialogTitle>
            <DialogDescription>
              {responsibleName && (
                <span className="text-foreground">
                  {t('dependents.modal.responsibleLabel', 'Responsável')}: <strong>{responsibleName}</strong>
                </span>
              )}
              {!responsibleName && !isEditing && (
                t('dependents.modal.addDescription', 'Adicione um dependente para este responsável.')
              )}
              {isEditing && (
                t('dependents.modal.editDescription', 'Atualize os dados do dependente.')
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="dependent-name" className="flex items-center gap-2">
                <Baby className="h-4 w-4 text-muted-foreground" />
                {t('dependents.fields.name', 'Nome do Dependente')} *
              </Label>
              <Input
                id="dependent-name"
                type="text"
                placeholder={t('dependents.placeholders.name', 'Nome completo')}
                value={formData.name}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, name: e.target.value }));
                  setValidationErrors((prev) => ({ ...prev, name: false }));
                }}
                className={validationErrors.name ? "border-destructive" : ""}
                disabled={isSubmitting}
                autoFocus
              />
              {validationErrors.name && (
                <p className="text-xs text-destructive">
                  {t('dependents.errors.nameRequired', 'Nome é obrigatório')}
                </p>
              )}
            </div>

            {/* Birth Date */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                {t('dependents.fields.birthDate', 'Data de Nascimento')}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10",
                      !formData.birth_date && "text-muted-foreground"
                    )}
                    disabled={isSubmitting}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
                    {formData.birth_date
                      ? format(parse(formData.birth_date, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM, yyyy", { locale: ptBR })
                      : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.birth_date ? parse(formData.birth_date, 'yyyy-MM-dd', new Date()) : undefined}
                    onSelect={(date) => {
                      if (date) setFormData((prev) => ({ ...prev, birth_date: format(date, 'yyyy-MM-dd') }));
                    }}
                    locale={ptBR}
                    initialFocus
                    className="p-3 pointer-events-auto"
                    captionLayout="dropdown-buttons"
                    fromYear={1950}
                    toYear={new Date().getFullYear()}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                {t('dependents.fields.birthDateHint', 'Opcional, para controle interno')}
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="dependent-notes" className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {t('dependents.fields.notes', 'Observações')}
              </Label>
              <Textarea
                id="dependent-notes"
                placeholder={t('dependents.placeholders.notes', 'Notas sobre o dependente...')}
                value={formData.notes || ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                rows={3}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing
                ? t('common.save', 'Salvar')
                : t('dependents.modal.addButton', 'Adicionar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
