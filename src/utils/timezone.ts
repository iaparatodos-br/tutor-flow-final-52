/**
 * Utilitários centralizados de fuso horário para o Tutor Flow.
 *
 * REGRA ARQUITETURAL v3.6:
 * - É PROIBIDO usar funções date-fns nativas que dependem do fuso do browser
 *   (startOfMonth, endOfMonth, startOfDay, isToday, isSameDay, etc.) em
 *   componentes ou edge functions.
 * - Use EXCLUSIVAMENTE os wrappers *Tz exportados por este módulo.
 * - Campos do tipo `date` (sem hora) como `due_date` devem ser tratados com
 *   `parseISO` e NUNCA convertidos via `new Date()` + timeZone.
 */

import { toZonedTime, fromZonedTime, format as formatTz } from 'date-fns-tz';
import {
  startOfDay as dfStartOfDay,
  endOfDay as dfEndOfDay,
  startOfMonth as dfStartOfMonth,
  endOfMonth as dfEndOfMonth,
  startOfWeek as dfStartOfWeek,
  endOfWeek as dfEndOfWeek,
  isSameDay as dfIsSameDay,
  isAfter,
  isBefore,
} from 'date-fns';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Fuso horário padrão do sistema (fallback quando perfil não define). */
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** @deprecated Use DEFAULT_TIMEZONE. Mantido para retrocompatibilidade. */
export const BRAZIL_TIMEZONE = DEFAULT_TIMEZONE;

/** Label legível do fuso padrão (usado em UI quando não há i18n). */
export const TIMEZONE_LABEL = 'Horário de Brasília';

// ---------------------------------------------------------------------------
// Conversões fundamentais
// ---------------------------------------------------------------------------

/**
 * Converte uma data UTC para a representação "zonada" no fuso informado.
 * O objeto Date retornado tem seus campos (getHours, getDate, etc.)
 * refletindo o horário local daquele timezone.
 */
export const toUserZonedTime = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): Date => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return toZonedTime(dateObj, timezone);
};

/**
 * Converte uma data "local" (como digitada num formulário) para UTC,
 * interpretando-a no fuso do utilizador.
 *
 * Exemplo: o utilizador em "America/Sao_Paulo" digita 14:00 →
 * `fromUserZonedTime(new Date('2026-03-03T14:00'), 'America/Sao_Paulo')`
 * retorna o instante UTC correspondente (17:00 UTC).
 */
export const fromUserZonedTime = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): Date => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return fromZonedTime(dateObj, timezone);
};

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

/**
 * Formata uma data para exibição no fuso do utilizador.
 * Aceita qualquer padrão do date-fns (ex: "dd/MM/yyyy HH:mm").
 */
export const formatInTimezone = (
  date: Date | string | number,
  pattern: string,
  timezone: string = DEFAULT_TIMEZONE,
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : (typeof date === 'number' ? new Date(date) : date);
  // Guard against invalid dates to prevent RangeError crashes
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    console.warn('formatInTimezone: received invalid date', String(date));
    return '--';
  }
  return formatTz(toZonedTime(dateObj, timezone), pattern, { timeZone: timezone });
};

/**
 * Formata uma data no fuso informado (dd/MM/yyyy).
 */
export const formatDateBrazil = (
  date: Date | string,
  options?: Intl.DateTimeFormatOptions,
  timezone: string = DEFAULT_TIMEZONE,
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  };

  return dateObj.toLocaleDateString('pt-BR', defaultOptions);
};

/**
 * Formata um horário no fuso informado (HH:mm).
 */
