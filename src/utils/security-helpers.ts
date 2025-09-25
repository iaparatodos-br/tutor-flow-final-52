/**
 * Utilitários de Segurança para Contexto de Professores
 * 
 * Funções auxiliares para validação, auditoria e monitoramento
 * de segurança em páginas do aluno
 */

import { supabase } from '@/integrations/supabase/client';

export interface SecurityContext {
  teacherId: string;
  studentId: string;
  pageName: string;
  resourceType: string;
}

export interface DataValidationResult {
  isValid: boolean;
  violations: string[];
  validatedCount: number;
  totalCount: number;
}

/**
 * Valida se todos os dados retornados pertencem ao contexto correto
 */
export const validateDataIntegrity = (
  data: any[], 
  expectedTeacherId: string
): DataValidationResult => {
  if (!data || data.length === 0) {
    return {
      isValid: true,
      violations: [],
      validatedCount: 0,
      totalCount: 0
    };
  }

  const violations: string[] = [];
  let validatedCount = 0;

  data.forEach((item, index) => {
    if (item.teacher_id && item.teacher_id !== expectedTeacherId) {
      violations.push(
        `Item ${index}: teacher_id "${item.teacher_id}" não corresponde ao contexto "${expectedTeacherId}"`
      );
    } else if (item.teacher_id === expectedTeacherId) {
      validatedCount++;
    }
  });

  return {
    isValid: violations.length === 0,
    violations,
    validatedCount,
    totalCount: data.length
  };
};

/**
 * Cria uma query segura com filtro automático de professor
 */
export const createSecureQuery = (
  table: string,
  teacherId: string,
  selectClause: string = '*'
) => {
  if (!teacherId) {
    throw new Error('Teacher context is required for secure queries');
  }

  return (supabase as any)
    .from(table)
    .select(selectClause)
    .eq('teacher_id', teacherId);
};

/**
 * Wrapper para queries com validação automática
 */
export const executeSecureQuery = async <T = any>(
  table: string,
  teacherId: string,
  selectClause: string = '*',
  additionalFilters?: (query: any) => any
): Promise<{ data: T[] | null; error: any; validation: DataValidationResult }> => {
  try {
    let query = createSecureQuery(table, teacherId, selectClause);
    
    if (additionalFilters) {
      query = additionalFilters(query);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error, validation: { isValid: false, violations: [error.message], validatedCount: 0, totalCount: 0 } };
    }

    const validation = validateDataIntegrity(data || [], teacherId);

    if (!validation.isValid) {
      // Log de segurança para violações
      await logSecurityViolation({
        type: 'DATA_INTEGRITY_VIOLATION',
        table,
        teacherId,
        violations: validation.violations,
        totalRecords: validation.totalCount
      });
    }

    return { data: data as T[] | null, error: null, validation };
  } catch (error) {
    return {
      data: null,
      error,
      validation: {
        isValid: false,
        violations: [error instanceof Error ? error.message : 'Unknown error'],
        validatedCount: 0,
        totalCount: 0
      }
    };
  }
};

/**
 * Valida relacionamento professor-aluno
 */
export const validateTeacherStudentRelationship = async (
  teacherId: string,
  studentId: string
): Promise<{ isValid: boolean; relationship?: any; error?: string }> => {
  try {
    const { data: relationship, error } = await supabase
      .from('teacher_student_relationships')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('student_id', studentId)
      .single();

    if (error || !relationship) {
      return {
        isValid: false,
        error: 'Relacionamento professor-aluno não encontrado'
      };
    }

    return {
      isValid: true,
      relationship
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Erro na validação do relacionamento'
    };
  }
};

/**
 * Verifica se o professor tem acesso ao módulo financeiro
 */
export const validateFinancialAccess = async (teacherId: string): Promise<boolean> => {
  try {
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select(`
        *,
        subscription_plans!inner(features)
      `)
      .eq('user_id', teacherId)
      .eq('status', 'active')
      .single();

    const features = subscription?.subscription_plans?.features as any;
    return features?.financial_module === true;
  } catch (error) {
    console.error('Error validating financial access:', error);
    return false;
  }
};

