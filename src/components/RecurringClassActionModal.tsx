import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Calendar, CalendarCheck } from "lucide-react";

export type RecurringActionType = 'this_only' | 'this_and_future' | 'all_series';
export type ActionMode = 'edit' | 'cancel';

interface RecurringClassActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionSelected: (action: RecurringActionType) => void;
  mode: ActionMode;
  classDate: Date;
}

export function RecurringClassActionModal({
  open,
  onOpenChange,
  onActionSelected,
  mode,
  classDate
}: RecurringClassActionModalProps) {
  const [selectedAction, setSelectedAction] = useState<RecurringActionType>('this_only');

  const handleContinue = () => {
    onActionSelected(selectedAction);
    onOpenChange(false);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const actionText = mode === 'edit' ? 'modificar' : 'cancelar';
  const actionTextCapitalized = mode === 'edit' ? 'Modificar' : 'Cancelar';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <DialogTitle>Aula Recorrente Detectada</DialogTitle>
          </div>
          <DialogDescription>
            Esta aula faz parte de uma série recorrente. Como você gostaria de {actionText} a aula de{' '}
            <strong>{formatDate(classDate)}</strong>?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={selectedAction} onValueChange={(value) => setSelectedAction(value as RecurringActionType)}>
            <div className="space-y-3">
              <div className="flex items-start space-x-3 p-3 rounded-lg border">
                <RadioGroupItem value="this_only" id="this_only" className="mt-1" />
                <div className="space-y-1">
                  <Label htmlFor="this_only" className="flex items-center gap-2 font-medium">
                    <Calendar className="h-4 w-4" />
                    Apenas esta aula
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {actionTextCapitalized} somente esta ocorrência, mantendo as demais aulas da série inalteradas.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-lg border">
                <RadioGroupItem value="this_and_future" id="this_and_future" className="mt-1" />
                <div className="space-y-1">
                  <Label htmlFor="this_and_future" className="flex items-center gap-2 font-medium">
                    <CalendarCheck className="h-4 w-4" />
                    Esta e futuras aulas
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {actionTextCapitalized} esta aula e todas as ocorrências futuras da série.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-lg border opacity-50">
                <RadioGroupItem value="all_series" id="all_series" disabled className="mt-1" />
                <div className="space-y-1">
                  <Label htmlFor="all_series" className="flex items-center gap-2 font-medium text-muted-foreground">
                    <CalendarCheck className="h-4 w-4" />
                    Toda a série
                    <span className="text-xs bg-muted px-2 py-1 rounded">Em breve</span>
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {actionTextCapitalized} todas as aulas desta série recorrente.
                  </p>
                </div>
              </div>
            </div>
          </RadioGroup>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleContinue}>
            Continuar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}