-- =============================================
-- GRUPO 1C: Funções SQL Helper para Dependentes
-- =============================================

-- 1. Função: Busca todos os dependentes de um professor
CREATE OR REPLACE FUNCTION public.get_teacher_dependents(p_teacher_id uuid)
RETURNS TABLE (
  dependent_id uuid,
  dependent_name text,
  birth_date date,
  notes text,
  responsible_id uuid,
  responsible_name text,
  responsible_email text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    d.id as dependent_id,
    d.name as dependent_name,
    d.birth_date,
    d.notes,
    d.responsible_id,
    p.name as responsible_name,
    p.email as responsible_email,
    d.created_at
  FROM dependents d
  JOIN profiles p ON p.id = d.responsible_id
  WHERE d.teacher_id = p_teacher_id
  ORDER BY p.name, d.name;
$$;

-- 2. Função: Conta alunos + dependentes para limite de plano
CREATE OR REPLACE FUNCTION public.count_teacher_students_and_dependents(p_teacher_id uuid)
RETURNS TABLE (
  total_students integer,
  regular_students integer,
  dependents_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH counts AS (
    SELECT 
      (SELECT COUNT(DISTINCT student_id) 
       FROM teacher_student_relationships 
       WHERE teacher_id = p_teacher_id) as regular,
      (SELECT COUNT(*) 
       FROM dependents 
       WHERE teacher_id = p_teacher_id) as deps
  )
  SELECT 
    (counts.regular + counts.deps)::integer as total_students,
    counts.regular::integer as regular_students,
    counts.deps::integer as dependents_count
  FROM counts;
$$;

-- 3. Função: Busca participantes não faturados (v2 com suporte a dependentes)
CREATE OR REPLACE FUNCTION public.get_unbilled_participants_v2(
  p_teacher_id uuid, 
  p_student_id uuid DEFAULT NULL, 
  p_status text DEFAULT 'concluida'
)
RETURNS TABLE (
  participant_id uuid,
  class_id uuid,
  student_id uuid,
  dependent_id uuid,
  dependent_name text,
  responsible_id uuid,
  class_date timestamptz,
  service_id uuid,
  charge_applied boolean,
  class_services jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    cp.id as participant_id,
    cp.class_id,
    cp.student_id,
    cp.dependent_id,
    d.name as dependent_name,
    d.responsible_id,
    c.class_date,
    c.service_id,
    cp.charge_applied,
    jsonb_build_object(
      'id', cs.id,
      'name', cs.name,
      'price', cs.price,
      'description', cs.description
    ) as class_services
  FROM class_participants cp
  JOIN classes c ON cp.class_id = c.id
  LEFT JOIN class_services cs ON c.service_id = cs.id
  LEFT JOIN invoice_classes ic ON cp.id = ic.participant_id
  LEFT JOIN dependents d ON cp.dependent_id = d.id
  WHERE c.teacher_id = p_teacher_id
    AND cp.status = p_status
    AND ic.id IS NULL
    AND (
      p_student_id IS NULL 
      OR cp.student_id = p_student_id
      OR d.responsible_id = p_student_id
    );
$$;

-- 4. Função: Busca o responsável de um dependente
CREATE OR REPLACE FUNCTION public.get_dependent_responsible(p_dependent_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT responsible_id 
  FROM dependents 
  WHERE id = p_dependent_id;
$$;