import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, UserCheck, Mail, Phone, Calendar, AlertTriangle, CreditCard } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useProfile } from "@/contexts/ProfileContext";

interface StudentFormData {
  name: string;
  email: string;
  phone: string;
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
  currentStudentCount: number;
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

const getInitialFormData = (student?: StudentFormModalProps['student'], teacherDefaultBillingDay?: number): StudentFormData => {
  console.log('getInitialFormData - student data:', student);
  console.log('getInitialFormData - teacher default billing day:', teacherDefaultBillingDay);
  
  return {
    name: student?.name || "",
    email: student?.email || "",
    phone: student?.guardian_phone || "",
    // Se não há dados de responsável OU se os dados do responsável são iguais aos do aluno
    isOwnResponsible: student ? 
      (!student.guardian_name || student.guardian_name === student.name) : 
      true,
    guardian_name: student?.guardian_name || "",
    guardian_email: student?.guardian_email || "",
    guardian_phone: student?.guardian_phone || "",
    billing_day: student?.billing_day || teacherDefaultBillingDay || 15
  };
};

export function StudentFormModal({ 
  isOpen, 
  onOpenChange, 
  onSubmit, 
  isSubmitting,
  currentStudentCount,
  student,
  title,
  description
}: StudentFormModalProps) {
  const { currentPlan, getStudentOverageInfo } = useSubscription();
  const { profile } = useProfile();
  const hasFinancialModule = profile?.role === 'professor' && profile.id;
  const [teacherDefaultBillingDay, setTeacherDefaultBillingDay] = useState<number | undefined>();
  const [formData, setFormData] = useState<StudentFormData>(() => getInitialFormData(student, teacherDefaultBillingDay));

  const [validationErrors, setValidationErrors] = useState({
    name: false,
    email: false,
    phone: false,
    guardian_name: false,
    guardian_email: false,
    billing_day: false
  });

  // Load teacher's default billing day
  useEffect(() => {
    const loadTeacherDefaults = async () => {
      if (profile?.id && profile.role === 'professor') {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('default_billing_day')
            .eq('id', profile.id)
            .single();

          if (!error && data?.default_billing_day) {
            setTeacherDefaultBillingDay(data.default_billing_day);
          }
        } catch (error) {
          console.error('Error loading teacher defaults:', error);
        }
      }
    };

    loadTeacherDefaults();
  }, [profile]);

  // Update form data when student prop or teacher defaults change
  useEffect(() => {
    console.log('StudentFormModal useEffect - student changed:', student);
    console.log('StudentFormModal useEffect - teacher default billing day:', teacherDefaultBillingDay);
    const newFormData = getInitialFormData(student, teacherDefaultBillingDay);
    console.log('StudentFormModal useEffect - new form data:', newFormData);
    setFormData(newFormData);
    // Reset validation errors when new data arrives
    setValidationErrors({
      name: false,
      email: false,
      phone: false,
      guardian_name: false,
      guardian_email: false,
      billing_day: false
    });
  }, [student, teacherDefaultBillingDay]);

  const handleIsOwnResponsibleChange = (checked: boolean) => {
    const newFormData = {
      ...formData,
      isOwnResponsible: checked
    };

    if (checked) {
      // Auto-fill guardian fields with student data
      newFormData.guardian_name = formData.name;
      newFormData.guardian_email = formData.email;
      newFormData.guardian_phone = formData.phone;
    } else {
      // Clear guardian fields when unchecking
      newFormData.guardian_name = "";
      newFormData.guardian_email = "";
      newFormData.guardian_phone = "";
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

  const handlePhoneChange = (value: string) => {
    const newFormData = { ...formData, phone: value };
    
    // If student is own responsible, update guardian phone too
    if (formData.isOwnResponsible) {
      newFormData.guardian_phone = value;
    }
    
    setFormData(newFormData);
    setValidationErrors(prev => ({ ...prev, phone: false }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check subscription limits for new students (not editing)
    if (!student && currentPlan) {
      const { isOverLimit, message } = getStudentOverageInfo(currentStudentCount);
      
      if (isOverLimit && currentPlan.slug === 'free') {
        // Block creation for free plan
        return;
      }
    }
    
    // Validate form
    const errors = {
      name: !formData.name.trim(),
      email: !formData.email.trim(),
      phone: false,
      guardian_name: !formData.isOwnResponsible && !formData.guardian_name.trim(),
      guardian_email: !formData.isOwnResponsible && !formData.guardian_email.trim(),
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
            {/* Subscription Warning for New Students */}
            {!student && currentPlan && (() => {
              const { isOverLimit, additionalCost, message } = getStudentOverageInfo(currentStudentCount);
              
              if (isOverLimit && currentPlan.slug === 'free') {
                return (
                  <Alert className="border-destructive bg-destructive/10">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-destructive">
                      {message}
                    </AlertDescription>
                  </Alert>
                );
              }
              
              if (isOverLimit && currentPlan.slug !== 'free') {
                return (
                  <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                    <CreditCard className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800 dark:text-amber-200">
                      <strong>Custo Adicional:</strong> {message}
                    </AlertDescription>
                  </Alert>
                );
              }
              
              return null;
            })()}
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
                  <Label htmlFor="student-phone">Telefone</Label>
                  <PhoneInput
                    id="student-phone"
                    value={formData.phone}
                    onChange={handlePhoneChange}
                    className={validationErrors.phone ? "border-destructive" : ""}
                  />
                </div>
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

              {!formData.isOwnResponsible && (
                <>
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
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guardian-phone">Telefone</Label>
                      <PhoneInput
                        id="guardian-phone"
                        value={formData.guardian_phone}
                        onChange={(value) => setFormData(prev => ({ ...prev, guardian_phone: value }))}
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
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {hasFinancialModule ? "As faturas serão enviadas para este email" : "Email para contato"}
                    </p>
                  </div>
                </>
              )}

              {formData.isOwnResponsible && (
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-sm text-muted-foreground mb-2">
                    <UserCheck className="h-4 w-4 inline mr-1" />
                    {hasFinancialModule ? 
                      `As faturas serão enviadas para: ${formData.email}` :
                      `Contato principal: ${formData.email}`
                    }
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="billing-day">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  {hasFinancialModule ? "Dia da Cobrança Mensal *" : "Dia Preferencial de Contato *"}
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
                  {hasFinancialModule ? 
                    "Dia do mês em que as mensalidades serão geradas automaticamente (1-28)" :
                    "Dia do mês preferencial para contato e comunicação (1-28)"
                  }
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="submit" 
              disabled={
                isSubmitting || 
                (!student && currentPlan?.slug === 'free' && getStudentOverageInfo(currentStudentCount).isOverLimit)
              }
            >
              {isSubmitting ? "Salvando..." : student ? "Salvar Alterações" : "Cadastrar Aluno"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
