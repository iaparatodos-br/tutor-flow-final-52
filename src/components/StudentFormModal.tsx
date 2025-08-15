import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { User, UserCheck, Mail, Phone, Calendar } from "lucide-react";

interface StudentFormData {
  name: string;
  email: string;
  isOwnResponsible: boolean;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string;
  billing_day: number;
}

interface StudentFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: StudentFormData) => void;
  isSubmitting: boolean;
  student?: {
    id: string;
    name: string;
    email: string;
    guardian_name?: string;
    guardian_email?: string;
    guardian_phone?: string;
    billing_day?: number;
  };
  title: string;
  description: string;
}

export function StudentFormModal({ 
  isOpen, 
  onOpenChange, 
  onSubmit, 
  isSubmitting, 
  student,
  title,
  description
}: StudentFormModalProps) {
  const [formData, setFormData] = useState<StudentFormData>({
    name: student?.name || "",
    email: student?.email || "",
    isOwnResponsible: student ? !student.guardian_name : true,
    guardian_name: student?.guardian_name || "",
    guardian_email: student?.guardian_email || "",
    guardian_phone: student?.guardian_phone || "",
    billing_day: student?.billing_day || 15
  });

  const [validationErrors, setValidationErrors] = useState({
    name: false,
    email: false,
    guardian_name: false,
    guardian_email: false,
    billing_day: false
  });

  const handleIsOwnResponsibleChange = (checked: boolean) => {
    const newFormData = {
      ...formData,
      isOwnResponsible: checked
    };

    if (checked) {
      // Auto-fill guardian fields with student data
      newFormData.guardian_name = formData.name;
      newFormData.guardian_email = formData.email;
    }

    setFormData(newFormData);
  };

  const handleNameChange = (value: string) => {
    const newFormData = { ...formData, name: value };
    
    // If student is own responsible, update guardian name too
    if (formData.isOwnResponsible) {
      newFormData.guardian_name = value;
    }
    
    setFormData(newFormData);
    setValidationErrors(prev => ({ ...prev, name: false }));
  };

  const handleEmailChange = (value: string) => {
    const newFormData = { ...formData, email: value };
    
    // If student is own responsible, update guardian email too
    if (formData.isOwnResponsible) {
      newFormData.guardian_email = value;
    }
    
    setFormData(newFormData);
    setValidationErrors(prev => ({ ...prev, email: false }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const errors = {
      name: !formData.name.trim(),
      email: !formData.email.trim(),
      guardian_name: !formData.guardian_name.trim(),
      guardian_email: !formData.guardian_email.trim(),
      billing_day: formData.billing_day < 1 || formData.billing_day > 28
    };
    
    setValidationErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      return;
    }

    onSubmit(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Student Information Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Dados do Aluno</Label>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="student-name">Nome completo *</Label>
                  <Input
                    id="student-name"
                    type="text"
                    placeholder="Nome do aluno"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className={validationErrors.name ? "border-destructive" : ""}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student-email">E-mail *</Label>
                  <Input
                    id="student-email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={formData.email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    className={validationErrors.email ? "border-destructive" : ""}
                    required
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Billing Responsible Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Responsável pela Cobrança</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isOwnResponsible"
                  checked={formData.isOwnResponsible}
                  onCheckedChange={handleIsOwnResponsibleChange}
                />
                <Label htmlFor="isOwnResponsible" className="text-sm">
                  O próprio aluno é responsável pela cobrança
                </Label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="guardian-name">Nome do Responsável *</Label>
                  <Input
                    id="guardian-name"
                    type="text"
                    placeholder="Nome completo"
                    value={formData.guardian_name}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, guardian_name: e.target.value }));
                      setValidationErrors(prev => ({ ...prev, guardian_name: false }));
                    }}
                    className={validationErrors.guardian_name ? "border-destructive" : ""}
                    disabled={formData.isOwnResponsible}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardian-phone">Telefone</Label>
                  <Input
                    id="guardian-phone"
                    type="tel"
                    placeholder="(11) 99999-9999"
                    value={formData.guardian_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, guardian_phone: e.target.value }))}
                    disabled={formData.isOwnResponsible}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="guardian-email">Email do Responsável *</Label>
                <Input
                  id="guardian-email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={formData.guardian_email}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, guardian_email: e.target.value }));
                    setValidationErrors(prev => ({ ...prev, guardian_email: false }));
                  }}
                  className={validationErrors.guardian_email ? "border-destructive" : ""}
                  disabled={formData.isOwnResponsible}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  As faturas serão enviadas para este email
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-day">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  Dia da Cobrança Mensal *
                </Label>
                <Input
                  id="billing-day"
                  type="number"
                  min="1"
                  max="28"
                  placeholder="15"
                  value={formData.billing_day}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, billing_day: parseInt(e.target.value) || 15 }));
                    setValidationErrors(prev => ({ ...prev, billing_day: false }));
                  }}
                  className={validationErrors.billing_day ? "border-destructive" : ""}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Dia do mês em que as mensalidades serão geradas automaticamente (1-28)
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : student ? "Salvar Alterações" : "Cadastrar Aluno"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}