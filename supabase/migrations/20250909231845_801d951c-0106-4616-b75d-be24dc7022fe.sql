-- Fix security warning by adding search_path to the function
CREATE OR REPLACE FUNCTION get_calendar_events(p_teacher_id UUID, p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ)
RETURNS SETOF classes AS $$
BEGIN
  RETURN QUERY
  -- 1. Return regular (non-recurring) classes within the period
  SELECT *
  FROM classes
  WHERE
    teacher_id = p_teacher_id AND
    recurrence_pattern IS NULL AND
    class_date >= p_start_date AND
    class_date <= p_end_date
  
  UNION ALL
  
  -- 2. Return template classes (anchor events) for recurring series that could have instances in the period  
  SELECT *
  FROM classes
  WHERE
    teacher_id = p_teacher_id AND
    recurrence_pattern IS NOT NULL AND
    parent_class_id IS NULL AND -- Only template classes, not generated instances
    class_date <= p_end_date; -- Template started before or during the period
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;