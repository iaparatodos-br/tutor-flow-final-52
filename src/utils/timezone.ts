/**
 * Utilitários para trabalhar com fuso horário de Brasília (UTC-3)
 * Todo o sistema opera no horário de Brasília
 */

export const BRAZIL_TIMEZONE = 'America/Sao_Paulo';
export const TIMEZONE_LABEL = 'Horário de Brasília';

/**
 * Formata uma data para o horário de Brasília
 */
export const formatDateBrazil = (date: Date | string, options?: Intl.DateTimeFormatOptions): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: BRAZIL_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options
  };
  
  return dateObj.toLocaleDateString('pt-BR', defaultOptions);
};

/**
 * Formata um horário para o fuso horário de Brasília
 */
export const formatTimeBrazil = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return dateObj.toLocaleTimeString('pt-BR', {
    timeZone: BRAZIL_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Formata data e hora completa para o horário de Brasília
 */
export const formatDateTimeBrazil = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return dateObj.toLocaleString('pt-BR', {
    timeZone: BRAZIL_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Obtém a data/hora atual no fuso horário de Brasília
 */
export const nowInBrazil = (): Date => {
  return new Date();
};

/**
 * Verifica se uma data/hora está no passado considerando o fuso horário de Brasília
 */
export const isPastInBrazil = (date: Date | string): boolean => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = nowInBrazil();
  
  return dateObj < now;
};