-- Create teacher_student_relationships table for many-to-many relationship
CREATE TABLE public.teacher_student_relationships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  billing_day INTEGER DEFAULT 15,
  preferred_payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure unique teacher-student pairs
  UNIQUE(teacher_id, student_id)
);

-- Add comments for clarity
COMMENT ON TABLE public.teacher_student_relationships IS 'Many-to-many relationship table between teachers and students with billing configuration';
COMMENT ON COLUMN public.teacher_student_relationships.teacher_id IS 'Reference to teacher profile';
COMMENT ON COLUMN public.teacher_student_relationships.student_id IS 'Reference to student profile';
COMMENT ON COLUMN public.teacher_student_relationships.billing_day IS 'Day of month for billing this student';
COMMENT ON COLUMN public.teacher_student_relationships.preferred_payment_account_id IS 'Preferred payment account for this teacher-student relationship';
COMMENT ON COLUMN public.teacher_student_relationships.stripe_customer_id IS 'Stripe customer ID for this specific teacher-student relationship';

-- Enable Row Level Security
ALTER TABLE public.teacher_student_relationships ENABLE ROW LEVEL SECURITY;

-- Create policies for teacher_student_relationships
CREATE POLICY "Teachers can manage their student relationships" 
ON public.teacher_student_relationships 
FOR ALL 
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Students can view their teacher relationships" 
ON public.teacher_student_relationships 
FOR SELECT 
USING (auth.uid() = student_id);

-- Create indexes for performance
CREATE INDEX idx_teacher_student_relationships_teacher_id ON public.teacher_student_relationships(teacher_id);
CREATE INDEX idx_teacher_student_relationships_student_id ON public.teacher_student_relationships(student_id);
CREATE INDEX idx_teacher_student_relationships_billing_day ON public.teacher_student_relationships(billing_day);

-- Migrate existing data from profiles.teacher_id to new relationship table
INSERT INTO public.teacher_student_relationships (teacher_id, student_id, billing_day, stripe_customer_id)
SELECT 
  teacher_id, 
  id as student_id,
  COALESCE(billing_day, 15) as billing_day,
  stripe_customer_id
FROM public.profiles
WHERE role = 'aluno' AND teacher_id IS NOT NULL
ON CONFLICT (teacher_id, student_id) DO NOTHING;

-- Update profiles table: remove teacher_id column and move billing-related fields
ALTER TABLE public.profiles DROP COLUMN IF EXISTS teacher_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS billing_day;

-- Update the handle_new_user trigger to not set teacher_id anymore
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
begin
  insert into public.profiles (id, name, email, role, password_changed, address_complete)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'professor'),
    -- Set password_changed to false for students, true for professors
    case
      when coalesce(new.raw_user_meta_data->>'role', 'professor') = 'aluno'
        then false
      else true
    end,
    false -- address_complete defaults to false for new users
  );
  return new;
end;
$$;

-- Create function to get student's teachers
CREATE OR REPLACE FUNCTION public.get_student_teachers(student_user_id uuid)
RETURNS TABLE (
  teacher_id uuid,
  teacher_name text,
  teacher_email text,
  relationship_id uuid,
  billing_day integer,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    tsr.teacher_id,
    p.name as teacher_name,
    p.email as teacher_email,
    tsr.id as relationship_id,
    tsr.billing_day,
    tsr.created_at
  FROM teacher_student_relationships tsr
  JOIN profiles p ON p.id = tsr.teacher_id
  WHERE tsr.student_id = student_user_id
  ORDER BY tsr.created_at ASC;
$$;

-- Create function to get teacher's students with relationship info
CREATE OR REPLACE FUNCTION public.get_teacher_students(teacher_user_id uuid)
RETURNS TABLE (
  student_id uuid,
  student_name text,
  student_email text,
  guardian_name text,
  guardian_email text,
  guardian_phone text,
  relationship_id uuid,
  billing_day integer,
  stripe_customer_id text,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    tsr.student_id,
    p.name as student_name,
    p.email as student_email,
    p.guardian_name,
    p.guardian_email,
    p.guardian_phone,
    tsr.id as relationship_id,
    tsr.billing_day,
    tsr.stripe_customer_id,
    tsr.created_at
  FROM teacher_student_relationships tsr
  JOIN profiles p ON p.id = tsr.student_id
  WHERE tsr.teacher_id = teacher_user_id
  ORDER BY p.name ASC;
$$;

-- Update trigger for automatic timestamp updates
CREATE TRIGGER update_teacher_student_relationships_updated_at
BEFORE UPDATE ON public.teacher_student_relationships
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();