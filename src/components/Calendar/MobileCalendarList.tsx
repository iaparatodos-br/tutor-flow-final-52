import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Clock, User, Calendar as CalendarIcon, Baby, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarClass, AvailabilityBlock } from './CalendarView';
import { useTranslation } from 'react-i18next';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isToday, 
  isSameMonth,
  addMonths,
  subMonths,
  isBefore,
  isAfter,
  startOfDay
} from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

interface MobileCalendarListProps {
  classes: CalendarClass[];
  availabilityBlocks?: AvailabilityBlock[];
  isProfessor: boolean;
  currentDate: Date;
  onNavigateMonth: (direction: 'prev' | 'next') => void;
  onGoToToday: () => void;
  onEventClick: (event: CalendarClass | AvailabilityBlock) => void;
  onScheduleClass?: () => void;
  loading?: boolean;
  highlightedClassId?: string | null;
}

export function MobileCalendarList({
  classes,
  availabilityBlocks = [],
  isProfessor,
  currentDate,
  onNavigateMonth,
  onGoToToday,
  onEventClick,
  onScheduleClass,
  loading,
  highlightedClassId
}: MobileCalendarListProps) {
  const { t, i18n } = useTranslation('classes');
  const locale = i18n.language === 'pt' ? ptBR : enUS;

  // Agrupar eventos por data
  const eventsByDate = useMemo(() => {
    const map = new Map<string, { 
      events: CalendarClass[]; 
      blocks: AvailabilityBlock[] 
    }>();
    
    classes.forEach(event => {
      const key = format(event.start, 'yyyy-MM-dd');
      if (!map.has(key)) {
        map.set(key, { events: [], blocks: [] });
      }
      map.get(key)!.events.push(event);
    });
    
    availabilityBlocks.forEach(block => {
      const key = format(block.start, 'yyyy-MM-dd');
      if (!map.has(key)) {
        map.set(key, { events: [], blocks: [] });
      }
      map.get(key)!.blocks.push(block);
    });
    
    return map;
  }, [classes, availabilityBlocks]);

  // Obter dias do mês com eventos
  const daysWithEvents = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const today = startOfDay(new Date());
    
    // Pegar todos os dias do mês
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // Filtrar apenas dias com eventos ou a partir de hoje
    const relevantDays = allDays.filter(day => {
      const key = format(day, 'yyyy-MM-dd');
      const hasEvents = eventsByDate.has(key);
      const isTodayOrFuture = !isBefore(day, today);
      
      // Mostrar dia se tem eventos OU se é hoje/futuro
      return hasEvents || (isTodayOrFuture && isToday(day));
    });

    // Se não há eventos relevantes, retornar pelo menos hoje se estiver no mês
    if (relevantDays.length === 0 && isSameMonth(today, currentDate)) {
      return [today];
    }

    return relevantDays.sort((a, b) => a.getTime() - b.getTime());
  }, [currentDate, eventsByDate]);

  const getStatusColor = (status: string) => {
    const colors = {
      pendente: 'bg-warning text-warning-foreground',
      confirmada: 'bg-primary text-primary-foreground',
      cancelada: 'bg-destructive text-destructive-foreground',
      concluida: 'bg-success text-success-foreground',
      aguardando_pagamento: 'bg-orange-500 text-white'
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

  const getDisplayName = (event: CalendarClass): { name: string; isDependent: boolean; responsibleName?: string } => {
    if (event.is_group_class) {
      return { 
        name: t('calendar.groupWithCount', { count: event.participants?.length || 1 }), 
        isDependent: false 
      };
    }
    
    const firstParticipant = event.participants?.[0];
    if (firstParticipant?.dependent_id && firstParticipant?.dependent_name) {
      return { 
        name: firstParticipant.dependent_name, 
        isDependent: true,
        responsibleName: firstParticipant.profiles?.name || event.student?.name
      };
    }
    
    return { 
      name: event.student?.name || 'Nome não disponível', 
      isDependent: false 
    };
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDayHeader = (date: Date) => {
    if (isToday(date)) {
      return i18n.language === 'pt' ? 'HOJE' : 'TODAY';
    }
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (format(date, 'yyyy-MM-dd') === format(tomorrow, 'yyyy-MM-dd')) {
      return i18n.language === 'pt' ? 'AMANHÃ' : 'TOMORROW';
    }
    
    return format(date, 'EEEE', { locale }).toUpperCase();
  };

  const monthYearLabel = format(currentDate, 'MMMM yyyy', { locale });

  if (loading) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="text-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
            <p className="text-muted-foreground text-sm">{t('calendar.loadingCalendar')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Mobile */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            {/* Navegação do mês */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onNavigateMonth('prev')}
                className="h-10 w-10"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              
              <h2 className="text-lg font-bold capitalize text-center">
                {monthYearLabel}
              </h2>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onNavigateMonth('next')}
                className="h-10 w-10"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Botões de ação */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onGoToToday}
                className="flex-1"
              >
                {t('calendar.today')}
              </Button>
              
              {isProfessor && onScheduleClass && (
                <Button 
                  onClick={onScheduleClass} 
                  size="sm"
                  className="flex-1"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('scheduleNew')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Eventos */}
      <div className="space-y-3">
        {daysWithEvents.length === 0 && classes.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="py-12">
              <div className="text-center">
                <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">{t('calendar.noClassesScheduled')}</h3>
                <p className="text-muted-foreground text-sm">
                  {isProfessor 
                    ? t('calendar.noClassesCalendar')
                    : t('calendar.noClassesStudent')
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          daysWithEvents.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const dayData = eventsByDate.get(key);
            const events = dayData?.events || [];
            const blocks = dayData?.blocks || [];

            // Se não tem eventos nem blocos, pular
            if (events.length === 0 && blocks.length === 0 && !isToday(day)) {
              return null;
            }

            return (
              <div key={key} className="space-y-2">
                {/* Day Header */}
                <div className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-lg",
                  isToday(day) && "bg-primary/10"
                )}>
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg",
                    isToday(day) 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted text-muted-foreground"
                  )}>
                    {format(day, 'd')}
                  </div>
                  <div>
                    <div className={cn(
                      "text-xs font-semibold uppercase tracking-wide",
                      isToday(day) ? "text-primary" : "text-muted-foreground"
                    )}>
                      {formatDayHeader(day)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(day, 'd MMMM', { locale })}
                    </div>
                  </div>
                </div>

                {/* Events for this day */}
                {events.length > 0 ? (
                  <div className="space-y-2 pl-2">
                    {events.map(event => {
                      const displayInfo = getDisplayName(event);
                      const duration = Math.round((event.end.getTime() - event.start.getTime()) / (1000 * 60));
                      
                      return (
                        <Card 
                          key={event.id}
                          className={cn(
                            "shadow-sm cursor-pointer active:scale-[0.98] transition-transform",
                            highlightedClassId && event.id === highlightedClassId && "ring-2 ring-primary animate-pulse"
                          )}
                          onClick={() => onEventClick(event)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                {/* Nome do aluno */}
                                <div className="flex items-center gap-1.5 mb-1">
                                  {displayInfo.isDependent && (
                                    <Baby className="h-4 w-4 text-purple-600 flex-shrink-0" />
                                  )}
                                  <span className="font-medium truncate">
                                    {displayInfo.name}
                                  </span>
                                </div>
                                
                                {/* Responsável (se dependente) */}
                                {displayInfo.isDependent && displayInfo.responsibleName && (
                                  <div className="text-xs text-muted-foreground mb-1">
                                    Resp: {displayInfo.responsibleName}
                                  </div>
                                )}
                                
                                {/* Horário */}
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>
                                    {formatTime(event.start)} - {formatTime(event.end)}
                                  </span>
                                  <span className="text-xs">({duration}min)</span>
                                </div>
                              </div>

                              {/* Status Badge */}
                              <div className="flex flex-col gap-1 items-end">
                                <Badge className={cn("text-xs", getStatusColor(event.status))}>
                                  {getStatusLabel(event.status)}
                                </Badge>
                                {event.is_experimental && (
                                  <Badge variant="outline" className="text-xs border-warning text-warning">
                                    {t('experimental')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : isToday(day) ? (
                  <div className="pl-2">
                    <Card className="shadow-sm bg-muted/30">
                      <CardContent className="p-3 text-center">
                        <p className="text-sm text-muted-foreground">
                          {t('calendar.noEventsThisDay')}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                ) : null}

                {/* Availability Blocks */}
                {blocks.length > 0 && (
                  <div className="space-y-2 pl-2">
                    {blocks.map(block => (
                      <Card 
                        key={block.id}
                        className="shadow-sm cursor-pointer active:scale-[0.98] transition-transform bg-muted/50"
                        onClick={() => onEventClick(block)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-muted-foreground text-sm">
                                {block.title}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {formatTime(block.start)} - {formatTime(block.end)}
                                </span>
                              </div>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {t('calendar.blocked')}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
