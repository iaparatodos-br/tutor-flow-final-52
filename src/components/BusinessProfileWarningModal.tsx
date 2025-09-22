import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Settings } from "lucide-react";

interface Student {
  id: string;
  name: string;
  email: string;
  business_profile_id?: string;
}

interface BusinessProfileWarningModalProps {
  student: Student;
  isOpen: boolean;
  onClose: () => void;
  onEditStudent: (student: Student) => void;
  action: string; // "criar fatura" ou "agendar aula"
}

export function BusinessProfileWarningModal({ 
  student, 
  isOpen, 
  onClose, 
  onEditStudent, 
  action 
}: BusinessProfileWarningModalProps) {
  const handleConfigureBusinessProfile = () => {
    onClose();
    onEditStudent(student);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Negócio de Recebimento Não Configurado
          </DialogTitle>
          <DialogDescription>
            Para {action} para o aluno <strong>{student.name}</strong>, é necessário 
            configurar um negócio de recebimento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              O negócio de recebimento define para qual conta bancária os pagamentos 
              deste aluno serão direcionados automaticamente.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-2">
            <Button 
              onClick={handleConfigureBusinessProfile}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Configurar Agora
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}