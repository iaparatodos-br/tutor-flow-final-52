import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, View, Event as CalendarEvent } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/pt-br';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar as CalendarIcon, Clock, User, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Configure moment to Portuguese
moment.locale('pt-br');
const localizer = momentLocalizer(moment);

export interface CalendarClass {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: 'pendente' | 'confirmada' | 'cancelada' | 'concluida';
  student: {
    name: string;
    email: string;
  };
  notes?: string;
}

export interface AvailabilityBlock {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: 'block';
}

interface CalendarViewProps {
  classes: CalendarClass[];
  availabilityBlocks?: AvailabilityBlock[];
  isProfessor: boolean;
  onConfirmClass?: (classId: string) => void;
  loading?: boolean;
}

const messages = {
  allDay: 'Dia inteiro',
  previous: 'Anterior',
  next: 'Próximo',
  today: 'Hoje',
  month: 'Mês',
  week: 'Semana',
  day: 'Dia',
  agenda: 'Agenda',
  date: 'Data',
  time: 'Hora',
  event: 'Evento',
  showMore: (count: number) => `+${count} mais`,
  noEventsInRange: 'Não há eventos neste período',
};

export function CalendarView({ classes, availabilityBlocks = [], isProfessor, onConfirmClass, loading }: CalendarViewProps) {
  const { profile } = useAuth();
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarClass | AvailabilityBlock | null>(null);
  
  // Combine classes and availability blocks for calendar display
  const allEvents = [
    ...classes,
    ...availabilityBlocks
  ];

  const getEventStyle = (event: CalendarClass | AvailabilityBlock) => {
    // Handle availability blocks
    if ('type' in event && event.type === 'block') {
      return {
        style: {
          backgroundColor: 'hsl(var(--muted-foreground))',
          border: 'none',
          borderRadius: '0.375rem',
          color: 'white',
          fontWeight: '500',
          fontSize: '0.875rem',
          opacity: 0.7
        }
      };
    }

    // Handle class events
    const classEvent = event as CalendarClass;
    const statusColors = {
      pendente: 'hsl(var(--warning))',
      confirmada: 'hsl(var(--primary))',
      cancelada: 'hsl(var(--destructive))',
      concluida: 'hsl(var(--success))'
    };

    return {
      style: {
        backgroundColor: statusColors[classEvent.status],
        border: 'none',
        borderRadius: '0.375rem',
        color: 'white',
        fontWeight: '500',
        fontSize: '0.875rem'
      }
    };
  };

  const handleSelectEvent = (event: CalendarClass | AvailabilityBlock) => {
    setSelectedEvent(event);
  };

  const formatEventTime = (start: Date, end: Date) => {
    return `${moment(start).format('HH:mm')} - ${moment(end).format('HH:mm')}`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pendente: { label: "Pendente", variant: "secondary" as const },
      confirmada: { label: "Confirmada", variant: "default" as const },
      cancelada: { label: "Cancelada", variant: "destructive" as const },
      concluida: { label: "Concluída", variant: "outline" as const }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pendente;
    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-6">
          <div className="text-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
            <p className="text-muted-foreground">Carregando calendário...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-card">
        <CardContent className="p-6">
          {/* Calendar Toolbar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              <h2 className="text-xl font-semibold">
                {moment(date).format('MMMM YYYY')}
              </h2>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {(['month', 'week', 'day'] as View[]).map((viewType) => (
                <Button
                  key={viewType}
                  variant={view === viewType ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setView(viewType)}
                  className="capitalize"
                >
                  {viewType === 'month' ? 'Mês' : viewType === 'week' ? 'Semana' : 'Dia'}
                </Button>
              ))}
            </div>
          </div>

          {/* Calendar */}
          <div className="calendar-container" style={{ height: '600px' }}>
            <Calendar
              localizer={localizer}
              events={allEvents}
              startAccessor="start"
              endAccessor="end"
              view={view}
              onView={setView}
              date={date}
              onNavigate={setDate}
              onSelectEvent={handleSelectEvent}
              eventPropGetter={getEventStyle}
              messages={messages}
              className="tutorflow-calendar"
              popup
              popupOffset={{ x: 30, y: 20 }}
              step={60}
              timeslots={1}
              showMultiDayTimes={false}
              dayLayoutAlgorithm="no-overlap"
              formats={{
                timeGutterFormat: 'HH:mm',
                eventTimeRangeFormat: ({ start, end }) => 
                  `${moment(start).format('HH:mm')} - ${moment(end).format('HH:mm')}`,
                dayFormat: 'ddd DD/MM',
                monthHeaderFormat: 'MMMM YYYY',
                dayHeaderFormat: 'dddd, DD/MM',
                dayRangeHeaderFormat: ({ start, end }) =>
                  `${moment(start).format('DD/MM')} - ${moment(end).format('DD/MM')}`
              }}
            />
          </div>

          {classes.length === 0 && availabilityBlocks.length === 0 && (
            <div className="text-center py-8">
              <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Nenhuma aula agendada</h3>
              <p className="text-muted-foreground">
                {isProfessor 
                  ? "Suas próximas aulas aparecerão no calendário"
                  : "Você não tem aulas agendadas no momento"
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Details Modal */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Detalhes da Aula</DialogTitle>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-4">
              {'type' in selectedEvent && selectedEvent.type === 'block' ? (
                // Availability Block Details
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedEvent.title}</span>
                    <Badge variant="secondary">Bloqueado</Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      <span>{moment(selectedEvent.start).format('dddd, DD/MM/YYYY')}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{formatEventTime(selectedEvent.start, selectedEvent.end)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                // Class Details
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{(selectedEvent as CalendarClass).student.name}</span>
                    </div>
                    {getStatusBadge((selectedEvent as CalendarClass).status)}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      <span>{moment(selectedEvent.start).format('dddd, DD/MM/YYYY')}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{formatEventTime(selectedEvent.start, selectedEvent.end)}</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Email do aluno:</p>
                    <p className="text-sm">{(selectedEvent as CalendarClass).student.email}</p>
                  </div>

                  {(selectedEvent as CalendarClass).notes && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Observações:</p>
                      <p className="text-sm bg-muted p-2 rounded">{(selectedEvent as CalendarClass).notes}</p>
                    </div>
                  )}

                  {isProfessor && (selectedEvent as CalendarClass).status === 'pendente' && onConfirmClass && (
                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={() => {
                          onConfirmClass((selectedEvent as CalendarClass).id);
                          setSelectedEvent(null);
                        }}
                        className="bg-gradient-success shadow-success hover:bg-success"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Confirmar Aula
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}