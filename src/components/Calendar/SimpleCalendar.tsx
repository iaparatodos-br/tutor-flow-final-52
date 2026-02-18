import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose
} from '@/components/ui/drawer';
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
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, CheckCircle, X, FileText, Plus, Loader2, Baby } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarClass, AvailabilityBlock } from './CalendarView';
import { ClassReportView } from '@/components/ClassReportView';
import { AmnestyButton } from '@/components/AmnestyButton';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileCalendarList } from './MobileCalendarList';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SimpleCalendarProps {
  classes: CalendarClass[];
  availabilityBlocks?: AvailabilityBlock[];
  isProfessor: boolean;
  currentUserId?: string;
  onConfirmClass?: (classId: string, isPaidClass: boolean) => void;
  onCancelClass?: (classId: string, className: string, classDate: string) => void;
  onCompleteClass?: (classData: CalendarClass) => void;
  onManageReport?: (classData: CalendarClass) => void;
  onEditReport?: (classData: CalendarClass) => void;
  onEndRecurrence?: (templateId: string, endDate: string) => void;
  loading?: boolean;
  onScheduleClass?: () => void;
  onVisibleRangeChange?: (start: Date, end: Date) => void;
  highlightedClassId?: string | null;
  initialDate?: Date | null;
  onAmnestyGranted?: () => void;
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
  onEditReport,
  onEndRecurrence,
  loading,
  onScheduleClass,
  onVisibleRangeChange,
  highlightedClassId,
  initialDate,
  onAmnestyGranted
}: SimpleCalendarProps) {
  const { t } = useTranslation('classes');
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(initialDate ?? new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarClass | AvailabilityBlock | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<{
    date: Date;
    events: CalendarClass[];
    blocks: AvailabilityBlock[];
  } | null>(null);
  const [showEndRecurrenceDialog, setShowEndRecurrenceDialog] = useState(false);
  const [endRecurrenceData, setEndRecurrenceData] = useState<{ templateId: string; endDate: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Confirm class dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmClassId, setConfirmClassId] = useState<string | null>(null);
  const [confirmIsPaidClass, setConfirmIsPaidClass] = useState(true);

  // Reagir a mudanças no initialDate (para deep-links)
  useEffect(() => {
    if (initialDate) {
      setCurrentDate(initialDate);
    }
  }, [initialDate]);

  // ✅ OTIMIZAÇÃO FASE 2.2: Memoizar callbacks para prevenir re-criações
  const handleEventClick = useCallback((event: CalendarClass | AvailabilityBlock) => {
    setSelectedEvent(event);
  }, []);

  const handleDayEventsClick = useCallback((
    date: Date, 
    events: CalendarClass[], 
    blocks: AvailabilityBlock[]
  ) => {
    setSelectedDayEvents({ date, events, blocks });
  }, []);

  // Helper para comparar apenas datas (sem horas)
  const isSameOrBeforeDate = (date1: Date, date2: Date): boolean => {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return d1 <= d2;
  };

  // Helper para obter nome do aluno/dependente corretamente
  const getDisplayName = (event: CalendarClass): { name: string; isDependent: boolean; responsibleName?: string } => {
    // Para aulas em grupo, retorna o texto de grupo
    if (event.is_group_class) {
      return { 
        name: t('calendar.groupWithCount', { count: event.participants?.length || 1 }), 
        isDependent: false 
      };
    }
    
    // Verificar se o primeiro participante é um dependente
    const firstParticipant = event.participants?.[0];
    if (firstParticipant?.dependent_id && firstParticipant?.dependent_name) {
      return { 
        name: firstParticipant.dependent_name, 
        isDependent: true,
        responsibleName: firstParticipant.profiles?.name || event.student?.name
      };
    }
    
    // Caso padrão: usar nome do student
    return { 
      name: event.student?.name || 'Nome não disponível', 
      isDependent: false 
    };
  };

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

  // ✅ OTIMIZAÇÃO FASE 2.1: Memoizar mapeamento de eventos por data
  const eventsByDate = useMemo(() => {
    const map = new Map<string, { 
      events: CalendarClass[]; 
      blocks: AvailabilityBlock[] 
    }>();
    
    // Pré-processar eventos
    classes.forEach(event => {
      const key = new Date(event.start).toDateString();
      if (!map.has(key)) {
        map.set(key, { events: [], blocks: [] });
      }
      map.get(key)!.events.push(event);
    });
    
    // Pré-processar blocos
    availabilityBlocks.forEach(block => {
      const key = new Date(block.start).toDateString();
      if (!map.has(key)) {
        map.set(key, { events: [], blocks: [] });
      }
      map.get(key)!.blocks.push(block);
    });
    
    return map;
  }, [classes, availabilityBlocks]);

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
      const key = current.toDateString();
      const dayData = eventsByDate.get(key) || { events: [], blocks: [] };
      
      days.push({
        date: new Date(current),
        events: dayData.events,
        blocks: dayData.blocks,
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
      concluida: 'bg-success text-success-foreground',
      aguardando_pagamento: 'bg-amber-500 text-white'
    };
    return colors[status as keyof typeof colors] || colors.pendente;
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      pendente: t('status.pending'),
      confirmada: t('status.confirmed'),
      cancelada: t('status.cancelled'),
      concluida: t('status.completed'),
      aguardando_pagamento: t('status.awaitingPayment')
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

  // Conteúdo dos modais - usado tanto em Dialog quanto Drawer
  const renderEventDetails = () => {
    if (!selectedEvent) return null;

    return (
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
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                {(() => {
                  const displayInfo = getDisplayName(selectedEvent as CalendarClass);
                  return (
                    <span className="font-medium flex items-center gap-1.5">
                      {displayInfo.isDependent && <Baby className="h-4 w-4 text-purple-600" />}
                      <span>{displayInfo.name}</span>
                      {displayInfo.isDependent && displayInfo.responsibleName && (
                        <span className="text-sm text-muted-foreground font-normal ml-1">
                          (Resp: {displayInfo.responsibleName})
                        </span>
                      )}
                    </span>
                  );
                })()}
              </div>
              <div className="flex gap-2 flex-wrap">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                {(selectedEvent as CalendarClass).participants?.map((participant, index) => {
                  const isCancelled = participant.status === 'cancelada' || participant.status === 'removida';
                  
                  return (
                    <div 
                      key={index} 
                      className={cn(
                        "p-3 rounded-lg flex items-center justify-between",
                        isCancelled ? "bg-destructive/10 line-through opacity-60" : "bg-muted"
                      )}
                    >
                      <div className="min-w-0">
                        <div className={cn("font-medium flex items-center gap-1.5 truncate", isCancelled && "text-destructive")}>
                          {participant.dependent_id && participant.dependent_name && (
                            <Baby className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
                          )}
                          <span className="truncate">
                            {participant.dependent_id && participant.dependent_name 
                              ? participant.dependent_name 
                              : (participant.profiles?.name || participant.student?.name || 'Nome não disponível')}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {participant.dependent_id && participant.dependent_name 
                            ? `(Resp: ${participant.profiles?.name || participant.student?.name})`
                            : (participant.profiles?.email || participant.student?.email || '')}
                        </div>
                      </div>
                      
                      {/* Status Badge */}
                      <div className="flex-shrink-0 ml-2">
                        {isCancelled && (
                          <Badge variant="destructive" className="text-xs">
                            {t('status.cancelled')}
                          </Badge>
                        )}
                        {participant.status === 'confirmada' && (
                          <Badge variant="default" className="text-xs">
                            {t('status.confirmed')}
                          </Badge>
                        )}
                        {participant.status === 'concluida' && (
                          <Badge variant="outline" className="text-xs">
                            {t('status.completed')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                }) || (
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
              
              // Don't show report section for virtual classes
              if (classEvent.id?.includes('_virtual_')) {
                return null;
              }
              
              return (
                <div className="pt-4 border-t">
                  <ClassReportView
                    classId={classEvent.id}
                    onEditReport={() => {
                      setSelectedEvent(null);
                      if (onEditReport) {
                        onEditReport(classEvent);
                      }
                    }}
                    showEditButton={isProfessor}
                  />
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="space-y-4 pt-6">
              {/* Primary Actions */}
              <div className="space-y-2">
                {/* Confirm Button */}
                {isProfessor && (selectedEvent as CalendarClass).status === 'pendente' && onConfirmClass && (
                  <Button
                    onClick={() => {
                      setConfirmClassId((selectedEvent as CalendarClass).id);
                      setConfirmIsPaidClass(true);
                      setShowConfirmDialog(true);
                      setSelectedEvent(null);
                    }}
                    className="w-full h-12 bg-gradient-success text-base font-semibold"
                    size="lg"
                  >
                    <CheckCircle className="h-5 w-5 mr-2" />
                    {t('actions.confirmClass')}
                  </Button>
                )}
                
                {/* Complete Class Button */}
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
                
                {/* Create Report Button */}
                {isProfessor && onManageReport && !(selectedEvent as CalendarClass).has_report && (
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
                    {t('actions.createReport')}
                  </Button>
                )}
              </div>

              {/* Secondary Actions */}
              {(
                (((selectedEvent as CalendarClass).status === 'pendente' || (selectedEvent as CalendarClass).status === 'confirmada' || (selectedEvent as CalendarClass).status === 'aguardando_pagamento') && onCancelClass) ||
                (isProfessor && onEndRecurrence && (() => {
                  const classEvent = selectedEvent as CalendarClass;
                  const isVirtual = classEvent.isVirtual;
                  const hasTemplate = classEvent.class_template_id;
                  const recurrenceEndDate = (classEvent as any).recurrence_end_date;
                  const isRecurrenceActive = !recurrenceEndDate;
                  
                  return isVirtual || (hasTemplate && isRecurrenceActive);
                })())
              ) && (
                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">
                    Ações Secundárias
                  </p>
                  
                {/* Cancel Button */}
                  {((selectedEvent as CalendarClass).status === 'pendente' || (selectedEvent as CalendarClass).status === 'confirmada' || (selectedEvent as CalendarClass).status === 'aguardando_pagamento') && onCancelClass && (
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
                    const isRecurrenceActive = !recurrenceEndDate;
                    
                    return (isVirtual || hasTemplate) && isRecurrenceActive;
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
              
              {/* Amnesty Section - for cancelled classes with pending charge */}
              {(() => {
                const classEvent = selectedEvent as CalendarClass;
                // Check if class-level charge is applied OR if any participant has charge_applied
                const hasClassCharge = classEvent.charge_applied === true;
                const hasParticipantCharge = classEvent.participants?.some(
                  (p: any) => p.charge_applied === true && (p.status === 'cancelada' || p.status === 'removida')
                );
                const hasAnyCharge = hasClassCharge || hasParticipantCharge;
                const canGrantAmnesty = isProfessor && 
                  classEvent.status === 'cancelada' && 
                  hasAnyCharge && 
                  classEvent.amnesty_granted !== true;
                
                return canGrantAmnesty ? (
                  <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">
                      {t('actions.chargeManagement', 'Gestão de Cobrança')}
                    </p>
                    <AmnestyButton
                      classId={classEvent.id}
                      studentName={getDisplayName(classEvent).name}
                      onAmnestyGranted={() => {
                        setSelectedEvent(null);
                        onAmnestyGranted?.();
                      }}
                    />
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile: Lista vertical / Desktop: Grid tradicional */}
      {isMobile ? (
        <MobileCalendarList
          classes={classes}
          availabilityBlocks={availabilityBlocks}
          isProfessor={isProfessor}
          currentDate={currentDate}
          onNavigateMonth={navigateMonth}
          onGoToToday={goToToday}
          onEventClick={handleEventClick}
          onScheduleClass={onScheduleClass}
          loading={loading}
          highlightedClassId={highlightedClassId}
        />
      ) : (
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
                      onClick={() => handleEventClick(event)}
                      className={cn(
                        "p-2 rounded text-xs cursor-pointer transition-all hover:scale-105",
                        getStatusColor(event.status),
                        highlightedClassId && event.id === highlightedClassId && "ring-2 ring-primary animate-pulse"
                      )}
                    >
                    <div className="font-medium truncate flex items-center gap-1">
                        {(() => {
                          const displayInfo = getDisplayName(event);
                          return (
                            <>
                              {displayInfo.isDependent && <Baby className="h-3 w-3 flex-shrink-0 text-purple-600" />}
                              <span>{event.is_group_class ? t('calendar.groupShort', { count: event.participants?.length || 1 }) : displayInfo.name}</span>
                            </>
                          );
                        })()}
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
                      onClick={() => handleDayEventsClick(day.date, day.events, day.blocks)}
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
      )}

      {/* Event Details Modal - Usar Drawer em mobile, Dialog em desktop */}
      {isMobile ? (
        <Drawer open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="pb-2">
              <DrawerTitle>
                {selectedEvent && 'type' in selectedEvent && selectedEvent.type === 'block' 
                  ? t('calendar.blockedTime')
                  : t('calendar.eventDetails')
                }
              </DrawerTitle>
            </DrawerHeader>
            <ScrollArea className="px-4 pb-6 max-h-[70vh]">
              {renderEventDetails()}
            </ScrollArea>
          </DrawerContent>
        </Drawer>
      ) : (
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
            {renderEventDetails()}
          </DialogContent>
        </Dialog>
      )}

      {/* Day Events Modal - Também adaptar para mobile */}
      {isMobile ? (
        <Drawer open={!!selectedDayEvents} onOpenChange={() => setSelectedDayEvents(null)}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="pb-2">
              <DrawerTitle>
                {t('calendar.eventsOf')} {selectedDayEvents?.date.toLocaleDateString('pt-BR')}
              </DrawerTitle>
            </DrawerHeader>
            <ScrollArea className="px-4 pb-6 max-h-[70vh]">
              {selectedDayEvents && (
                <div className="space-y-4">
                  {/* All Classes */}
                  {selectedDayEvents.events.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3">{t('calendar.classes')} ({selectedDayEvents.events.length})</h3>
                      <div className="space-y-2">
                        {selectedDayEvents.events.map((event) => (
                          <div
                            key={event.id}
                            onClick={() => {
                              setSelectedEvent(event);
                              setSelectedDayEvents(null);
                            }}
                            className={cn(
                              "p-3 rounded-lg cursor-pointer transition-all active:scale-[0.98]",
                              getStatusColor(event.status),
                            )}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-medium flex items-center gap-1.5 text-sm">
                                {(() => {
                                  const displayInfo = getDisplayName(event);
                                  return (
                                    <>
                                      {displayInfo.isDependent && <Baby className="h-3.5 w-3.5 text-purple-600" />}
                                      <span className="truncate">{displayInfo.name}</span>
                                    </>
                                  );
                                })()}
                              </div>
                              <Badge className={cn("text-xs", getStatusColor(event.status))}>
                                {getStatusLabel(event.status)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 text-xs opacity-90">
                              <Clock className="h-3 w-3" />
                              <span>{formatTime(event.start)} - {formatTime(event.end)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Availability Blocks */}
                  {selectedDayEvents.blocks.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3">{t('calendar.blockedTimes')} ({selectedDayEvents.blocks.length})</h3>
                      <div className="space-y-2">
                        {selectedDayEvents.blocks.map((block) => (
                          <div
                            key={block.id}
                            onClick={() => {
                              setSelectedEvent(block);
                              setSelectedDayEvents(null);
                            }}
                            className="p-3 rounded-lg cursor-pointer transition-all active:scale-[0.98] bg-muted text-muted-foreground"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-medium text-sm">{block.title}</div>
                              <Badge variant="secondary" className="text-xs">{t('calendar.blocked')}</Badge>
                            </div>
                            <div className="flex items-center gap-1 text-xs">
                              <Clock className="h-3 w-3" />
                              <span>{formatTime(block.start)} - {formatTime(block.end)}</span>
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
            </ScrollArea>
          </DrawerContent>
        </Drawer>
      ) : (
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
                            <div className="font-medium flex items-center gap-1.5">
                              {(() => {
                                const displayInfo = getDisplayName(event);
                                return (
                                  <>
                                    {displayInfo.isDependent && <Baby className="h-4 w-4 text-purple-600" />}
                                    <span>{displayInfo.name}</span>
                                    {displayInfo.isDependent && displayInfo.responsibleName && (
                                      <span className="text-sm text-muted-foreground font-normal ml-1">
                                        (Resp: {displayInfo.responsibleName})
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
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
      )}

      {/* End Recurrence Confirmation Dialog */}
      <AlertDialog open={showEndRecurrenceDialog} onOpenChange={setShowEndRecurrenceDialog}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-lg">
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
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={isProcessing} className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isProcessing}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
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

      {/* Confirm Class Dialog with Paid Class option */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('actions.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('actions.confirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center justify-between py-4">
            <div className="space-y-0.5">
              <Label htmlFor="confirm-paid-class" className="text-sm font-medium">
                {t('actions.isPaidClass')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('actions.isPaidClassDescription')}
              </p>
            </div>
            <Switch
              id="confirm-paid-class"
              checked={confirmIsPaidClass}
              onCheckedChange={setConfirmIsPaidClass}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowConfirmDialog(false);
              setConfirmClassId(null);
            }}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmClassId && onConfirmClass) {
                  onConfirmClass(confirmClassId, confirmIsPaidClass);
                }
                setShowConfirmDialog(false);
                setConfirmClassId(null);
              }}
            >
              {t('actions.confirmClass')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}