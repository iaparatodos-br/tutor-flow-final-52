import React, { useState, useEffect, useMemo } from 'react';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TimePicker } from '@/components/ui/time-picker';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, X, Users, Star, Repeat, DollarSign, Baby, User, Info, CalendarIcon, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FeatureGate } from '@/components/FeatureGate';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useProfile } from '@/contexts/ProfileContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { RRule, Frequency } from 'rrule';

interface Student {
  id: string;
  name: string;
}

interface Dependent {
  id: string;
  name: string;
  responsible_id: string;
  responsible_name: string;
}

interface ClassService {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

// Participant selection: can be student or dependent
interface ParticipantSelection {
  student_id: string;
  dependent_id?: string;
  name: string;
  type: 'student' | 'dependent';
}

interface ClassFormData {
  selectedStudents: string[];
  selectedParticipants: ParticipantSelection[];
  service_id: string;
  class_date: string;
  time: string;
  duration_minutes: number;
  notes: string;
  is_experimental: boolean;
  is_group_class: boolean;
  is_paid_class: boolean;
  recurrence?: {
    frequency: 'weekly' | 'biweekly' | 'monthly';
    end_date?: string;
    occurrences?: number;
    is_infinite?: boolean;
  };
}

interface ClassFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  dependents?: Dependent[];
  services: ClassService[];
  existingClasses: Array<{
    id: string;
    class_date: string;
    duration_minutes: number;
    status: 'pendente' | 'confirmada' | 'cancelada' | 'concluida' | 'removida' | 'aguardando_pagamento';
    is_template?: boolean;
    recurrence_pattern?: any;
    recurrence_end_date?: string;
  }>;
  onSubmit: (data: ClassFormData) => Promise<void>;
  loading?: boolean;
}

