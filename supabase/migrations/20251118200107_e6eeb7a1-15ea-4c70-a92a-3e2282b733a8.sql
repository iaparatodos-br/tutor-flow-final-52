-- ============================================
-- MIGRATION: Corrigir tipos de notificação
-- ============================================

-- 1. Remover constraint antiga
ALTER TABLE public.class_notifications 
DROP CONSTRAINT IF EXISTS class_notifications_notification_type_check;

-- 2. Adicionar constraint atualizada com TODOS os tipos
ALTER TABLE public.class_notifications
ADD CONSTRAINT class_notifications_notification_type_check 
CHECK (notification_type IN (
  -- Aulas
  'class_requested',
  'class_confirmed',
  'class_reminder',
  'class_completed',
  'class_report_created',
  
  -- Cancelamentos (tipos antigos mantidos para compatibilidade)
  'confirmation',
  'reminder',
  'cancellation',
  'rescheduling',
  'cancellation_with_charge',
  'cancellation_free',
  'participant_left',
  'participant_left_with_charge',
  
  -- Faturas
  'invoice_created',
  'invoice_payment_reminder',
  'invoice_paid',
  'invoice_overdue',
  'invoice_cancelled',
  
  -- Materiais
  'material_shared',
  
  -- Sistema
  'subscription_cancelled',
  'student_invited'
));

-- 3. Criar índice para consultas por tipo
CREATE INDEX IF NOT EXISTS idx_class_notifications_type 
ON public.class_notifications(notification_type);

-- 4. Criar índice para consultas por data
CREATE INDEX IF NOT EXISTS idx_class_notifications_sent_at 
ON public.class_notifications(sent_at DESC);

-- 5. Criar índice composto para consultas por aluno + tipo
CREATE INDEX IF NOT EXISTS idx_class_notifications_student_type 
ON public.class_notifications(student_id, notification_type);

-- Comentário explicativo
COMMENT ON TABLE public.class_notifications IS 
'Histórico de todas as notificações enviadas por email no sistema. Constraint atualizada em 2025 para incluir todos os tipos de notificação.';