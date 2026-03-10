import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DayInput } from "@/components/ui/day-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, UserCheck, Calendar, AlertTriangle, CreditCard, Building2, ArrowLeft, Users } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useProfile } from "@/contexts/ProfileContext";
import { useTranslation } from "react-i18next";
import { StudentTypeSelector, StudentRegistrationType } from "@/components/StudentTypeSelector";
import { InlineDependentForm, InlineDependent } from "@/components/InlineDependentForm";

interface StudentFormData {
  name: string;
  email: string;
  phone: string;
  billing_day: number;
  business_profile_id: string | null;
  // Fields for family registration
  registrationType?: StudentRegistrationType;
  dependents?: InlineDependent[];
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
    guardian_cpf?: string;
    guardian_address_street?: string;
    guardian_address_city?: string;
    guardian_address_state?: string;
    guardian_address_postal_code?: string;
    billing_day?: number;
    business_profile_id?: string;
  };
  title: string;
  description: string;
}

const getInitialFormData = (student?: StudentFormModalProps['student']): StudentFormData => {
  return {
    name: student?.name || "",
    email: student?.email || "",
    phone: student?.guardian_phone || "",
    billing_day: student?.billing_day || 1,
    business_profile_id: student?.business_profile_id || null
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
  const { currentPlan, getStudentOverageInfo, hasFeature } = useSubscription();
  const { profile } = useProfile();
  const { t } = useTranslation('students');
  const hasFinancialModule = hasFeature('financial_module');
  const [formData, setFormData] = useState<StudentFormData>(() => getInitialFormData(student));
  const [registrationType, setRegistrationType] = useState<StudentRegistrationType>(null);
  const [inlineDependents, setInlineDependents] = useState<InlineDependent[]>([]);
  const isEditing = !!student;

  const [validationErrors, setValidationErrors] = useState({
    name: false,
    email: false,
    phone: false,
    billing_day: false,
    business_profile_id: false
  });

  // Query para buscar perfis de negócio do professor
  const { data: businessProfiles } = useQuery({
    queryKey: ["business-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-business-profiles");
      if (error) throw error;
      return data.business_profiles || [];
    },
    enabled: profile?.role === 'professor',
  });


  // Update form data when student prop or teacher defaults change
  useEffect(() => {
    const newFormData = getInitialFormData(student);
    setFormData(newFormData);
    // Reset registration type for new students, set to individual for editing
    setRegistrationType(student ? 'individual' : null);
    setInlineDependents([]);
    // Reset validation errors when new data arrives
    setValidationErrors({
      name: false,
      email: false,
      phone: false,
      billing_day: false,
      business_profile_id: false
    });
  }, [student]);

  // Reset form when modal opens for new student registration
  useEffect(() => {
    if (isOpen && !student) {
      setFormData(getInitialFormData(undefined));
      setRegistrationType(null);
      setInlineDependents([]);
      setValidationErrors({
        name: false,
        email: false,
        phone: false,
        billing_day: false,
        business_profile_id: false
      });
    }
  }, [isOpen, student]);

  const handleNameChange = (value: string) => {
    setFormData(prev => ({ ...prev, name: value }));
    setValidationErrors(prev => ({ ...prev, name: false }));
  };

  const handleEmailChange = (value: string) => {
    setFormData(prev => ({ ...prev, email: value }));
    setValidationErrors(prev => ({ ...prev, email: false }));
  };

  const handlePhoneChange = (value: string) => {
    setFormData(prev => ({ ...prev, phone: value }));
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

    // For family registration, validate at least one dependent
    if (registrationType === 'family' && inlineDependents.length === 0) {
      return;
    }
    
    // Validate form
    const errors = {
      name: !formData.name.trim(),
      email: !formData.email.trim(),
      phone: false,
      billing_day: hasFinancialModule && (formData.billing_day < 1 || formData.billing_day > 28),
      business_profile_id: hasFinancialModule && businessProfiles && businessProfiles.length > 0 && !formData.business_profile_id
    };
    
    setValidationErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      return;
    }

    // Include registration type and dependents in the submitted data
    const submitData: StudentFormData = {
      ...formData,
      registrationType,
      dependents: registrationType === 'family' ? inlineDependents : undefined,
    };

    onSubmit(submitData);
  };

  const handleTypeSelect = (type: StudentRegistrationType) => {
    setRegistrationType(type);
  };

  const handleBack = () => {
    setRegistrationType(null);
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
                      <div className="space-y-2">
                        <p><strong>{t('form.additionalCostWarning')}</strong></p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>{t('form.immediateCost')}</li>
                          <li>{t('form.recurringCost')}</li>
                        </ul>
                        <p className="text-xs mt-2">{t('form.estimatedTotal', { amount: message })}</p>
                      </div>
                    </AlertDescription>
                  </Alert>
                );
              }
              
              return null;
            })()}

            {/* Registration Type Selection - only for new students */}
            {!isEditing && !registrationType && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">{t('registrationType.title', 'Tipo de Cadastro')}</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('registrationType.description', 'Selecione o tipo de cadastro para este aluno')}
                </p>
                <StudentTypeSelector
                  selectedType={registrationType}
                  onSelect={handleTypeSelect}
                  disabled={isSubmitting}
                />
              </div>
            )}

            {/* Main Form - show when editing OR when type is selected */}
            {(isEditing || registrationType) && (
              <>
                {/* Back button for new students */}
                {!isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    className="mb-2"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    {t('registrationType.back', 'Voltar')}
                  </Button>
                )}

                {/* Family Registration - Dependents Section First */}
                {registrationType === 'family' && (() => {
                  // Calculate remaining slots for dependents
                  // Total after submit = currentStudentCount + 1 (responsible) + dependents in form
                  const isFreePlan = currentPlan?.slug === 'free';
                  const planLimit = currentPlan?.student_limit ?? 3;
                  // Slots remaining for new dependents (excluding the responsible who counts as 1)
                  const usedSlots = currentStudentCount + 1 + inlineDependents.length;
                  const remainingSlots = planLimit - usedSlots;
                  
                  return (
                    <>
                      {/* Show plan limit info for family registration */}
                      {currentPlan && (
                        <div className="flex items-center justify-between p-3 rounded-md bg-muted/50 border">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {t('registrationType.family.planLimit', 'Limite do plano: {{limit}} alunos', { limit: planLimit })}
                            </span>
                          </div>
                          <div className={`text-sm font-medium ${
                            remainingSlots <= 0 ? 'text-destructive' : 'text-muted-foreground'
                          }`}>
                            {remainingSlots > 0 
                              ? t('registrationType.family.availableSlots', '{{count}} vaga(s) disponível(is)', { count: remainingSlots })
                              : t('registrationType.family.noSlotsAvailable', 'Sem vagas disponíveis')
                            }
                          </div>
                        </div>
                      )}
                      
                      <InlineDependentForm
                        dependents={inlineDependents}
                        onDependentsChange={setInlineDependents}
                        disabled={isSubmitting}
                        maxAllowed={isFreePlan ? Math.max(0, remainingSlots) : undefined}
                        currentPlanSlug={currentPlan?.slug}
                      />
                      {inlineDependents.length === 0 && remainingSlots > 0 && (
                        <p className="text-xs text-destructive">
                          {t('registrationType.family.minOneDependentRequired', 'Adicione pelo menos um dependente')}
                        </p>
                      )}
                      {inlineDependents.length === 0 && remainingSlots <= 0 && isFreePlan && (
                        <p className="text-xs text-destructive">
                          {t('registrationType.family.cannotAddFamilyLimitReached', 'Não é possível adicionar família. Limite do plano gratuito atingido.')}
                        </p>
                      )}
                      <Separator />
                      <div className="flex items-center gap-2 mb-3">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">
                          {t('registrationType.family.guardianInfo', 'Dados do Responsável')}
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4">
                        {t('registrationType.family.guardianInfoDescription', 'O responsável receberá acesso ao sistema e poderá acompanhar as aulas de todos os dependentes')}
                      </p>
                    </>
                  );
                })()}

                {/* Student/Guardian Information Section */}
                <div className="space-y-4">
                  {registrationType !== 'family' && (
                    <div className="flex items-center gap-2 mb-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">{t('form.sections.studentData')}</Label>
                    </div>
                  )}
              
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="student-name">{t('fields.fullName')} *</Label>
                      <Input
                        id="student-name"
                        type="text"
                        placeholder={t('placeholders.studentName')}
                        value={formData.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className={validationErrors.name ? "border-destructive" : ""}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="student-phone">{t('fields.phone')}</Label>
                      <PhoneInput
                        id="student-phone"
                        value={formData.phone}
                        onChange={handlePhoneChange}
                        className={validationErrors.phone ? "border-destructive" : ""}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="student-email">{t('fields.email')} *</Label>
                    <Input
                      id="student-email"
                      type="email"
                      placeholder={t('placeholders.emailExample')}
                      value={formData.email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      className={`${validationErrors.email ? "border-destructive" : ""} ${isEditing ? "bg-muted" : ""}`}
                      required
                      disabled={isEditing}
                    />
                    {isEditing && (
                      <p className="text-xs text-muted-foreground">
                        {t('form.emailCannotBeChanged', 'O e-mail não pode ser alterado pois é a credencial de acesso do aluno.')}
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Billing Configuration Section */}
                  {hasFinancialModule && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">{t('billingConfig', 'Configuração de Cobrança')}</Label>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="billing-day">
                          {t('fields.monthlyBillingDay')} *
                        </Label>
                        <DayInput
                          id="billing-day"
                          min={1}
                          max={28}
                          placeholder={t('placeholders.billingDay')}
                          value={formData.billing_day}
                          onChange={(val) => {
                            setFormData(prev => ({ ...prev, billing_day: val }));
                            setValidationErrors(prev => ({ ...prev, billing_day: false }));
                          }}
                          className={validationErrors.billing_day ? "border-destructive" : ""}
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('form.billingDayDescription')}
                        </p>
                      </div>

                      {/* Business Profile Selection */}
                      {businessProfiles && businessProfiles.length > 0 && (
                        <div className="space-y-2">
                          <Label htmlFor="business-profile">
                            <Building2 className="h-4 w-4 inline mr-1" />
                            {t('form.businessProfileLabel')}
                          </Label>
                          <Select
                            value={formData.business_profile_id || ""}
                            onValueChange={(value) => {
                              setFormData(prev => ({ ...prev, business_profile_id: value || null }));
                              setValidationErrors(prev => ({ ...prev, business_profile_id: false }));
                            }}
                          >
                            <SelectTrigger className={validationErrors.business_profile_id ? "border-destructive" : ""}>
                              <SelectValue placeholder={t('form.selectBusiness')} />
                            </SelectTrigger>
                            <SelectContent className="bg-background border z-50">
                              {businessProfiles.map((profile) => (
                                <SelectItem key={profile.id} value={profile.id}>
                                  <div className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4" />
                                    <span>{profile.business_name}</span>
                                    {profile.cnpj && (
                                      <span className="text-xs text-muted-foreground">
                                        ({profile.cnpj})
                                      </span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {t('form.businessProfileDescription')}
                          </p>
                          {validationErrors.business_profile_id && (
                            <p className="text-xs text-destructive">
                              {t('form.selectBusinessError')}
                            </p>
                          )}
                        </div>
                      )}

                      {businessProfiles && businessProfiles.length === 0 && (
                        <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                          <Building2 className="h-4 w-4 text-amber-600" />
                          <AlertDescription className="text-amber-800 dark:text-amber-200">
                            <strong>{t('form.noBusinessWarning')}</strong>
                            <br />
                            {t('form.noBusinessAction')}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            {/* Only show submit button when type is selected or editing */}
            {(isEditing || registrationType) && (
              <Button 
                type="submit" 
                disabled={
                  isSubmitting || 
                  (!student && currentPlan?.slug === 'free' && getStudentOverageInfo(currentStudentCount).isOverLimit) ||
                  (registrationType === 'family' && inlineDependents.length === 0)
                }
              >
                {isSubmitting ? t('formActions.saving') : student ? t('formActions.save') : t('formActions.register')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
