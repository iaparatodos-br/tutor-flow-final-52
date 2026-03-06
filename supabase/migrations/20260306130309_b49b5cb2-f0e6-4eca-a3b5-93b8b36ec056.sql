
-- Drop class_exceptions table and all dependencies
DROP POLICY IF EXISTS "Teachers can manage their own class exceptions" ON public.class_exceptions;
DROP TABLE IF EXISTS public.class_exceptions;
DROP TYPE IF EXISTS public.exception_status;
