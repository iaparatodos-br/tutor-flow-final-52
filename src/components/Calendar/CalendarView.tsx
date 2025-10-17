import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, View, Event as CalendarEvent } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import moment from 'moment';
import 'moment/locale/pt-br';
import './calendar.css';
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
import { useTranslation } from 'react-i18next';

// Configure moment to Portuguese
moment.locale('pt-br');
const localizer = momentLocalizer(moment);

export interface ClassParticipant {
  student_id: string;
  status?: 'pendente' | 'confirmada' | 'cancelada' | 'concluida' | 'removida';
  student: {
    name: string;
    email: string;
  };
}

export interface CalendarClass {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: 'pendente' | 'confirmada' | 'cancelada' | 'concluida' | 'removida';
  student: {
    name: string;
    email: string;
  };
  participants?: ClassParticipant[];
  notes?: string;
  is_experimental?: boolean;
  is_group_class?: boolean;
  isVirtual?: boolean;
  class_template_id?: string;
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

export function CalendarView({ classes, availabilityBlocks = [], isProfessor, onConfirmClass, onCancelClass, onCompleteClass, loading }: CalendarViewProps) {
  const { profile } = useAuth();
  const { t } = useTranslation('classes');
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarClass | AvailabilityBlock | null>(null);
  
  const messages = {
    allDay: t('calendar.allDay'),
    previous: t('calendar.previous'),
    next: t('calendar.next'),
    today: t('calendar.today'),
    month: t('calendar.month'),
    week: t('calendar.week'),
    day: t('calendar.day'),
    agenda: t('calendar.agenda'),
    date: t('calendar.date'),
    time: t('calendar.time'),
    event: t('calendar.event'),
    showMore: (count: number) => t('calendar.showMore', { count }),
    noEventsInRange: t('calendar.noEventsInRange'),
  };
  
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
      pendente: { label: t('status.pending'), variant: "secondary" as const },
      confirmada: { label: t('status.confirmed'), variant: "default" as const },
      cancelada: { label: t('status.cancelled'), variant: "destructive" as const },
      concluida: { label: t('status.completed'), variant: "outline" as const }
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
            <p className="text-muted-foreground">{t('calendar.loadingCalendar')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-card border-none overflow-hidden bg-gradient-subtle">
        <CardContent className="p-0">
          {/* Calendar */}
          <div className="tutorflow-calendar" style={{ height: '700px' }}>
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
              <h3 className="text-lg font-medium mb-2">{t('calendar.noClassesScheduled')}</h3>
              <p className="text-muted-foreground">
                {isProfessor 
                  ? t('calendar.noClassesProfessor')
                  : t('calendar.noClassesStudent')
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
            <DialogTitle>{t('calendar.eventDetails')}</DialogTitle>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-4">
              {'type' in selectedEvent && selectedEvent.type === 'block' ? (
                // Availability Block Details
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedEvent.title}</span>
                    <Badge variant="secondary">{t('calendar.blocked')}</Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      <span>{moment(selectedEvent.start).format('dddd, DD/MM/YYYY')}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{formatEventTime(selectedEvent.start, selectedEvent.end)} <span className="text-xs text-muted-foreground">{t('brasilia_timezone')}</span></span>
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
                          ? t('calendar.groupWithCount', { count: (selectedEvent as CalendarClass).participants?.length || 1 })
                          : (selectedEvent as CalendarClass).student.name
                        }
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {getStatusBadge((selectedEvent as CalendarClass).status)}
                      {(selectedEvent as CalendarClass).is_experimental && (
                        <Badge variant="outline" className="border-warning text-warning">
                          {t('experimental')}
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
                      {(selectedEvent as CalendarClass).is_group_class ? t('calendar.participants') : t('calendar.student')}:
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
                      <p className="text-sm text-muted-foreground mb-1">{t('calendar.notes')}:</p>
                      <p className="text-sm bg-muted p-2 rounded">{(selectedEvent as CalendarClass).notes}</p>
                    </div>
                  )}

                  {/* Class Report Section */}
                  {(() => {
                    const classEvent = selectedEvent as CalendarClass;
                    
                    // For students in group classes, check individual status
                    let showReport = false;
                    if (!isProfessor && classEvent.is_group_class && profile?.id) {
                      const myParticipation = classEvent.participants?.find(
                        p => p.student_id === profile.id
                      );
                      showReport = myParticipation?.status === 'concluida';
                    } else {
                      // For professors or individual classes, use class status
                      showReport = classEvent.status === 'concluida';
                    }
                    
                    return showReport ? (
                      <div className="mt-6">
                        <Separator className="mb-4" />
                        <ClassReportView
                          classId={classEvent.id}
                          onEditReport={() => {
                            if (onCompleteClass) {
                              onCompleteClass(classEvent);
                            }
                          }}
                          showEditButton={isProfessor}
                        />
                      </div>
                    ) : null;
                  })()}

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
                          {t('actions.cancelClass')}
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
                          {t('actions.completeClass')}
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
                          {t('actions.confirmClass')}
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