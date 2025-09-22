import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Users, Star, Repeat, DollarSign } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { FeatureGate } from '@/components/FeatureGate';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from 'sonner';

interface Student {
  id: string;
  name: string;
}

interface ClassService {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface ClassFormData {
  selectedStudents: string[];
  service_id: string;
  class_date: string;
  time: string;
  duration_minutes: number;
  notes: string;
  is_experimental: boolean;
  is_group_class: boolean;
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
  services: ClassService[];
  existingClasses: Array<{
    id: string;
    class_date: string;
    duration_minutes: number;
    status: 'pendente' | 'confirmada' | 'cancelada' | 'concluida';
  }>;
  onSubmit: (data: ClassFormData) => Promise<void>;
  loading?: boolean;
}

export function ClassForm({ open, onOpenChange, students, services, existingClasses, onSubmit, loading }: ClassFormProps) {
  const { hasFeature, currentPlan } = useSubscription();
  const [formData, setFormData] = useState<ClassFormData>({
    selectedStudents: [],
    service_id: '',
    class_date: '',
    time: '',
    duration_minutes: 60,
    notes: '',
    is_experimental: false,
    is_group_class: false,
    recurrence: {
      frequency: 'weekly',
      is_infinite: false
    }
  });

  const [showRecurrence, setShowRecurrence] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'date' | 'count' | 'infinite'>('date');
  const [validationErrors, setValidationErrors] = useState({
    students: false,
    service: false,
    date: false,
    time: false,
    pastDateTime: false,
    timeConflict: false,
  });

  const resetForm = () => {
    setFormData({
      selectedStudents: [],
      service_id: '',
      class_date: '',
      time: '',
      duration_minutes: 60,
      notes: '',
      is_experimental: false,
      is_group_class: false,
      recurrence: {
        frequency: 'weekly',
        is_infinite: false
      }
    });
    setShowRecurrence(false);
    setRecurrenceType('date');
    setValidationErrors({ students: false, service: false, date: false, time: false, pastDateTime: false, timeConflict: false });
  };

  const handleStudentSelection = (studentId: string, checked: boolean) => {
    setFormData(prev => {
      const selectedStudents = checked
        ? [...prev.selectedStudents, studentId]
        : prev.selectedStudents.filter(id => id !== studentId);

      return {
        ...prev,
        selectedStudents,
        is_group_class: selectedStudents.length > 1
      };
    });
    setValidationErrors(prev => ({ ...prev, students: false }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if it's a group class (more than 1 student) and user is on free plan
    if (formData.selectedStudents.length > 1 && currentPlan?.slug === 'free') {
      toast.error('Aulas em grupo são um recurso premium. Faça upgrade do seu plano para usar esta funcionalidade.');
      return;
    }

    const errors = {
      students: formData.selectedStudents.length === 0,
      service: !formData.is_experimental && !formData.service_id,
      date: !formData.class_date,
      time: !formData.time,
      pastDateTime: false,
      timeConflict: false,
    };

    // Check if date/time is in the past
    if (formData.class_date && formData.time) {
      const classDateTime = new Date(`${formData.class_date}T${formData.time}`);
      const now = new Date();
      if (classDateTime <= now) {
        errors.pastDateTime = true;
      }

      // Check for time conflicts with existing classes
      const classEnd = new Date(classDateTime.getTime() + (formData.duration_minutes * 60 * 1000));
      
      const hasConflict = existingClasses.some(existingClass => {
        // Skip cancelled or completed classes
        if (existingClass.status === 'cancelada' || existingClass.status === 'concluida') {
          return false;
        }
        
        const existingStart = new Date(existingClass.class_date);
        const existingEnd = new Date(existingStart.getTime() + (existingClass.duration_minutes * 60 * 1000));
        
        // Check if times overlap
        return (classDateTime < existingEnd && classEnd > existingStart);
      });
      
      if (hasConflict) {
        errors.timeConflict = true;
      }
    }

    setValidationErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      return;
    }

    const submitData: ClassFormData = {
      ...formData,
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

  const selectedStudentNames = formData.selectedStudents
    .map(id => students.find(s => s.id === id)?.name)
    .filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Agendar Nova Aula
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Student Selection */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-4 w-4" />
                Selecionar Alunos
              </CardTitle>
              <CardDescription>
                Escolha um ou mais alunos para a aula
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {students.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum aluno cadastrado
                </p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {students.map((student) => (
                    <div key={student.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={student.id}
                        checked={formData.selectedStudents.includes(student.id)}
                        onCheckedChange={(checked) =>
                          handleStudentSelection(student.id, checked as boolean)
                        }
                      />
                      <Label
                        htmlFor={student.id}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {student.name}
                      </Label>
                    </div>
                  ))}
                </div>
              )}

              {formData.selectedStudents.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="flex flex-wrap gap-1">
                    {selectedStudentNames.map((name, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {name}
                      </Badge>
                    ))}
                  </div>
                   {formData.selectedStudents.length > 1 && currentPlan?.slug === 'free' && (
                     <Badge variant="destructive" className="mt-2">
                       <Users className="h-3 w-3 mr-1" />
                       Aula em Grupo - Premium
                     </Badge>
                   )}
                   {formData.is_group_class && currentPlan?.slug !== 'free' && (
                     <Badge variant="outline" className="mt-2">
                       <Users className="h-3 w-3 mr-1" />
                       Aula em Grupo
                     </Badge>
                   )}
                </div>
              )}

              {validationErrors.students && (
                <p className="text-sm text-destructive">
                  Selecione pelo menos um aluno
                </p>
              )}
            </CardContent>
          </Card>

          {/* Class Type Options */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Tipo de Aula</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="experimental"
                  checked={formData.is_experimental}
                  onCheckedChange={(checked) =>
                    setFormData(prev => ({ ...prev, is_experimental: checked as boolean }))
                  }
                />
                <Label htmlFor="experimental" className="flex items-center gap-2 cursor-pointer">
                  <Star className="h-4 w-4 text-warning" />
                  Aula Experimental (gratuita)
                </Label>
              </div>
              {formData.is_experimental && (
                <p className="text-sm text-muted-foreground ml-6">
                  Esta aula não será cobrada e será marcada como experimental
                </p>
              )}
            </CardContent>
          </Card>

          {/* Service Selection */}
          {!formData.is_experimental && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Selecionar Serviço
                </CardTitle>
                <CardDescription>
                  Escolha o tipo de aula e seu preço
                </CardDescription>
              </CardHeader>
              <CardContent>
                {services.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum serviço cadastrado. <a href="/servicos" className="text-primary underline">Cadastre seus serviços</a> para definir preços.
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
                        <SelectValue placeholder="Selecione um serviço" />
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
                              <span>Serviço selecionado:</span>
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
                    Selecione um serviço para definir o preço da aula
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Data *</Label>
              <Input
                id="date"
                type="date"
                value={formData.class_date}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, class_date: e.target.value }));
                  setValidationErrors(prev => ({ ...prev, date: false, pastDateTime: false, timeConflict: false }));
                }}
                className={validationErrors.date || validationErrors.pastDateTime || validationErrors.timeConflict ? "border-destructive" : ""}
                required
              />
            </div>

            <div>
              <Label htmlFor="time">Horário * <span className="text-xs text-muted-foreground">(Horário de Brasília)</span></Label>
              <Input
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, time: e.target.value }));
                  setValidationErrors(prev => ({ ...prev, time: false, pastDateTime: false, timeConflict: false }));
                }}
                className={validationErrors.time || validationErrors.pastDateTime || validationErrors.timeConflict ? "border-destructive" : ""}
                required
              />
            </div>
          </div>

          {validationErrors.pastDateTime && (
            <p className="text-sm text-destructive">
              Não é possível agendar aulas para data/horário passado
            </p>
          )}
          
          {validationErrors.timeConflict && (
            <p className="text-sm text-destructive">
              Já existe uma aula agendada neste horário
            </p>
          )}

          {/* Duration */}
          <div>
            <Label htmlFor="duration">Duração</Label>
            <Select
              value={formData.duration_minutes.toString()}
              onValueChange={(value) =>
                setFormData(prev => ({ ...prev, duration_minutes: parseInt(value) }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="60">1 hora</SelectItem>
                <SelectItem value="90">1h 30min</SelectItem>
                <SelectItem value="120">2 horas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Recurrence */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Repeat className="h-4 w-4" />
                    Recorrência
                  </CardTitle>
                  <CardDescription>
                    Configure aulas recorrentes
                  </CardDescription>
                </div>
                <Checkbox
                  checked={showRecurrence}
                  onCheckedChange={(checked) => {
                    setShowRecurrence(checked as boolean);
                    // Initialize recurrence with default frequency when enabling
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
            </CardHeader>
            {showRecurrence && (
              <CardContent className="space-y-4">
                <div>
                  <Label>Frequência</Label>
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
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="biweekly">Quinzenal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="infinite-recurrence">Recorrência Contínua</Label>
                    <p className="text-sm text-muted-foreground">
                      A aula se repetirá indefinidamente
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
                    <Label>Término da recorrência</Label>
                    <Select value={recurrenceType} onValueChange={(value: "date" | "count") => setRecurrenceType(value as "date" | "count")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Até uma data</SelectItem>
                        <SelectItem value="count">Número de aulas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {recurrenceType === 'date' && (
                  <div>
                    <Label htmlFor="end_date">Data final</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formData.recurrence?.end_date || ''}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          recurrence: { ...prev.recurrence, end_date: e.target.value }
                        }))
                      }
                    />
                  </div>
                )}

                {recurrenceType === 'count' && (
                  <div>
                    <Label htmlFor="occurrences">Número de aulas</Label>
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
                      <span className="font-medium">Recorrência Contínua</span>
                    </div>
                    <p className="text-sm text-blue-600/80 dark:text-blue-400/80">
                      As aulas serão geradas automaticamente na agenda conforme você navegar pelos meses.
                    </p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              placeholder="Observações sobre a aula..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Agendando..." : "Agendar Aula"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}