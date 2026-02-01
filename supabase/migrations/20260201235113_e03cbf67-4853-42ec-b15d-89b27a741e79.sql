-- =====================================================
-- TEACHER NOTIFICATIONS TABLE
-- Task 1.1: Create table with all columns and constraints
-- =====================================================

CREATE TABLE IF NOT EXISTS public.teacher_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('class', 'invoice')),
  source_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('pending_past_classes', 'amnesty_eligible', 'overdue_invoices', 'pending_reports')),
  status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'saved', 'done')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  status_changed_at TIMESTAMPTZ,
  UNIQUE(teacher_id, source_type, source_id, category)
);

-- =====================================================
-- TASK 1.2: Performance Indices
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_teacher_notifications_teacher_status 
  ON public.teacher_notifications(teacher_id, status);

CREATE INDEX IF NOT EXISTS idx_teacher_notifications_teacher_read 
  ON public.teacher_notifications(teacher_id, is_read);

CREATE INDEX IF NOT EXISTS idx_teacher_notifications_source 
  ON public.teacher_notifications(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_teacher_notifications_created 
  ON public.teacher_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_notifications_main_query 
  ON public.teacher_notifications(teacher_id, status, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_notifications_category 
  ON public.teacher_notifications(category);

CREATE INDEX IF NOT EXISTS idx_teacher_notifications_cleanup 
  ON public.teacher_notifications(status, status_changed_at) 
  WHERE status = 'done';

-- =====================================================
-- TASK 1.3: RLS Policies
-- =====================================================

ALTER TABLE public.teacher_notifications ENABLE ROW LEVEL SECURITY;

-- Teachers can view their own notifications
CREATE POLICY "Teachers can view their own notifications"
  ON public.teacher_notifications
  FOR SELECT
  USING (auth.uid() = teacher_id);

-- Teachers can update their own notifications (status, is_read)
CREATE POLICY "Teachers can update their own notifications"
  ON public.teacher_notifications
  FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

-- Service role can manage all notifications (for edge functions/triggers)
CREATE POLICY "Service role can manage notifications"
  ON public.teacher_notifications
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');