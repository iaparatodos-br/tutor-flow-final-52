-- =====================================================
-- Fix RLS policy to allow materialization of virtual classes
-- =====================================================
-- Created: 2025-11-02
-- Issue: Teachers cannot materialize virtual classes (403 error)
-- Solution: Remove restrictive class_template_id check from INSERT policy

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Professores podem criar suas aulas" ON public.classes;

-- Create corrected policy that allows:
-- 1. Regular classes (class_template_id = NULL, is_template = false)
-- 2. Template classes (class_template_id = NULL, is_template = true)  
-- 3. Materialized classes (class_template_id != NULL, is_template = false) ← NOW ALLOWED
CREATE POLICY "Professores podem criar suas aulas" ON public.classes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = teacher_id
  -- REMOVED: AND ((class_template_id IS NULL) OR (is_template = true))
  -- Teachers can now insert ANY class where they are the teacher
);

-- Verify policy was created successfully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'classes' 
    AND policyname = 'Professores podem criar suas aulas'
  ) THEN
    RAISE EXCEPTION 'Policy creation failed!';
  END IF;
  
  RAISE NOTICE 'RLS policy successfully updated. Teachers can now materialize virtual classes.';
END $$;