export const formatTimeBrazil = (
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE,
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return dateObj.toLocaleTimeString('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Formata data e hora completa no fuso informado.
 */
export const formatDateTimeBrazil = (
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE,
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return dateObj.toLocaleString('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ---------------------------------------------------------------------------
// "Agora" no fuso do utilizador
// ---------------------------------------------------------------------------

/**
 * Retorna o instante atual representado no fuso do utilizador.
 */
export const nowInTimezone = (timezone: string = DEFAULT_TIMEZONE): Date => {
  return toZonedTime(new Date(), timezone);
};

/** @deprecated Use `nowInTimezone`. */
export const nowInBrazil = (): Date => nowInTimezone(DEFAULT_TIMEZONE);

// ---------------------------------------------------------------------------
// Comparações timezone-aware
// ---------------------------------------------------------------------------

/**
 * Verifica se uma data está no passado considerando o fuso do utilizador.
 */
export const isPastInTimezone = (
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE,
): boolean => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const zonedNow = toZonedTime(new Date(), timezone);
  const zonedDate = toZonedTime(dateObj, timezone);
  return isBefore(zonedDate, zonedNow);
};

/** @deprecated Use `isPastInTimezone`. */
export const isPastInBrazil = (date: Date | string): boolean =>
  isPastInTimezone(date, DEFAULT_TIMEZONE);

/**
 * Verifica se uma data está no futuro considerando o fuso do utilizador.
 */
export const isFutureInTimezone = (
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE,
): boolean => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const zonedNow = toZonedTime(new Date(), timezone);
  const zonedDate = toZonedTime(dateObj, timezone);
  return isAfter(zonedDate, zonedNow);
};

// ---------------------------------------------------------------------------
// Wrappers timezone-aware para funções date-fns
// ---------------------------------------------------------------------------

/**
 * Retorna o início do dia no fuso do utilizador.
 */
export const startOfDayTz = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): Date => {
  const zoned = toZonedTime(typeof date === 'string' ? new Date(date) : date, timezone);
  return dfStartOfDay(zoned);
};

/**
 * Retorna o fim do dia no fuso do utilizador.
 */
export const endOfDayTz = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): Date => {
  const zoned = toZonedTime(typeof date === 'string' ? new Date(date) : date, timezone);
  return dfEndOfDay(zoned);
};

/**
 * Retorna o início do mês no fuso do utilizador.
 */
export const startOfMonthTz = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): Date => {
  const zoned = toZonedTime(typeof date === 'string' ? new Date(date) : date, timezone);
  return dfStartOfMonth(zoned);
};

/**
 * Retorna o fim do mês no fuso do utilizador.
 */
export const endOfMonthTz = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): Date => {
  const zoned = toZonedTime(typeof date === 'string' ? new Date(date) : date, timezone);
  return dfEndOfMonth(zoned);
};

/**
 * Retorna o início da semana no fuso do utilizador.
 */
export const startOfWeekTz = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
  options?: { weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 },
): Date => {
  const zoned = toZonedTime(typeof date === 'string' ? new Date(date) : date, timezone);
  return dfStartOfWeek(zoned, options);
};

/**
 * Retorna o fim da semana no fuso do utilizador.
 */
export const endOfWeekTz = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
  options?: { weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 },
): Date => {
  const zoned = toZonedTime(typeof date === 'string' ? new Date(date) : date, timezone);
  return dfEndOfWeek(zoned, options);
};

/**
 * Verifica se a data informada é "hoje" no fuso do utilizador.
 */
export const isTodayTz = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): boolean => {
  const zonedNow = toZonedTime(new Date(), timezone);
  const zonedDate = toZonedTime(typeof date === 'string' ? new Date(date) : date, timezone);
  return dfStartOfDay(zonedNow).getTime() === dfStartOfDay(zonedDate).getTime();
};

/**
 * Verifica se duas datas caem no mesmo dia no fuso do utilizador.
 */
export const isSameDayTz = (
  dateLeft: Date | string | number,
  dateRight: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): boolean => {
  const zonedLeft = toZonedTime(typeof dateLeft === 'string' ? new Date(dateLeft) : dateLeft, timezone);
  const zonedRight = toZonedTime(typeof dateRight === 'string' ? new Date(dateRight) : dateRight, timezone);
  return dfIsSameDay(zonedLeft, zonedRight);
};

// ---------------------------------------------------------------------------
// Utilitário para "hoje local" em edge functions (Intl-based, sem date-fns)
// ---------------------------------------------------------------------------

/**
 * Retorna a data calendária "hoje" no fuso informado como string YYYY-MM-DD.
 * Útil em edge functions para campos do tipo `date` (due_date, etc.).
 */
export const todayDateString = (timezone: string = DEFAULT_TIMEZONE): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()); // retorna "YYYY-MM-DD"
};
