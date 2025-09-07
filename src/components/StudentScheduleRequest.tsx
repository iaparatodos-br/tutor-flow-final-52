import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Clock, Plus, User, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface WorkingHour {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface AvailabilityBlock {
  id: string;
  start_datetime: string;
  end_datetime: string;
  title: string;
}

interface ExistingClass {
  class_date: string;
  duration_minutes: number;
}

interface ClassService {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface TimeSlot {
  datetime: string;
  available: boolean;
  reason?: string;
}

interface StudentScheduleRequestProps {
  teacherId: string;
  studentId: string;
}

const DAYS_OF_WEEK = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'
];

export function StudentScheduleRequest({ teacherId, studentId }: StudentScheduleRequestProps) {
  const { toast } = useToast();
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);
  const [existingClasses, setExistingClasses] = useState<ExistingClass[]>([]);
  const [services, setServices] = useState<ClassService[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    return monday;
  });
  const [selectedService, setSelectedService] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("");

  useEffect(() => {
    loadTeacherAvailability();
  }, [teacherId]);

  useEffect(() => {
    if (workingHours.length > 0) {
      generateTimeSlots();
    }
  }, [selectedWeek, workingHours, availabilityBlocks, existingClasses, selectedService]);

  const loadTeacherAvailability = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-teacher-availability', {
        body: { teacherId }
      });

      if (error) throw error;

      setWorkingHours(data?.workingHours || []);
      setAvailabilityBlocks(data?.availabilityBlocks || []);
      setExistingClasses(data?.existingClasses || []);
      setServices(data?.services || []);
      
      if (data?.services && data.services.length > 0) {
        const defaultService = data.services.find((s: any) => s.is_default) || data.services[0];
        setSelectedService(defaultService.id);
      }
    } catch (error) {
      console.error('Error loading teacher availability:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar disponibilidade do professor",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateTimeSlots = () => {
    if (!selectedService) return;

    const service = services.find(s => s.id === selectedService);
    if (!service) return;

    const slots: TimeSlot[] = [];
    const weekStart = new Date(selectedWeek);
    
    // Generate slots for 7 days starting from selected week
    for (let day = 0; day < 7; day++) {
      const currentDate = new Date(weekStart);
      currentDate.setDate(weekStart.getDate() + day);
      const dayOfWeek = currentDate.getDay();
      
      // Find working hours for this day
      const dayWorkingHours = workingHours.filter(wh => wh.day_of_week === dayOfWeek);
      
      dayWorkingHours.forEach(workingHour => {
        const startTime = new Date(currentDate);
        const [startHour, startMinute] = workingHour.start_time.split(':').map(Number);
        startTime.setHours(startHour, startMinute, 0, 0);
        
        const endTime = new Date(currentDate);
        const [endHour, endMinute] = workingHour.end_time.split(':').map(Number);
        endTime.setHours(endHour, endMinute, 0, 0);
        
        // Generate 30-minute slots
        const currentSlot = new Date(startTime);
        while (currentSlot < endTime) {
          const slotEnd = new Date(currentSlot.getTime() + service.duration_minutes * 60000);
          
          if (slotEnd <= endTime) {
            const isAvailable = checkSlotAvailability(currentSlot, service.duration_minutes);
            
            slots.push({
              datetime: currentSlot.toISOString(),
              available: isAvailable.available,
              reason: isAvailable.reason
            });
          }
          
          currentSlot.setMinutes(currentSlot.getMinutes() + 30);
        }
      });
    }
    
    // Sort slots by datetime
    slots.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
    setTimeSlots(slots);
  };

  const checkSlotAvailability = (slotStart: Date, durationMinutes: number) => {
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
    const now = new Date();
    
    // Check if slot is in the past
    if (slotStart < now) {
      return { available: false, reason: "Horário já passou" };
    }
    
    // Check against availability blocks (blocked times)
    for (const block of availabilityBlocks) {
      const blockStart = new Date(block.start_datetime);
      const blockEnd = new Date(block.end_datetime);
      
      if (
        (slotStart >= blockStart && slotStart < blockEnd) ||
        (slotEnd > blockStart && slotEnd <= blockEnd) ||
        (slotStart <= blockStart && slotEnd >= blockEnd)
      ) {
        return { available: false, reason: `Bloqueado: ${block.title}` };
      }
    }
    
    // Check against existing classes
    for (const existingClass of existingClasses) {
      const classStart = new Date(existingClass.class_date);
      const classEnd = new Date(classStart.getTime() + existingClass.duration_minutes * 60000);
      
      if (
        (slotStart >= classStart && slotStart < classEnd) ||
        (slotEnd > classStart && slotEnd <= classEnd) ||
        (slotStart <= classStart && slotEnd >= classEnd)
      ) {
        return { available: false, reason: "Horário ocupado por outra aula" };
      }
    }
    
    return { available: true };
  };

  const handleRequestClass = async () => {
    if (!selectedTimeSlot || !selectedService) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('request-class', {
        body: {
          teacherId,
          studentId,
          datetime: selectedTimeSlot,
          serviceId: selectedService,
          notes
        }
      });

      if (error) throw error;

      toast({
        title: "Solicitação enviada!",
        description: "Sua solicitação de aula foi enviada para o professor. Aguarde a confirmação.",
      });

      setIsDialogOpen(false);
      setSelectedTimeSlot("");
      setNotes("");
      
      // Reload data to update available slots
      loadTeacherAvailability();
      
    } catch (error) {
      console.error('Error requesting class:', error);
      toast({
        title: "Erro",
        description: "Erro ao solicitar aula. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatTime = (datetime: string) => {
    return new Date(datetime).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const groupSlotsByDate = () => {
    const grouped: { [key: string]: TimeSlot[] } = {};
    
    timeSlots.forEach(slot => {
      const date = new Date(slot.datetime).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(slot);
    });
    
    return grouped;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Solicitar Aula
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Carregando horários disponíveis...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (workingHours.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Solicitar Aula
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Sem horários definidos</h3>
            <p className="text-muted-foreground">
              O professor ainda não definiu seus horários de trabalho.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const groupedSlots = groupSlotsByDate();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Solicitar Aula
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Week Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => {
              const newWeek = new Date(selectedWeek);
              newWeek.setDate(newWeek.getDate() - 7);
              setSelectedWeek(newWeek);
            }}
          >
            Semana Anterior
          </Button>
          <span className="font-medium">
            {formatDate(selectedWeek)} - {formatDate(new Date(selectedWeek.getTime() + 6 * 24 * 60 * 60 * 1000))}
          </span>
          <Button
            variant="outline"
            onClick={() => {
              const newWeek = new Date(selectedWeek);
              newWeek.setDate(newWeek.getDate() + 7);
              setSelectedWeek(newWeek);
            }}
          >
            Próxima Semana
          </Button>
        </div>

        {/* Service Selection */}
        <div>
          <Label htmlFor="service">Tipo de Aula</Label>
          <Select value={selectedService} onValueChange={setSelectedService}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o tipo de aula" />
            </SelectTrigger>
            <SelectContent>
              {services.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name} - {service.duration_minutes}min - R$ {service.price.toFixed(2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Available Time Slots */}
        <div className="space-y-4">
          {Object.keys(groupedSlots).length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Nenhum horário disponível</h3>
              <p className="text-muted-foreground">
                Não há horários disponíveis para esta semana.
              </p>
            </div>
          ) : (
            Object.entries(groupedSlots).map(([dateStr, slots]) => (
              <div key={dateStr} className="space-y-2">
                <h4 className="font-medium text-sm">
                  {new Date(dateStr).toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit'
                  })}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {slots.map((slot, index) => (
                    <Dialog key={index} open={isDialogOpen && selectedTimeSlot === slot.datetime} onOpenChange={setIsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant={slot.available ? "outline" : "ghost"}
                          size="sm"
                          disabled={!slot.available}
                          className={`text-xs ${
                            slot.available 
                              ? "hover:bg-primary hover:text-primary-foreground" 
                              : "opacity-50 cursor-not-allowed"
                          }`}
                          onClick={() => {
                            if (slot.available) {
                              setSelectedTimeSlot(slot.datetime);
                              setIsDialogOpen(true);
                            }
                          }}
                          title={slot.reason}
                        >
                          {formatTime(slot.datetime)}
                          {!slot.available && (
                            <Badge variant="secondary" className="ml-1 text-xs">
                              Ocupado
                            </Badge>
                          )}
                        </Button>
                      </DialogTrigger>
                      
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Solicitar Aula</DialogTitle>
                          <DialogDescription>
                            Selecione o horário e confirme os detalhes da solicitação.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Data e Horário</Label>
                            <p className="text-sm text-muted-foreground">
                              {new Date(selectedTimeSlot).toLocaleDateString('pt-BR', {
                                weekday: 'long',
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                              })} às {formatTime(selectedTimeSlot)}
                            </p>
                          </div>
                          
                          <div>
                            <Label>Tipo de Aula</Label>
                            <p className="text-sm text-muted-foreground">
                              {services.find(s => s.id === selectedService)?.name} - {' '}
                              {services.find(s => s.id === selectedService)?.duration_minutes}min
                            </p>
                          </div>
                          
                          <div>
                            <Label htmlFor="notes">Observações (opcional)</Label>
                            <Textarea
                              id="notes"
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              placeholder="Adicione observações sobre a aula..."
                              className="mt-1"
                            />
                          </div>
                          
                          <div className="flex gap-2 pt-4">
                            <Button
                              onClick={handleRequestClass}
                              disabled={submitting}
                              className="flex-1"
                            >
                              {submitting ? "Enviando..." : "Solicitar Aula"}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => setIsDialogOpen(false)}
                              disabled={submitting}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}