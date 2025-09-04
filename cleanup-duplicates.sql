-- Cleanup script for duplicate recurring classes
-- This script identifies and removes duplicate classes created by the bug

-- First, let's see what duplicates we have
-- Classes with same teacher_id, class_date, duration_minutes, and recurrence_pattern
WITH duplicate_groups AS (
  SELECT 
    teacher_id,
    class_date,
    duration_minutes,
    service_id,
    is_experimental,
    is_group_class,
    COUNT(*) as count,
    MIN(created_at) as first_created,
    array_agg(id ORDER BY created_at) as ids
  FROM classes 
  WHERE recurrence_pattern IS NOT NULL
  GROUP BY teacher_id, class_date, duration_minutes, service_id, is_experimental, is_group_class
  HAVING COUNT(*) > 1
)
-- Keep only the oldest record from each duplicate group
SELECT 
  'DELETE FROM classes WHERE id IN (' || 
  array_to_string(ids[2:], ',') || 
  ');' as cleanup_query
FROM duplicate_groups
WHERE count > 1;

-- Alternative: If you want to run the cleanup directly (uncomment the lines below)
-- WITH duplicate_groups AS (
--   SELECT 
--     teacher_id,
--     class_date,
--     duration_minutes,
--     service_id,
--     is_experimental,
--     is_group_class,
--     COUNT(*) as count,
--     MIN(created_at) as first_created,
--     array_agg(id ORDER BY created_at) as ids
--   FROM classes 
--   WHERE recurrence_pattern IS NOT NULL
--   GROUP BY teacher_id, class_date, duration_minutes, service_id, is_experimental, is_group_class
--   HAVING COUNT(*) > 1
-- ),
-- ids_to_delete AS (
--   SELECT unnest(ids[2:]) as id_to_delete
--   FROM duplicate_groups
--   WHERE count > 1
-- )
-- DELETE FROM classes 
-- WHERE id IN (SELECT id_to_delete FROM ids_to_delete);