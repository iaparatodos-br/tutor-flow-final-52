-- Criar função para calcular datas do ciclo de faturamento baseado em billing_day
CREATE OR REPLACE FUNCTION public.get_billing_cycle_dates(
  p_billing_day INTEGER,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(cycle_start DATE, cycle_end DATE)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_current_day INTEGER;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_adjusted_billing_day INTEGER;
  v_last_day_of_month INTEGER;
BEGIN
  v_current_day := EXTRACT(DAY FROM p_reference_date)::INTEGER;
  v_current_month := EXTRACT(MONTH FROM p_reference_date)::INTEGER;
  v_current_year := EXTRACT(YEAR FROM p_reference_date)::INTEGER;
  
  IF v_current_day >= p_billing_day THEN
    -- Ciclo começou este mês
    -- Ajustar billing_day para o último dia do mês se necessário
    v_last_day_of_month := EXTRACT(DAY FROM (DATE_TRUNC('month', p_reference_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    v_adjusted_billing_day := LEAST(p_billing_day, v_last_day_of_month);
    v_cycle_start := make_date(v_current_year, v_current_month, v_adjusted_billing_day);
    
    -- Fim do ciclo é um dia antes do billing_day do próximo mês
    v_last_day_of_month := EXTRACT(DAY FROM (DATE_TRUNC('month', p_reference_date + INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    v_adjusted_billing_day := LEAST(p_billing_day, v_last_day_of_month);
    v_cycle_end := make_date(
      EXTRACT(YEAR FROM p_reference_date + INTERVAL '1 month')::INTEGER,
      EXTRACT(MONTH FROM p_reference_date + INTERVAL '1 month')::INTEGER,
      v_adjusted_billing_day
    ) - INTERVAL '1 day';
  ELSE
    -- Ciclo começou no mês anterior
    v_last_day_of_month := EXTRACT(DAY FROM (DATE_TRUNC('month', p_reference_date - INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    v_adjusted_billing_day := LEAST(p_billing_day, v_last_day_of_month);
    v_cycle_start := make_date(
      EXTRACT(YEAR FROM p_reference_date - INTERVAL '1 month')::INTEGER,
      EXTRACT(MONTH FROM p_reference_date - INTERVAL '1 month')::INTEGER,
      v_adjusted_billing_day
    );
    
    -- Fim do ciclo é um dia antes do billing_day deste mês
    v_last_day_of_month := EXTRACT(DAY FROM (DATE_TRUNC('month', p_reference_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    v_adjusted_billing_day := LEAST(p_billing_day, v_last_day_of_month);
    v_cycle_end := make_date(v_current_year, v_current_month, v_adjusted_billing_day) - INTERVAL '1 day';
  END IF;
  
  RETURN QUERY SELECT v_cycle_start, v_cycle_end;
END;
$$;

-- Criar função para contar aulas concluídas dentro do ciclo de faturamento
CREATE OR REPLACE FUNCTION public.count_completed_classes_in_billing_cycle(
  p_teacher_id UUID,
  p_student_id UUID,
  p_billing_day INTEGER,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_count INTEGER;
BEGIN
  -- Obter datas do ciclo
  SELECT cycle_start, cycle_end INTO v_cycle_start, v_cycle_end
  FROM get_billing_cycle_dates(p_billing_day, p_reference_date);
  
  -- Contar aulas concluídas no ciclo (excluindo experimentais)
  SELECT COUNT(DISTINCT cp.id)::INTEGER INTO v_count
  FROM class_participants cp
  JOIN classes c ON cp.class_id = c.id
  WHERE c.teacher_id = p_teacher_id
    AND cp.student_id = p_student_id
    AND cp.status = 'concluida'
    AND c.is_experimental = false
    AND c.class_date::DATE >= v_cycle_start
    AND c.class_date::DATE <= v_cycle_end;
  
  RETURN COALESCE(v_count, 0);
END;
$$;

-- Comentários explicativos
COMMENT ON FUNCTION public.get_billing_cycle_dates IS 'Calcula as datas de início e fim do ciclo de faturamento baseado no billing_day do aluno';
COMMENT ON FUNCTION public.count_completed_classes_in_billing_cycle IS 'Conta aulas concluídas dentro do ciclo de faturamento (billing_day a billing_day-1 do próximo período)';