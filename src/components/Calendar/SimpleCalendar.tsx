import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, CheckCircle, X, FileText, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarClass, AvailabilityBlock } from './CalendarView';
import { ClassReportView } from '@/components/ClassReportView';
import { useTranslation } from 'react-i18next';

interface SimpleCalendarProps {
  classes: CalendarClass[];
  availabilityBlocks?: AvailabilityBlock[];
  isProfessor: boolean;
  currentUserId?: string;
  onConfirmClass?: (classId: string) => void;
  onCancelClass?: (classId: string, className: string, classDate: string) => void;
  onCompleteClass?: (classData: CalendarClass) => void;
  onManageReport?: (classData: CalendarClass) => void;
  onEndRecurrence?: (templateId: string, endDate: string) => void;
  loading?: boolean;
  onScheduleClass?: () => void;
  onVisibleRangeChange?: (start: Date, end: Date) => void;
}

export function SimpleCalendar({ 
  classes, 
  availabilityBlocks = [], 
  isProfessor,
  currentUserId, 
  onConfirmClass, 
  onCancelClass,
  onCompleteClass,
  onManageReport,
  onEndRecurrence,
  loading,
  onScheduleClass,
  onVisibleRangeChange
}: SimpleCalendarProps) {
  const { t } = useTranslation('classes');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarClass | AvailabilityBlock | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<{
    date: Date;
    events: CalendarClass[];
    blocks: AvailabilityBlock[];
  } | null>(null);
  const [showEndRecurrenceDialog, setShowEndRecurrenceDialog] = useState(false);
  const [endRecurrenceData, setEndRecurrenceData] = useState<{ templateId: string; endDate: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const DAYS_OF_WEEK = [
    t('daysOfWeek.sun'), 
    t('daysOfWeek.mon'), 
    t('daysOfWeek.tue'), 
    t('daysOfWeek.wed'), 
    t('daysOfWeek.thu'), 
    t('daysOfWeek.fri'), 
    t('daysOfWeek.sat')
  ];
  
  const MONTHS = [
    t('months.january'), t('months.february'), t('months.march'), t('months.april'), 
    t('months.may'), t('months.june'), t('months.july'), t('months.august'), 
    t('months.september'), t('months.october'), t('months.november'), t('months.december')
  ];

  // Gerar os dias do mês atual
  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay());
    
    // Calculate end date (6 weeks of calendar grid)
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 41); // 42 days (6 weeks) - 1
    
    // Notify parent about visible range change
    if (onVisibleRangeChange) {
      onVisibleRangeChange(startDate, endDate);
    }
    
    const days = [];
    const current = new Date(startDate);
    
    for (let i = 0; i < 42; i++) {
      const dayEvents = classes.filter(event => {
        const eventDate = new Date(event.start);
        return eventDate.toDateString() === current.toDateString();
      });
      
      const dayBlocks = availabilityBlocks.filter(block => {
        const blockDate = new Date(block.start);
        return blockDate.toDateString() === current.toDateString();
      });
      
      days.push({
        date: new Date(current),
        events: dayEvents,
        blocks: dayBlocks,
        isCurrentMonth: current.getMonth() === month,
        isToday: current.toDateString() === new Date().toDateString()
      });
      
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  }, [currentDate, classes, availabilityBlocks]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pendente: 'bg-warning text-warning-foreground',
      confirmada: 'bg-primary text-primary-foreground',
      cancelada: 'bg-destructive text-destructive-foreground',
      concluida: 'bg-success text-success-foreground'
    };
    return colors[status as keyof typeof colors] || colors.pendente;
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      pendente: t('status.pending'),
      confirmada: t('status.confirmed'),
      cancelada: t('status.cancelled'),
      concluida: t('status.completed')
    };
    return labels[status as keyof typeof labels] || t('status.pending');
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
      <Card className="shadow-card">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold">
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              {isProfessor && onScheduleClass && (
                <Button onClick={onScheduleClass} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('scheduleNew')}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateMonth('prev')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToToday}
              >
                {t('calendar.today')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateMonth('next')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS_OF_WEEK.map(day => (
              <div key={day} className="p-3 text-center font-semibold text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarData.map((day, index) => (
              <div
                key={index}
                className={cn(
                  "min-h-[120px] p-2 border border-border/20 rounded-lg transition-colors",
                  !day.isCurrentMonth && "opacity-40 bg-muted/20",
                  day.isToday && "bg-primary/5 border-primary/30",
                  day.events.length > 0 && "bg-accent/10"
                )}
              >
                {/* Day number */}
                <div className="flex justify-between items-start mb-2">
                  <span
                    className={cn(
                      "text-sm font-medium w-6 h-6 rounded-full flex items-center justify-center",
                      day.isToday && "bg-primary text-primary-foreground"
                    )}
                  >
                    {day.date.getDate()}
                  </span>
                </div>

                {/* Events */}
                <div className="space-y-1">
                  {day.events.slice(0, 2).map((event, eventIndex) => (
                    <div
                      key={event.id}
                      onClick={() => setSelectedEvent(event)}
                      className={cn(
                        "p-2 rounded text-xs cursor-pointer transition-all hover:scale-105",
                        getStatusColor(event.status)
                      )}
                    >
                      <div className="font-medium truncate">
                        {event.is_group_class 
                          ? t('calendar.groupShort', { count: event.participants?.length || 1 })
                          : event.student.name
                        }
                      </div>
                      <div className="opacity-90">
                        {formatTime(event.start)} - {Math.round((event.end.getTime() - event.start.getTime()) / (1000 * 60))}min
                      </div>
                    </div>
                  ))}
                  
                  {/* Show more indicator */}
                  {day.events.length > 2 && (
                    <div 
                      className="text-xs text-muted-foreground text-center py-1 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => setSelectedDayEvents({
                        date: day.date,
                        events: day.events,
                        blocks: day.blocks
                      })}
                    >
                      {t('calendar.showMore', { count: day.events.length - 2 })}
                    </div>
                  )}

                  {/* Availability blocks */}
                  {day.blocks.map((block, blockIndex) => (
                    <div
                      key={block.id}
                      onClick={() => setSelectedEvent(block)}
                      className="p-1 rounded text-xs bg-muted text-muted-foreground cursor-pointer"
                    >
                      <div className="truncate">{block.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {classes.length === 0 && availabilityBlocks.length === 0 && (
            <div className="text-center py-12">
              <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">{t('calendar.noClassesScheduled')}</h3>
              <p className="text-muted-foreground">
                {isProfessor 
                  ? t('calendar.noClassesCalendar')
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
            <DialogTitle>
              {selectedEvent && 'type' in selectedEvent && selectedEvent.type === 'block' 
                ? t('calendar.blockedTime')
                : t('calendar.eventDetails')
              }
            </DialogTitle>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-6">
              {selectedEvent && 'type' in selectedEvent && selectedEvent.type === 'block' ? (
                // Availability Block Details
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{selectedEvent.title}</span>
                    <Badge variant="secondary">{t('calendar.blocked')}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedEvent.start.toLocaleDateString('pt-BR')}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {formatTime(selectedEvent.start)} - {formatTime(selectedEvent.end)}
                        <span className="text-xs text-muted-foreground ml-2">{t('brasilia_timezone')}</span>
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                // Class Details
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">
                        {(selectedEvent as CalendarClass).is_group_class 
                          ? t('calendar.groupWithCount', { count: (selectedEvent as CalendarClass).participants?.length || 1 })
                          : (selectedEvent as CalendarClass).student.name
                        }
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Badge className={getStatusColor((selectedEvent as CalendarClass).status)}>
                        {getStatusLabel((selectedEvent as CalendarClass).status)}
                      </Badge>
                      {(selectedEvent as CalendarClass).is_experimental && (
                        <Badge variant="outline" className="border-warning text-warning">
                          {t('experimental')}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      <span>{(selectedEvent as CalendarClass).start.toLocaleDateString('pt-BR')}</span>
                    </div>
                    
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {formatTime((selectedEvent as CalendarClass).start)} - {formatTime((selectedEvent as CalendarClass).end)}
                          <span className="text-xs text-muted-foreground ml-2">{t('brasilia_timezone')}</span>
                        </span>
                      </div>
                  </div>

                  {/* Participants */}
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {(selectedEvent as CalendarClass).is_group_class ? t('calendar.participants') : t('calendar.student')}:
                    </p>
                    <div className="space-y-2">
                      {(selectedEvent as CalendarClass).participants?.map((participant, index) => (
                        <div key={index} className="bg-muted p-3 rounded-lg">
                          <div className="font-medium">{participant.student.name}</div>
                          <div className="text-sm text-muted-foreground">{participant.student.email}</div>
                        </div>
                      )) || (
                        <div className="bg-muted p-3 rounded-lg">
                          <div className="font-medium">{(selectedEvent as CalendarClass).student.name}</div>
                          <div className="text-sm text-muted-foreground">{(selectedEvent as CalendarClass).student.email}</div>
            </div>
          )}
                    </div>
                  </div>

                  {(selectedEvent as CalendarClass).notes && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">{t('calendar.notes')}:</p>
                      <p className="text-sm bg-muted p-3 rounded-lg">{(selectedEvent as CalendarClass).notes}</p>
                    </div>
                  )}

                  {/* Class Report Section */}
                  {(() => {
                    const classEvent = selectedEvent as CalendarClass;
                    
                    // Always show report section - ClassReportView handles its own loading/empty states
                    return (
                      <div className="pt-4 border-t">
                        <ClassReportView
                          classId={classEvent.id}
                          onEditReport={() => {
                            if (onManageReport) {
                              onManageReport(classEvent);
                            }
                          }}
                          showEditButton={isProfessor}
                        />
                      </div>
                    );
                  })()}

                  {/* Action Buttons - Redesigned for better UX */}
                  <div className="space-y-4 pt-6">
                    {/* Primary Actions */}
                    <div className="space-y-2">
                      {/* Confirm Button - Only for pending classes */}
                      {isProfessor && (selectedEvent as CalendarClass).status === 'pendente' && onConfirmClass && (
                        <Button
                          onClick={() => {
                            onConfirmClass((selectedEvent as CalendarClass).id);
                            setSelectedEvent(null);
                          }}
                          className="w-full h-12 bg-gradient-success text-base font-semibold"
                          size="lg"
                        >
                          <CheckCircle className="h-5 w-5 mr-2" />
                          {t('actions.confirmClass')}
                        </Button>
                      )}
                      
                      {/* Complete Class Button - Only for confirmed classes */}
                      {isProfessor && (selectedEvent as CalendarClass).status === 'confirmada' && onCompleteClass && (
                        <Button
                          onClick={() => {
                            onCompleteClass(selectedEvent as CalendarClass);
                            setSelectedEvent(null);
                          }}
                          className="w-full h-12 bg-gradient-primary text-base font-semibold"
                          size="lg"
                        >
                          <CheckCircle className="h-5 w-5 mr-2" />
                          {t('actions.markAsCompleted')}
                        </Button>
                      )}
                      
                      {/* Manage Report Button */}
                      {isProfessor && onManageReport && (
                        <Button
                          onClick={() => {
                            onManageReport(selectedEvent as CalendarClass);
                            setSelectedEvent(null);
                          }}
                          variant="outline"
                          className="w-full h-12 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground text-base font-semibold"
                          size="lg"
                        >
                          <FileText className="h-5 w-5 mr-2" />
                          {(selectedEvent as CalendarClass).status === 'concluida' ? t('actions.editReport') : t('actions.createReport')}
                        </Button>
                      )}
                    </div>

                    {/* Secondary Actions - Destructive */}
                    {(
                      (((selectedEvent as CalendarClass).status === 'pendente' || (selectedEvent as CalendarClass).status === 'confirmada') && onCancelClass) ||
                      (isProfessor && onEndRecurrence && (() => {
                        const classEvent = selectedEvent as CalendarClass;
                        const isVirtual = classEvent.isVirtual;
                        const hasTemplate = classEvent.class_template_id;
                        const recurrenceEndDate = (classEvent as any).recurrence_end_date;
                        const isRecurrenceActive = !recurrenceEndDate || new Date(recurrenceEndDate) > new Date();
                        return isVirtual || (hasTemplate && isRecurrenceActive);
                      })())
                    ) && (
                      <div className="pt-2 border-t space-y-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">
                          Ações Secundárias
                        </p>
                        
                        {/* Cancel Button */}
                        {((selectedEvent as CalendarClass).status === 'pendente' || (selectedEvent as CalendarClass).status === 'confirmada') && onCancelClass && (
                          <Button
                            variant="outline"
                            className="w-full h-11 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
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
                        
                        {/* End Recurrence Button */}
                        {isProfessor && onEndRecurrence && (() => {
                          const classEvent = selectedEvent as CalendarClass;
                          const isVirtual = classEvent.isVirtual;
                          const hasTemplate = classEvent.class_template_id;
                          const recurrenceEndDate = (classEvent as any).recurrence_end_date;
                          const isRecurrenceActive = !recurrenceEndDate || new Date(recurrenceEndDate) > new Date();
                          
                          return isVirtual || (hasTemplate && isRecurrenceActive);
                        })() && (
                          <Button
                            variant="destructive"
                            className="w-full h-11"
                            disabled={isProcessing}
                            onClick={() => {
                              const classEvent = selectedEvent as CalendarClass;
                              const templateId = (classEvent as any).class_template_id || classEvent.id.split('_virtual_')[0];
                              const endDate = classEvent.start.toISOString();
                              
                              setEndRecurrenceData({ templateId, endDate });
                              setShowEndRecurrenceDialog(true);
                            }}
                          >
                            {isProcessing ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Processando...
                              </>
                            ) : (
                              <>
                                🛑 <span className="ml-2">Encerrar Recorrência</span>
                              </>
                            )}
                           </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Day Events Modal */}
      <Dialog open={!!selectedDayEvents} onOpenChange={() => setSelectedDayEvents(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('calendar.eventsOf')} {selectedDayEvents?.date.toLocaleDateString('pt-BR')}
            </DialogTitle>
          </DialogHeader>
          
          {selectedDayEvents && (
            <div className="space-y-4">
              {/* All Classes */}
              {selectedDayEvents.events.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 text-lg">{t('calendar.classes')} ({selectedDayEvents.events.length})</h3>
                  <div className="space-y-3">
                    {selectedDayEvents.events.map((event) => (
                      <div
                        key={event.id}
                        onClick={() => {
                          setSelectedEvent(event);
                          setSelectedDayEvents(null);
                        }}
                        className={cn(
                          "p-4 rounded-lg cursor-pointer transition-all hover:scale-[1.02] border",
                          getStatusColor(event.status),
                          "hover:shadow-md"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">
                            {event.is_group_class 
                              ? t('calendar.groupWithCount', { count: event.participants?.length || 1 })
                              : event.student.name
                            }
                          </div>
                          <div className="flex gap-2">
                            <Badge className={cn("text-xs", getStatusColor(event.status))}>
                              {getStatusLabel(event.status)}
                            </Badge>
                            {event.is_experimental && (
                              <Badge variant="outline" className="border-warning text-warning text-xs">
                                {t('experimental')}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm opacity-90">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>
                              {formatTime(event.start)} - {formatTime(event.end)}
                            </span>
                          </div>
                          <div>
                            {Math.round((event.end.getTime() - event.start.getTime()) / (1000 * 60))} {t('calendar.minutes')}
                          </div>
                        </div>

                        {event.notes && (
                          <div className="mt-2 text-sm opacity-80">
                            <span className="font-medium">{t('calendar.note')}:</span> {event.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Availability Blocks */}
              {selectedDayEvents.blocks.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 text-lg">{t('calendar.blockedTimes')} ({selectedDayEvents.blocks.length})</h3>
                  <div className="space-y-3">
                    {selectedDayEvents.blocks.map((block) => (
                      <div
                        key={block.id}
                        onClick={() => {
                          setSelectedEvent(block);
                          setSelectedDayEvents(null);
                        }}
                        className="p-4 rounded-lg cursor-pointer transition-all hover:scale-[1.02] bg-muted text-muted-foreground border hover:shadow-md"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">{block.title}</div>
                          <Badge variant="secondary">{t('calendar.blocked')}</Badge>
                        </div>
                        
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-4 w-4" />
                          <span>
                            {formatTime(block.start)} - {formatTime(block.end)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedDayEvents.events.length === 0 && selectedDayEvents.blocks.length === 0 && (
                <div className="text-center py-8">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">{t('calendar.noEventsThisDay')}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* End Recurrence Confirmation Dialog */}
      <AlertDialog open={showEndRecurrenceDialog} onOpenChange={setShowEndRecurrenceDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🛑 Encerrar Recorrência</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-medium">Tem certeza que deseja encerrar esta série recorrente?</p>
              <p className="text-sm">
                ⚠️ <strong>Atenção:</strong> Todas as aulas futuras <strong>não concluídas</strong> desta série serão permanentemente removidas.
              </p>
              <p className="text-sm text-muted-foreground">
                As aulas já realizadas (concluídas) serão mantidas no histórico.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!endRecurrenceData || !onEndRecurrence) return;
                
                setIsProcessing(true);
                try {
                  await onEndRecurrence(endRecurrenceData.templateId, endRecurrenceData.endDate);
                  setSelectedEvent(null);
                  setShowEndRecurrenceDialog(false);
                } finally {
                  setIsProcessing(false);
                  setEndRecurrenceData(null);
                }
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                'Confirmar Encerramento'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}