// ============================================
// Schema Zod para validação do formulário de mensalidade
// ============================================

import { z } from 'zod';

/**
 * Schema de validação para criação/edição de mensalidade
 * 
 * Regras:
 * - name: obrigatório, 1-100 caracteres
 * - description: opcional, max 500 caracteres
 * - price: obrigatório, >= 0
 * - selectedStudents: array de relationship_ids (pode ser vazio)
 */
export const monthlySubscriptionSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'O nome da mensalidade é obrigatório.' })
    .max(100, { message: 'O nome deve ter no máximo 100 caracteres.' })
    .transform(val => val.trim()),
  
  description: z
    .string()
    .max(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
    .optional()
    .transform(val => val?.trim() || ''),
  
  price: z
    .number({ invalid_type_error: 'Informe um valor válido.' })
    .min(0, { message: 'O valor deve ser maior ou igual a zero.' }),
  
  is_active: z
    .boolean()
    .optional(),

  selectedStudents: z
    .array(z.string().uuid())
    .default([]),
});

// Tipo inferido do schema para uso com react-hook-form
export type MonthlySubscriptionFormSchema = z.infer<typeof monthlySubscriptionSchema>;

// Schema para atribuição de aluno
export const assignStudentSchema = z.object({
  subscription_id: z.string().uuid('ID de mensalidade inválido.'),
  relationship_id: z.string().uuid('ID de relacionamento inválido.'),
  starts_at: z.string().optional(),
});

export type AssignStudentSchema = z.infer<typeof assignStudentSchema>;
