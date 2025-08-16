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
import { Separator } from '@/components/ui/separator';
import { Calendar as CalendarIcon, Clock, User, CheckCircle, X, FileText, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClassReportView } from '@/components/ClassReportView';

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
  participants?: Array<{
    student_id: string;
    student: {
      name: string;
      email: string;
    };
  }>;
  notes?: string;
  is_experimental?: boolean;
  is_group_class?: boolean;
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
  onCancelClass?: (classId: string, className: string, classDate: string) => void;
  onCompleteClass?: (classData: CalendarClass) => void;
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

export function CalendarView({ classes, availabilityBlocks = [], isProfessor, onConfirmClass, onCancelClass, onCompleteClass, loading }: CalendarViewProps) {
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

    let backgroundColor = statusColors[classEvent.status];
    let borderLeft = 'none';
    
    // Special styling for experimental classes
    if (classEvent.is_experimental) {
      borderLeft = '4px solid hsl(var(--warning))';
    }
    
    // Special styling for group classes
    if (classEvent.is_group_class) {
      backgroundColor = `linear-gradient(135deg, ${backgroundColor}, ${backgroundColor}dd)`;
    }

    return {
      style: {
        background: backgroundColor,
        border: 'none',
        borderLeft,
        borderRadius: '0.375rem',
        color: 'white',
        fontWeight: '500',
        fontSize: '0.875rem',
        boxShadow: classEvent.is_experimental ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
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
          {/* Calendar */}
          <div className="calendar-container" style={{ height: '700px' }}>
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
              toolbar={true}
              formats={{
                timeGutterFormat: 'HH:mm',
                eventTimeRangeFormat: ({ start }) => {
                  const hour = moment(start).hour();
                  const minute = moment(start).minute();
                  if (minute === 0) {
                    return hour > 12 ? `${hour - 12}p` : hour === 12 ? '12p' : `${hour}a`;
                  } else {
                    return hour > 12 ? `${hour - 12}:${minute.toString().padStart(2, '0')}p` : 
                           hour === 12 ? `12:${minute.toString().padStart(2, '0')}p` : 
                           `${hour}:${minute.toString().padStart(2, '0')}a`;
                  }
                },
                dayFormat: 'ddd',
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
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
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
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {(selectedEvent as CalendarClass).is_group_class 
                          ? `Aula em Grupo (${(selectedEvent as CalendarClass).participants?.length || 1} alunos)`
                          : (selectedEvent as CalendarClass).student.name
                        }
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {getStatusBadge((selectedEvent as CalendarClass).status)}
                      {(selectedEvent as CalendarClass).is_experimental && (
                        <Badge variant="outline" className="border-warning text-warning">
                          Experimental
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      <span>{moment(selectedEvent.start).format('dddd, DD/MM/YYYY')}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{formatEventTime(selectedEvent.start, selectedEvent.end)}</span>
                    </div>
                  </div>

                  {/* Participants */}
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {(selectedEvent as CalendarClass).is_group_class ? 'Participantes:' : 'Aluno:'}
                    </p>
                    <div className="space-y-2">
                      {(selectedEvent as CalendarClass).participants?.map((participant, index) => (
                        <div key={index} className="bg-muted p-2 rounded text-sm">
                          <div className="font-medium">{participant.student.name}</div>
                          <div className="text-muted-foreground">{participant.student.email}</div>
                        </div>
                      )) || (
                        <div className="bg-muted p-2 rounded text-sm">
                          <div className="font-medium">{(selectedEvent as CalendarClass).student.name}</div>
                          <div className="text-muted-foreground">{(selectedEvent as CalendarClass).student.email}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {(selectedEvent as CalendarClass).notes && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Observações:</p>
                      <p className="text-sm bg-muted p-2 rounded">{(selectedEvent as CalendarClass).notes}</p>
                    </div>
                  )}

                  {/* Class Report Section */}
                  {(selectedEvent as CalendarClass).status === 'concluida' && (
                    <div className="mt-6">
                      <Separator className="mb-4" />
                      <ClassReportView
                        classId={(selectedEvent as CalendarClass).id}
                        onEditReport={() => {
                          if (onCompleteClass) {
                            onCompleteClass(selectedEvent as CalendarClass);
                          }
                        }}
                        showEditButton={isProfessor}
                      />
                    </div>
                  )}

                  {/* Action Buttons */}
                  {(selectedEvent as CalendarClass).status === 'pendente' || (selectedEvent as CalendarClass).status === 'confirmada' ? (
                    <div className="flex justify-end gap-2 pt-2">
                      {/* Cancel Button - Available for both students and professors */}
                      {onCancelClass && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            const classEvent = selectedEvent as CalendarClass;
                            onCancelClass(
                              classEvent.id, 
                              classEvent.title, 
                              classEvent.start.toISOString()
                            );
                            setSelectedEvent(null);
                          }}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancelar Aula
                        </Button>
                      )}
                      
                      {/* Complete Class Button - Only for professors */}
                      {isProfessor && (selectedEvent as CalendarClass).status === 'confirmada' && onCompleteClass && (
                        <Button
                          onClick={() => {
                            onCompleteClass(selectedEvent as CalendarClass);
                            setSelectedEvent(null);
                          }}
                          className="bg-gradient-primary shadow-glow"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Concluir Aula
                        </Button>
                      )}
                      
                      {/* Confirm Button - Only for professors */}
                      {isProfessor && (selectedEvent as CalendarClass).status === 'pendente' && onConfirmClass && (
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
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}