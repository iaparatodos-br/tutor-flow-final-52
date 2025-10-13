import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, UserCheck, Mail, Phone, Calendar, AlertTriangle, CreditCard, Building2 } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useProfile } from "@/contexts/ProfileContext";
import { useTranslation } from "react-i18next";

interface StudentFormData {
  name: string;
  email: string;
  phone: string;
  isOwnResponsible: boolean;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string;
  guardian_cpf: string;
  guardian_address_street: string;
  guardian_address_city: string;
  guardian_address_state: string;
  guardian_address_postal_code: string;
  billing_day: number;
  business_profile_id: string | null;
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
    guardian_cpf: student?.guardian_cpf || "",
    guardian_address_street: student?.guardian_address_street || "",
    guardian_address_city: student?.guardian_address_city || "",
    guardian_address_state: student?.guardian_address_state || "",
    guardian_address_postal_code: student?.guardian_address_postal_code || "",
    billing_day: student?.billing_day || teacherDefaultBillingDay || 15,
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
  const [teacherDefaultBillingDay, setTeacherDefaultBillingDay] = useState<number | undefined>();
  const [formData, setFormData] = useState<StudentFormData>(() => getInitialFormData(student, teacherDefaultBillingDay));

  const [validationErrors, setValidationErrors] = useState({
    name: false,
    email: false,
    phone: false,
    guardian_name: false,
    guardian_email: false,
    guardian_cpf: false,
    guardian_address_street: false,
    guardian_address_city: false,
    guardian_address_state: false,
    guardian_address_postal_code: false,
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

          if (!error && data && (data as any)?.default_billing_day) {
            setTeacherDefaultBillingDay((data as any).default_billing_day);
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
      guardian_cpf: false,
      guardian_address_street: false,
      guardian_address_city: false,
      guardian_address_state: false,
      guardian_address_postal_code: false,
      billing_day: false,
      business_profile_id: false
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
      newFormData.guardian_cpf = "";
      newFormData.guardian_address_street = "";
      newFormData.guardian_address_city = "";
      newFormData.guardian_address_state = "";
      newFormData.guardian_address_postal_code = "";
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
      guardian_cpf: false,
      guardian_address_street: false,
      guardian_address_city: false,
      guardian_address_state: false,
      guardian_address_postal_code: false,
      billing_day: hasFinancialModule && (formData.billing_day < 1 || formData.billing_day > 28),
      business_profile_id: hasFinancialModule && businessProfiles && businessProfiles.length > 0 && !formData.business_profile_id
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
            {/* Student Information Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">{t('form.sections.studentData')}</Label>
              </div>
              
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
                <Label className="text-sm font-medium">{t('form.sections.billingResponsible')}</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isOwnResponsible"
                  checked={formData.isOwnResponsible}
                  onCheckedChange={handleIsOwnResponsibleChange}
                />
                <Label htmlFor="isOwnResponsible" className="text-sm">
                  {t('form.ownResponsible')}
                </Label>
              </div>

              {!formData.isOwnResponsible && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="guardian-name">{t('fields.guardianName')} *</Label>
                      <Input
                        id="guardian-name"
                        type="text"
                        placeholder={t('placeholders.fullName')}
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
                      <Label htmlFor="guardian-phone">{t('fields.guardianPhone')}</Label>
                      <PhoneInput
                        id="guardian-phone"
                        value={formData.guardian_phone}
                        onChange={(value) => setFormData(prev => ({ ...prev, guardian_phone: value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="guardian-email">{t('fields.guardianEmail')} *</Label>
                    <Input
                      id="guardian-email"
                      type="email"
                      placeholder={t('placeholders.emailExample')}
                      value={formData.guardian_email}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, guardian_email: e.target.value }));
                        setValidationErrors(prev => ({ ...prev, guardian_email: false }));
                      }}
                      className={validationErrors.guardian_email ? "border-destructive" : ""}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {hasFinancialModule ? t('form.invoiceEmail') : t('form.contactEmail')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="guardian-cpf">{t('fields.guardianCpf')}</Label>
                    <Input
                      id="guardian-cpf"
                      type="text"
                      placeholder={t('placeholders.cpf')}
                      value={formData.guardian_cpf}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, guardian_cpf: e.target.value }));
                        setValidationErrors(prev => ({ ...prev, guardian_cpf: false }));
                      }}
                      className={validationErrors.guardian_cpf ? "border-destructive" : ""}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('form.cpfForBoleto')}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-sm font-medium">{t('form.sections.guardianAddress')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('form.addressRequired')}
                    </p>
                    
                    <div className="space-y-2">
                      <Label htmlFor="guardian-address-street">{t('fields.fullAddress')}</Label>
                      <Input
                        id="guardian-address-street"
                        type="text"
                        placeholder={t('placeholders.streetAddress')}
                        value={formData.guardian_address_street}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, guardian_address_street: e.target.value }));
                          setValidationErrors(prev => ({ ...prev, guardian_address_street: false }));
                        }}
                        className={validationErrors.guardian_address_street ? "border-destructive" : ""}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="guardian-address-city">{t('fields.city')}</Label>
                        <Input
                          id="guardian-address-city"
                          type="text"
                          placeholder={t('placeholders.city')}
                          value={formData.guardian_address_city}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, guardian_address_city: e.target.value }));
                            setValidationErrors(prev => ({ ...prev, guardian_address_city: false }));
                          }}
                          className={validationErrors.guardian_address_city ? "border-destructive" : ""}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="guardian-address-state">{t('fields.state')}</Label>
                        <Input
                          id="guardian-address-state"
                          type="text"
                          placeholder={t('placeholders.state')}
                          maxLength={2}
                          value={formData.guardian_address_state}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, guardian_address_state: e.target.value.toUpperCase() }));
                            setValidationErrors(prev => ({ ...prev, guardian_address_state: false }));
                          }}
                          className={validationErrors.guardian_address_state ? "border-destructive" : ""}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="guardian-address-postal-code">{t('fields.postalCode')}</Label>
                        <Input
                          id="guardian-address-postal-code"
                          type="text"
                          placeholder={t('placeholders.postalCode')}
                          value={formData.guardian_address_postal_code}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, guardian_address_postal_code: e.target.value }));
                            setValidationErrors(prev => ({ ...prev, guardian_address_postal_code: false }));
                          }}
                          className={validationErrors.guardian_address_postal_code ? "border-destructive" : ""}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {formData.isOwnResponsible && (
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-sm text-muted-foreground mb-2">
                    <UserCheck className="h-4 w-4 inline mr-1" />
                    {hasFinancialModule ? 
                      t('form.invoicesSentTo', { email: formData.email }) :
                      t('form.mainContact', { email: formData.email })
                    }
                  </p>
                </div>
              )}

              {hasFinancialModule && (
                <div className="space-y-2">
                  <Label htmlFor="billing-day">
                    <Calendar className="h-4 w-4 inline mr-1" />
                    {t('fields.monthlyBillingDay')} *
                  </Label>
                  <Input
                    id="billing-day"
                    type="number"
                    min="1"
                    max="28"
                    placeholder={t('placeholders.billingDay')}
                    value={formData.billing_day}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, billing_day: parseInt(e.target.value) || 15 }));
                      setValidationErrors(prev => ({ ...prev, billing_day: false }));
                    }}
                    className={validationErrors.billing_day ? "border-destructive" : ""}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('form.billingDayDescription')}
                  </p>
                </div>
              )}

               {/* Business Profile Selection */}
               {hasFinancialModule && businessProfiles && businessProfiles.length > 0 && (
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

               {hasFinancialModule && businessProfiles && businessProfiles.length === 0 && (
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
           </div>

          <DialogFooter>
            <Button 
              type="submit" 
              disabled={
                isSubmitting || 
                (!student && currentPlan?.slug === 'free' && getStudentOverageInfo(currentStudentCount).isOverLimit)
              }
            >
              {isSubmitting ? t('actions.saving') : student ? t('actions.save') : t('actions.register')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
