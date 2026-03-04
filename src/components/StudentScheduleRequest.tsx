import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Clock, Plus, User, AlertCircle, Baby } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/contexts/ProfileContext";
import { formatInTimezone, formatDateBrazil, fromUserZonedTime, DEFAULT_TIMEZONE } from "@/utils/timezone";

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

interface Dependent {
  id: string;
  name: string;
  birth_date: string | null;
}

interface StudentScheduleRequestProps {
  teacherId: string;
}


const DAYS_OF_WEEK = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'
];

export function StudentScheduleRequest({ teacherId }: StudentScheduleRequestProps) {
  const { toast } = useToast();
  const { profile } = useProfile();
  const studentTimezone = (profile as any)?.timezone || DEFAULT_TIMEZONE;
  const [teacherTimezone, setTeacherTimezone] = useState<string>(DEFAULT_TIMEZONE);
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
  
  // Dependent selection state
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [selectedDependentId, setSelectedDependentId] = useState<string>("self");

  useEffect(() => {
    loadTeacherAvailability();
    loadDependents();
  }, [teacherId]);

  const loadDependents = async () => {
    if (!teacherId || !profile?.id) return;
    
    console.log('🧒 Loading dependents for responsible:', profile.id, 'teacher:', teacherId);
    
    try {
      const { data, error } = await supabase
        .from('dependents')
        .select('id, name, birth_date')
        .eq('responsible_id', profile.id)
        .eq('teacher_id', teacherId)
        .order('name');
      
      if (error) {
        console.error('Error loading dependents:', error);
        return;
      }
      
      console.log('🧒 Dependents loaded:', data);
      setDependents(data || []);
    } catch (error) {
      console.error('Error loading dependents:', error);
    }
  };

  useEffect(() => {
    if (workingHours.length > 0) {
      generateTimeSlots();
    }
  }, [selectedWeek, workingHours, availabilityBlocks, existingClasses, selectedService]);

  const loadTeacherAvailability = async () => {
    console.log('🎯 loadTeacherAvailability called with teacherId:', teacherId);
    
    if (!teacherId) {
      console.warn('⚠️ No teacherId provided, skipping availability load');
      setLoading(false);
      return;
    }
    
    try {
      console.log('📡 Calling get-teacher-availability edge function...');
      const { data, error } = await supabase.functions.invoke('get-teacher-availability', {
        body: { teacherId }
      });

      console.log('📊 Edge function response:', { data, error });
      
      if (error) throw error;

      setWorkingHours(data?.workingHours || []);
      setAvailabilityBlocks(data?.availabilityBlocks || []);
      setExistingClasses(data?.existingClasses || []);
      setServices(data?.services || []);
      setTeacherTimezone(data?.timezone || DEFAULT_TIMEZONE);
      
      if (data?.services && data.services.length > 0) {
        const defaultService = data.services[0];
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
      
      // Calculate date string in teacher's timezone to match working_hours day_of_week
      const teacherDateStr = formatInTimezone(currentDate, 'yyyy-MM-dd', teacherTimezone);
      const teacherDayOfWeek = parseInt(formatInTimezone(currentDate, 'e', teacherTimezone)) % 7; // date-fns 'e' is 1=Mon..7=Sun, convert
      // Actually use 'i' for ISO day or calculate manually
      const dayOfWeek = new Date(teacherDateStr + 'T12:00:00').getDay(); // safe: noon avoids DST edge
      
      // Find working hours for this day
      const dayWorkingHours = workingHours.filter(wh => wh.day_of_week === dayOfWeek);
      
      dayWorkingHours.forEach(workingHour => {
        // Interpret working_hours times in the TEACHER's timezone
        const [startHour, startMinute] = workingHour.start_time.split(':').map(Number);
        const [endHour, endMinute] = workingHour.end_time.split(':').map(Number);
        
        // Build UTC instants from teacher-local times
        const startUTC = fromUserZonedTime(new Date(`${teacherDateStr}T${workingHour.start_time}`), teacherTimezone);
        const endUTC = fromUserZonedTime(new Date(`${teacherDateStr}T${workingHour.end_time}`), teacherTimezone);
        
        // Generate 30-minute slots
        const currentSlot = new Date(startUTC);
        while (currentSlot < endUTC) {
          const slotEnd = new Date(currentSlot.getTime() + service.duration_minutes * 60000);
          
          if (slotEnd <= endUTC) {
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
      // Skip cancelled/completed classes - they don't occupy the time slot
      if ((existingClass as any).status === 'cancelada' || (existingClass as any).status === 'concluida') {
        continue;
      }
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
      // Prepare payload with optional dependent_id
      const payload: {
        teacherId: string;
        datetime: string;
        serviceId: string;
        notes: string;
        dependent_id?: string;
      } = {
        teacherId,
        datetime: selectedTimeSlot,
        serviceId: selectedService,
        notes
      };
      
      // Add dependent_id if a dependent is selected (not "self")
      if (selectedDependentId && selectedDependentId !== "self") {
        payload.dependent_id = selectedDependentId;
      }
      
      console.log('📤 Requesting class with payload:', payload);
      
      const { error } = await supabase.functions.invoke('request-class', {
        body: payload
      });

      if (error) throw error;

      toast({
        title: "Solicitação enviada!",
        description: "Sua solicitação de aula foi enviada para o professor. Aguarde a confirmação.",
      });

      setIsDialogOpen(false);
      setSelectedTimeSlot("");
      setNotes("");
      setSelectedDependentId("self");
      
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
    return formatInTimezone(date, 'dd/MM/yyyy', studentTimezone);
  };

  const formatTime = (datetime: string) => {
    return formatInTimezone(new Date(datetime), 'HH:mm', studentTimezone);
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => {
              const newWeek = new Date(selectedWeek);
              newWeek.setDate(newWeek.getDate() - 7);
              setSelectedWeek(newWeek);
            }}
          >
            <span className="hidden sm:inline">Semana Anterior</span>
            <span className="sm:hidden">← Anterior</span>
          </Button>
          <span className="font-medium text-sm sm:text-base text-center">
            {formatDate(selectedWeek)} - {formatDate(new Date(selectedWeek.getTime() + 6 * 24 * 60 * 60 * 1000))}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => {
              const newWeek = new Date(selectedWeek);
              newWeek.setDate(newWeek.getDate() + 7);
              setSelectedWeek(newWeek);
            }}
          >
            <span className="hidden sm:inline">Próxima Semana</span>
            <span className="sm:hidden">Próxima →</span>
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
                  {formatInTimezone(new Date(dateStr), "EEEE, dd/MM", studentTimezone)}
                </h4>
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {slots.map((slot, index) => (
                    <Dialog key={index} open={isDialogOpen && selectedTimeSlot === slot.datetime} onOpenChange={setIsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant={slot.available ? "outline" : "ghost"}
                          size="sm"
                          disabled={!slot.available}
                          className={`text-xs sm:text-sm min-h-[44px] ${
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
                               {formatInTimezone(new Date(selectedTimeSlot), "EEEE, dd/MM/yyyy", studentTimezone)} às {formatTime(selectedTimeSlot)} <span className="text-xs">(Seu fuso horário)</span>
                             </p>
                           </div>
                          
                          <div>
                            <Label>Tipo de Aula</Label>
                            <p className="text-sm text-muted-foreground">
                              {services.find(s => s.id === selectedService)?.name} - {' '}
                              {services.find(s => s.id === selectedService)?.duration_minutes}min
                            </p>
                          </div>
                          
                          {/* Dependent Selection - only show if user has dependents */}
                          {dependents.length > 0 && (
                            <div>
                              <Label htmlFor="class-for">Para quem é a aula?</Label>
                              <Select 
                                value={selectedDependentId} 
                                onValueChange={setSelectedDependentId}
                              >
                                <SelectTrigger id="class-for" className="mt-1">
                                  <SelectValue placeholder="Selecione o aluno" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="self">
                                    <div className="flex items-center gap-2">
                                      <User className="h-4 w-4" />
                                      <span>Para mim</span>
                                    </div>
                                  </SelectItem>
                                  {dependents.map((dep) => (
                                    <SelectItem key={dep.id} value={dep.id}>
                                      <div className="flex items-center gap-2">
                                        <Baby className="h-4 w-4" />
                                        <span>{dep.name}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          
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