export function ClassForm({ open, onOpenChange, students, dependents = [], services, existingClasses, onSubmit, loading }: ClassFormProps) {
  const { hasFeature, currentPlan } = useSubscription();
  const { profile } = useProfile();
  const { t } = useTranslation('classes');
  const [chargeTiming, setChargeTiming] = useState<'prepaid' | 'postpaid' | null>(null);
  const [formData, setFormData] = useState<ClassFormData>({
    selectedStudents: [],
    selectedParticipants: [],
    service_id: '',
    class_date: '',
    time: '',
    duration_minutes: 60,
    notes: '',
    is_experimental: false,
    is_group_class: false,
    is_paid_class: true,
    recurrence: {
      frequency: 'weekly',
      is_infinite: false
    }
  });

  const [showRecurrence, setShowRecurrence] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'date' | 'count' | 'infinite'>('date');
  const [timeConflictWarning, setTimeConflictWarning] = useState(false);
  const [validationErrors, setValidationErrors] = useState({
    students: false,
    service: false,
    date: false,
    time: false,
  });

  // Load charge_timing from business_profiles
  useEffect(() => {
    if (profile?.id && open) {
      supabase
        .from('business_profiles')
        .select('charge_timing')
        .eq('user_id', profile.id)
        .maybeSingle()
        .then(({ data }) => {
          setChargeTiming((data?.charge_timing as 'prepaid' | 'postpaid') || null);
        });
    }
  }, [profile?.id, open]);

  // Real-time conflict detection via useEffect
  useEffect(() => {
    if (!formData.class_date || !formData.time) {
      setTimeConflictWarning(false);
      return;
    }

    const classDateTime = new Date(`${formData.class_date}T${formData.time}`);

    // Get duration from selected service or use form value for unpaid classes
    let duration = !formData.is_paid_class && !formData.service_id
      ? formData.duration_minutes 
      : 60;
    
    if (formData.service_id) {
      const selectedService = services.find(s => s.id === formData.service_id);
      if (selectedService) {
        duration = selectedService.duration_minutes;
      }
    }

    // Build expanded list including virtual instances from recurrence templates
    const expandedClasses = [...existingClasses];
    
    existingClasses.forEach(ec => {
      if (ec.is_template && ec.recurrence_pattern && ec.status !== 'cancelada') {
        const pattern = ec.recurrence_pattern;
        const templateDate = new Date(ec.class_date);
        const twoMonthsLater = new Date(templateDate);
        twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);
        
        const endLimit = ec.recurrence_end_date 
          ? new Date(Math.min(new Date(ec.recurrence_end_date).getTime(), twoMonthsLater.getTime()))
          : twoMonthsLater;

        const freq = pattern.frequency === 'weekly' ? Frequency.WEEKLY 
          : pattern.frequency === 'biweekly' ? Frequency.WEEKLY 
          : pattern.frequency === 'monthly' ? Frequency.MONTHLY 
          : Frequency.WEEKLY;
        const interval = pattern.frequency === 'biweekly' ? 2 : 1;

        try {
          const rule = new RRule({ freq, interval, dtstart: templateDate, until: endLimit });
          const occurrences = rule.all();
          occurrences.forEach(date => {
            if (date.getTime() === templateDate.getTime()) return;
            expandedClasses.push({
              id: `${ec.id}_virtual_${date.getTime()}`,
              class_date: date.toISOString(),
              duration_minutes: ec.duration_minutes,
              status: 'confirmada',
            });
          });
        } catch (e) {
          console.warn('Error generating virtual instances for conflict check:', e);
        }
      }
    });

    // Generate dates for the new class if it's recurrent
    const newClassDates: Date[] = [classDateTime];
    if (showRecurrence && formData.recurrence?.frequency) {
      const freq = formData.recurrence.frequency === 'weekly' ? Frequency.WEEKLY
        : formData.recurrence.frequency === 'biweekly' ? Frequency.WEEKLY
        : Frequency.MONTHLY;
      const interval = formData.recurrence.frequency === 'biweekly' ? 2 : 1;
      const twoMonthsFromNow = new Date(classDateTime);
      twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

      let untilDate = twoMonthsFromNow;
      if (formData.recurrence.end_date) {
        untilDate = new Date(Math.min(new Date(formData.recurrence.end_date).getTime(), twoMonthsFromNow.getTime()));
      }

      try {
        const rule = new RRule({ freq, interval, dtstart: classDateTime, until: untilDate, count: formData.recurrence.occurrences });
        const futureOccurrences = rule.all().filter(d => d.getTime() !== classDateTime.getTime());
        newClassDates.push(...futureOccurrences);
      } catch (e) {
        console.warn('Error generating new recurrence dates for conflict check:', e);
      }
    }

    // Check each new class date against expanded existing classes
    let hasConflict = false;
    for (const newDate of newClassDates) {
      const newEnd = new Date(newDate.getTime() + (duration * 60 * 1000));
      
      const conflict = expandedClasses.some(existingClass => {
        if (existingClass.status === 'cancelada' || existingClass.status === 'concluida') return false;
        if ((existingClass as any).is_group_class && (existingClass as any).participants) {
          const activeParticipants = (existingClass as any).participants.filter(
            (p: any) => p.status === 'pendente' || p.status === 'confirmada'
          );
          if (activeParticipants.length === 0) return false;
        }
        if (existingClass.is_template) return false;
        
        const existingStart = new Date(existingClass.class_date);
        const existingEnd = new Date(existingStart.getTime() + (existingClass.duration_minutes * 60 * 1000));
        
        return (newDate < existingEnd && newEnd > existingStart);
      });
      
      if (conflict) {
        hasConflict = true;
        break;
      }
    }

    setTimeConflictWarning(hasConflict);
  }, [
    formData.class_date, formData.time, formData.service_id, formData.is_paid_class,
    formData.duration_minutes, showRecurrence, formData.recurrence, existingClasses, services
  ]);

  // Recurrence blocking: prepaid + paid class = no recurrence
  const isRecurrenceBlocked = chargeTiming === 'prepaid' && formData.is_paid_class;

  const resetForm = () => {
    setFormData({
      selectedStudents: [],
      selectedParticipants: [],
      service_id: '',
      class_date: '',
      time: '',
      duration_minutes: 60,
      notes: '',
      is_experimental: false,
      is_group_class: false,
      is_paid_class: true,
      recurrence: {
        frequency: 'weekly',
        is_infinite: false
      }
    });
    setShowRecurrence(false);
    setRecurrenceType('date');
    setValidationErrors({ students: false, service: false, date: false, time: false });
    setTimeConflictWarning(false);
  };

  // Handle student selection
  const handleStudentSelection = (studentId: string, checked: boolean) => {
    setFormData(prev => {
      const student = students.find(s => s.id === studentId);
      if (!student) return prev;

      let newParticipants: ParticipantSelection[];
      let newSelectedStudents: string[];

      if (checked) {
        newParticipants = [...prev.selectedParticipants, {
          student_id: studentId,
          name: student.name,
          type: 'student' as const
        }];
        newSelectedStudents = [...prev.selectedStudents, studentId];
      } else {
        newParticipants = prev.selectedParticipants.filter(
          p => !(p.student_id === studentId && p.type === 'student')
        );
        newSelectedStudents = prev.selectedStudents.filter(id => id !== studentId);
      }

      return {
        ...prev,
        selectedStudents: newSelectedStudents,
        selectedParticipants: newParticipants,
        is_group_class: newParticipants.length > 1
      };
    });
    setValidationErrors(prev => ({ ...prev, students: false }));
  };

  // Handle dependent selection
  const handleDependentSelection = (dependent: Dependent, checked: boolean) => {
    setFormData(prev => {
      let newParticipants: ParticipantSelection[];

      if (checked) {
        newParticipants = [...prev.selectedParticipants, {
          student_id: dependent.responsible_id,
          dependent_id: dependent.id,
          name: dependent.name,
          type: 'dependent' as const
        }];
      } else {
        newParticipants = prev.selectedParticipants.filter(
          p => !(p.dependent_id === dependent.id)
        );
      }

      return {
        ...prev,
        selectedParticipants: newParticipants,
        is_group_class: newParticipants.length > 1
      };
    });
    setValidationErrors(prev => ({ ...prev, students: false }));
  };

  // Check if a student is selected
  const isStudentSelected = (studentId: string) => {
    return formData.selectedParticipants.some(
      p => p.student_id === studentId && p.type === 'student'
    );
  };

  // Check if a dependent is selected
  const isDependentSelected = (dependentId: string) => {
    return formData.selectedParticipants.some(p => p.dependent_id === dependentId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if it's a group class (more than 1 participant) and user is on free plan
    if (formData.selectedParticipants.length > 1 && currentPlan?.slug === 'free') {
      toast.error(t('groupClassNote'));
      return;
    }

    const errors = {
      students: formData.selectedParticipants.length === 0,
      service: formData.is_paid_class && !formData.service_id,
      date: !formData.class_date,
      time: !formData.time,
      duration: !formData.is_paid_class && !formData.service_id && (formData.duration_minutes < 15 || formData.duration_minutes > 480),
    };

    setValidationErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      return;
    }

    // Get duration from selected service or use form value for unpaid classes
    let finalDuration = !formData.is_paid_class && !formData.service_id
      ? formData.duration_minutes 
      : 60; // Default fallback
    
    if (formData.service_id) {
      const selectedService = services.find(s => s.id === formData.service_id);
      if (selectedService) {
        finalDuration = selectedService.duration_minutes;
      }
    }

    const submitData: ClassFormData = {
      ...formData,
      duration_minutes: finalDuration,
      recurrence: showRecurrence ? {
        frequency: formData.recurrence?.frequency || 'weekly', // Ensure frequency is always set
        end_date: formData.recurrence?.end_date,
        occurrences: formData.recurrence?.occurrences,
        is_infinite: recurrenceType === 'infinite'
      } : undefined,
    };

    try {
      await onSubmit(submitData);
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  // Get selected participant names for display
  const selectedParticipantNames = formData.selectedParticipants.map(p => ({
    name: p.name,
    type: p.type
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {t('scheduleNew')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Student Selection */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t('selectStudents')}
              </CardTitle>
              <CardDescription>
                {t('selectStudentsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {students.length === 0 && dependents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('noStudentsRegistered')}
                </p>
              ) : (
                <div className="space-y-4 max-h-60 overflow-y-auto">
                  {/* Regular Students Section */}
                  {students.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t('participantGroups.students')}
                      </Label>
                      {students.map((student) => (
                        <div key={student.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`student-${student.id}`}
                            checked={isStudentSelected(student.id)}
                            onCheckedChange={(checked) =>
                              handleStudentSelection(student.id, checked as boolean)
                            }
                          />
                          <Label
                            htmlFor={`student-${student.id}`}
                            className="text-sm font-normal cursor-pointer flex-1"
                          >
                            {student.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dependents Section */}
                  {dependents.length > 0 && (
                    <div className="space-y-2">
                      {students.length > 0 && <Separator className="my-3" />}
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t('participantGroups.dependents')}
                      </Label>
                      {dependents.map((dependent) => (
                        <div key={dependent.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`dependent-${dependent.id}`}
                            checked={isDependentSelected(dependent.id)}
                            onCheckedChange={(checked) =>
                              handleDependentSelection(dependent, checked as boolean)
                            }
                          />
                          <Label
                            htmlFor={`dependent-${dependent.id}`}
                            className="text-sm font-normal cursor-pointer flex-1 flex items-center gap-1.5"
                          >
                            <Baby className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
                            <span>{dependent.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({t('participantGroups.childOf')} {dependent.responsible_name})
                            </span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {formData.selectedParticipants.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="flex flex-wrap gap-1">
                      {selectedParticipantNames.map((participant, index) => (
                        <Badge 
                          key={index} 
                          variant={participant.type === 'dependent' ? 'dependent' : 'secondary'} 
                          className="text-xs"
                        >
                          {participant.type === 'dependent' && <Baby className="h-3 w-3 mr-1" />}
                          {participant.name}
                        </Badge>
                      ))}
                  </div>
                   {formData.selectedParticipants.length > 1 && currentPlan?.slug === 'free' && (
                     <Badge variant="destructive" className="mt-2">
                       <Users className="h-3 w-3 mr-1" />
                       {t('groupClassPremium')}
                     </Badge>
                   )}
                   {formData.is_group_class && currentPlan?.slug !== 'free' && (
                     <Badge variant="outline" className="mt-2">
                       <Users className="h-3 w-3 mr-1" />
                       {t('groupClass')}
                     </Badge>
                   )}
                </div>
              )}

              {validationErrors.students && (
                <p className="text-sm text-destructive">
                  {t('selectStudentError')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Paid Class Toggle */}
          <div className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div className="space-y-0.5">
              <Label htmlFor="is-paid-class" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                {t('isPaidClass')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('isPaidClassDescription')}
              </p>
            </div>
            <Switch
              id="is-paid-class"
              checked={formData.is_paid_class}
              onCheckedChange={(checked) => {
                setFormData(prev => ({ 
                  ...prev, 
                  is_paid_class: checked,
                  service_id: checked ? prev.service_id : '',
                  is_experimental: false,
                }));
                if (checked && chargeTiming === 'prepaid' && showRecurrence) {
                  setShowRecurrence(false);
                }
              }}
            />
          </div>

          {/* Duration selector for unpaid classes without service */}
          {!formData.is_paid_class && !formData.service_id && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <Label htmlFor="unpaid-duration">
                    {t('fields.duration')} *
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="unpaid-duration"
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={formData.duration_minutes}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        if (raw === "") {
                          setFormData(prev => ({ ...prev, duration_minutes: 0 }));
                          return;
                        }
                        setFormData(prev => ({ ...prev, duration_minutes: parseInt(raw) }));
                      }}
                      className={`w-32 ${formData.duration_minutes < 15 || formData.duration_minutes > 480 ? 'border-destructive' : ''}`}
                    />
                    <span className="text-sm text-muted-foreground">minutos</span>
                  </div>
                  {formData.duration_minutes < 15 || formData.duration_minutes > 480 ? (
                    <p className="text-xs text-destructive">
                      Duração deve ser entre 15 e 480 minutos
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Duração entre 15 e 480 minutos
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Service Selection - only for paid classes */}
          {formData.is_paid_class && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {t('selectService')}
                </CardTitle>
                <CardDescription>
                  {t('selectServiceDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {services.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('noServicesRegistered')} <a href="/servicos" className="text-primary underline">{t('registerServicesLink')}</a> {t('registerServicesPrompt')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    <Select
                      value={formData.service_id}
                      onValueChange={(value) => {
                        const selectedService = services.find(s => s.id === value);
                        if (selectedService) {
                          setFormData(prev => ({
                            ...prev,
                            service_id: value,
                            duration_minutes: selectedService.duration_minutes
                          }));
                        }
                        setValidationErrors(prev => ({ ...prev, service: false }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('selectServicePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{service.name}</span>
                              <div className="flex items-center gap-2 ml-4">
                                <span className="text-sm text-muted-foreground">
                                  {service.duration_minutes}min
                                </span>
                                <span className="font-medium">
                                  {new Intl.NumberFormat('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL'
                                  }).format(service.price)}
                                </span>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {formData.service_id && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        {(() => {
                          const selectedService = services.find(s => s.id === formData.service_id);
                          return selectedService ? (
                            <div className="flex items-center justify-between text-sm">
                              <span>{t('serviceSelected')}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{selectedService.name}</span>
                                <span className="text-muted-foreground">•</span>
                                <span>{selectedService.duration_minutes} min</span>
                                <span className="text-muted-foreground">•</span>
                                <span className="font-medium text-success">
                                  {new Intl.NumberFormat('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL'
                                  }).format(selectedService.price)}
                                </span>
                              </div>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                )}
                
                {validationErrors.service && (
                  <p className="text-sm text-destructive">
                    {t('selectServiceError')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">{t('fields.date')} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10",
                      !formData.class_date && "text-muted-foreground",
                      validationErrors.date && "border-destructive",
                      timeConflictWarning && !validationErrors.date && "border-amber-500"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
                    {formData.class_date
                      ? format(parse(formData.class_date, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM, yyyy", { locale: ptBR })
                      : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.class_date ? parse(formData.class_date, 'yyyy-MM-dd', new Date()) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setFormData(prev => ({ ...prev, class_date: format(date, 'yyyy-MM-dd') }));
                        setValidationErrors(prev => ({ ...prev, date: false }));
                      }
                    }}
                    locale={ptBR}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label htmlFor="time">{t('fields.time')} * <span className="text-xs text-muted-foreground">{t('brasilia_timezone')}</span></Label>
              <TimePicker
                id="time"
                value={formData.time}
                onChange={(val) => {
                  setFormData(prev => ({ ...prev, time: val }));
                  setValidationErrors(prev => ({ ...prev, time: false }));
                }}
                className={validationErrors.time ? "border-destructive" : timeConflictWarning ? "border-amber-500" : ""}
                required
              />
            </div>
          </div>

          {/* Past date warning (informative, not blocking) */}
          {formData.class_date && formData.time && new Date(`${formData.class_date}T${formData.time}`) < new Date() && (
            <Alert variant="default" className="border-warning bg-warning/10">
              <Info className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning-foreground">
                {t('pastDateTimeWarning')}
              </AlertDescription>
            </Alert>
          )}
          
          {timeConflictWarning && (
            <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                {t('timeConflictWarning')}
              </AlertDescription>
            </Alert>
          )}


          {/* Recurrence */}
          {!formData.is_experimental && (
            <Card className={isRecurrenceBlocked ? "opacity-60" : ""}>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Repeat className="h-4 w-4" />
                      {t('recurrence')}
                    </CardTitle>
                    <CardDescription>
                      {isRecurrenceBlocked
                        ? t('recurrenceBlockedPrepaid')
                        : t('recurrenceDescription')}
                    </CardDescription>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Checkbox
                            checked={showRecurrence && !isRecurrenceBlocked}
                            disabled={isRecurrenceBlocked}
                            onCheckedChange={(checked) => {
                              if (isRecurrenceBlocked) return;
                              setShowRecurrence(checked as boolean);
                              if (checked && !formData.recurrence?.frequency) {
                                setFormData(prev => ({
                                  ...prev,
                                  recurrence: {
                                    frequency: 'weekly',
                                    is_infinite: false
                                  }
                                }));
                              }
                            }}
                          />
                        </div>
                      </TooltipTrigger>
                      {isRecurrenceBlocked && (
                        <TooltipContent>
                          <p>{t('recurrenceBlockedPrepaid')}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              {showRecurrence && (
                <CardContent className="space-y-4">
                  <div>
                    <Label>{t('frequency')}</Label>
                    <Select
                      value={formData.recurrence?.frequency || 'weekly'}
                      onValueChange={(value: 'weekly' | 'biweekly' | 'monthly') =>
                        setFormData(prev => ({
                          ...prev,
                          recurrence: { ...prev.recurrence, frequency: value }
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">{t('weekly')}</SelectItem>
                        <SelectItem value="biweekly">{t('biweekly')}</SelectItem>
                        <SelectItem value="monthly">{t('monthly')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="infinite-recurrence">{t('infiniteRecurrence')}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t('infiniteRecurrenceDescription')}
                      </p>
                    </div>
                    <Switch
                      id="infinite-recurrence"
                      checked={recurrenceType === 'infinite'}
                      onCheckedChange={(checked) => {
                        setRecurrenceType(checked ? 'infinite' : 'date');
                        setFormData(prev => ({
                          ...prev,
                          recurrence: { 
                            ...prev.recurrence, 
                            is_infinite: checked,
                            end_date: checked ? undefined : prev.recurrence?.end_date,
                            occurrences: checked ? undefined : prev.recurrence?.occurrences
                          }
                        }));
                      }}
                    />
                  </div>

                  {recurrenceType !== 'infinite' && (
                    <div>
                      <Label>{t('endRecurrence')}</Label>
                      <Select value={recurrenceType} onValueChange={(value: "date" | "count") => setRecurrenceType(value as "date" | "count")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="date">{t('endDateOption')}</SelectItem>
                          <SelectItem value="count">{t('countOption')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {recurrenceType === 'date' && (
                    <div>
                      <Label>{t('fields.endDate')}</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal h-10",
                              !formData.recurrence?.end_date && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
                            {formData.recurrence?.end_date
                              ? format(parse(formData.recurrence.end_date, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM, yyyy", { locale: ptBR })
                              : "Selecione a data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={formData.recurrence?.end_date ? parse(formData.recurrence.end_date, 'yyyy-MM-dd', new Date()) : undefined}
                            onSelect={(date) => {
                              if (date) setFormData(prev => ({
                                ...prev,
                                recurrence: { ...prev.recurrence, end_date: format(date, 'yyyy-MM-dd') }
                              }));
                            }}
                            locale={ptBR}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  {recurrenceType === 'count' && (
                    <div>
                      <Label htmlFor="occurrences">{t('fields.occurrences')}</Label>
                      <Input
                        id="occurrences"
                        type="number"
                        min="1"
                        max="100"
                        value={formData.recurrence?.occurrences || ''}
                        onChange={(e) =>
                          setFormData(prev => ({
                            ...prev,
                            recurrence: { ...prev.recurrence, occurrences: parseInt(e.target.value) || undefined }
                          }))
                        }
                      />
                    </div>
                  )}

                  {recurrenceType === 'infinite' && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                        <Repeat className="h-4 w-4" />
                        <span className="font-medium">{t('infiniteRecurrence')}</span>
                      </div>
                      <p className="text-sm text-blue-600/80 dark:text-blue-400/80">
                        {t('infiniteRecurrenceNote')}
                      </p>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes">{t('fields.notes')}</Label>
            <Textarea
              id="notes"
              placeholder={t('fields.notesPlaceholder')}
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('actions.scheduling') : t('actions.scheduleClass')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}