/**
 * Registra evento de auditoria de segurança
 */
export const logSecurityEvent = async (
  action: string,
  context: SecurityContext,
  details?: Record<string, any>
) => {
  try {
    await supabase.functions.invoke('audit-logger', {
      body: {
        action,
        resource_type: context.resourceType,
        resource_id: context.teacherId,
        details: {
          page_name: context.pageName,
          teacher_context: context.teacherId,
          student_context: context.studentId,
          timestamp: new Date().toISOString(),
          ...details
        }
      }
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
};

/**
 * Registra violação de segurança
 */
export const logSecurityViolation = async (violation: {
  type: string;
  table?: string;
  teacherId: string;
  violations: string[];
  totalRecords: number;
  additionalData?: Record<string, any>;
}) => {
  try {
    await supabase.functions.invoke('audit-logger', {
      body: {
        action: 'SECURITY_VIOLATION',
        resource_type: violation.table || 'unknown',
        resource_id: violation.teacherId,
        details: {
          violation_type: violation.type,
          violations: violation.violations,
          total_records: violation.totalRecords,
          timestamp: new Date().toISOString(),
          ...violation.additionalData
        }
      }
    });

    // Log no console para desenvolvimento
    console.error('Security Violation Detected:', violation);
  } catch (error) {
    console.error('Failed to log security violation:', error);
  }
};

/**
 * Utilitário para criar chaves de cache seguras
 */
export const createSecureCacheKey = (
  baseKey: string,
  teacherId: string,
  additionalParams?: Record<string, any>
): string[] => {
  const key = [baseKey, teacherId];
  
  if (additionalParams) {
    Object.entries(additionalParams)
      .sort(([a], [b]) => a.localeCompare(b)) // Ordenar para consistência
      .forEach(([k, v]) => {
        key.push(`${k}:${v}`);
      });
  }
  
  return key;
};

/**
 * Hook personalizado para monitoramento de performance de queries
 */
export const createPerformanceMonitor = () => {
  const start = performance.now();
  
  return {
    end: (queryName: string, recordCount: number) => {
      const duration = performance.now() - start;
      
      if (duration > 1000) { // Log queries lentas (>1s)
        console.warn(`Slow query detected: ${queryName} took ${duration.toFixed(2)}ms for ${recordCount} records`);
      }
      
      return duration;
    }
  };
};

/**
 * Validador de esquema para dados retornados
 */
export const validateDataSchema = <T>(
  data: any[],
  requiredFields: (keyof T)[],
  tableName: string
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  data.forEach((item, index) => {
    requiredFields.forEach(field => {
      if (!(field in item) || item[field] === null || item[field] === undefined) {
        errors.push(`${tableName}[${index}]: Missing required field '${String(field)}'`);
      }
    });
  });
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Utilitário para sanitização de dados sensíveis em logs
 */
export const sanitizeForLog = (data: any): any => {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'cpf', 'email'];
  const sanitized: any = Array.isArray(data) ? [] : {};
  
  for (const [key, value] of Object.entries(data)) {
    const isSensitive = sensitiveFields.some(field => 
      key.toLowerCase().includes(field)
    );
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLog(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Verificação de integridade em tempo real
 */
export const startIntegrityMonitoring = (
  teacherId: string,
  interval: number = 30000 // 30 segundos
) => {
  const monitor = setInterval(async () => {
    try {
      // Verificar se o contexto ainda é válido
      const { data: relationship } = await supabase
        .from('teacher_student_relationships')
        .select('id')
        .eq('teacher_id', teacherId)
        .single();
      
      if (!relationship) {
        console.warn('Teacher context became invalid during session');
        clearInterval(monitor);
      }
    } catch (error) {
      console.error('Integrity monitoring error:', error);
    }
  }, interval);
  
  return () => clearInterval(monitor);
};

export default {
  validateDataIntegrity,
  createSecureQuery,
  executeSecureQuery,
  validateTeacherStudentRelationship,
  validateFinancialAccess,
  logSecurityEvent,
  logSecurityViolation,
  createSecureCacheKey,
  createPerformanceMonitor,
  validateDataSchema,
  sanitizeForLog,
  startIntegrityMonitoring
};