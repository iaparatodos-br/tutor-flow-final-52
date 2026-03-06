// ============================================
// Tipos TypeScript para o sistema de mensalidades
// ============================================

import type { Tables } from '@/integrations/supabase/types';

// Tipos base do Supabase
export type MonthlySubscriptionRow = Tables<'monthly_subscriptions'>;
export type StudentMonthlySubscriptionRow = Tables<'student_monthly_subscriptions'>;

// Interface principal de mensalidade
export interface MonthlySubscription {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  teacher_id: string;
}

// Interface com contagem de alunos (retorno de get_subscriptions_with_students)
export interface MonthlySubscriptionWithCount extends MonthlySubscription {
  students_count: number;
}

// Dados do formulário de criação/edição
export interface MonthlySubscriptionFormData {
  name: string;
  description: string;
  price: number;
  is_active?: boolean;
  selectedStudents: string[]; // relationship_ids
}

// Atribuição aluno-mensalidade
export interface StudentMonthlySubscription {
  id: string;
  subscription_id: string;
  relationship_id: string;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Aluno atribuído a uma mensalidade (retorno de get_subscription_assigned_students)
export interface AssignedStudent {
  student_subscription_id: string;
  relationship_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  classes_used: number;
}

// Detalhes da mensalidade do aluno (retorno de get_student_subscription_details)
export interface StudentSubscriptionDetails {
  teacher_id: string;
  teacher_name: string;
  subscription_name: string;
  price: number;
  starts_at: string;
  classes_used: number;
  relationship_id: string;
}

// Detalhes da mensalidade ativa (retorno de get_student_active_subscription)
export interface ActiveSubscription {
  subscription_id: string;
  subscription_name: string;
  price: number;
  starts_at: string;
  student_subscription_id: string;
}

// Interface auxiliar para relacionamento professor-aluno
export interface TeacherStudentRelationship {
  id: string;
  teacher_id: string;
  student_id: string;
  student_name: string | null;
  billing_day: number | null;
  stripe_customer_id: string | null;
  created_at: string;
}

// Tipo para dados de input em mutações
export type CreateMonthlySubscriptionInput = Omit<
  MonthlySubscription, 
  'id' | 'created_at' | 'updated_at' | 'teacher_id'
>;

export type UpdateMonthlySubscriptionInput = Partial<CreateMonthlySubscriptionInput>;

// Tipo para atribuição de aluno
export interface AssignStudentInput {
  subscription_id: string;
  relationship_id: string;
  starts_at?: string;
}
