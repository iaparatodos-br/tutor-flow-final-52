-- Script to clean up duplicate recurring classes
-- Run this to remove existing duplicates before applying the unique constraints

-- Step 1: Identify and remove duplicate recurring classes (keeping the oldest)
WITH duplicate_groups AS (
  SELECT 
    teacher_id,
    class_date,
    duration_minutes,
    service_id,
    is_experimental,
    is_group_class,
    parent_class_id,
    COUNT(*) as count,
    MIN(created_at) as first_created,
    array_agg(id ORDER BY created_at) as ids
  FROM classes 
  WHERE parent_class_id IS NOT NULL  -- Only recurring classes
  GROUP BY teacher_id, class_date, duration_minutes, service_id, is_experimental, is_group_class, parent_class_id
  HAVING COUNT(*) > 1
),
ids_to_delete AS (
  SELECT unnest(ids[2:]) as id_to_delete
  FROM duplicate_groups
  WHERE count > 1
)
DELETE FROM classes 
WHERE id IN (SELECT id_to_delete FROM ids_to_delete);

-- Step 2: Clean up duplicate template classes (keeping the oldest)
WITH template_duplicates AS (
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
  WHERE parent_class_id IS NULL 
    AND recurrence_pattern IS NOT NULL  -- Only template classes
  GROUP BY teacher_id, class_date, duration_minutes, service_id, is_experimental, is_group_class
  HAVING COUNT(*) > 1
),
template_ids_to_delete AS (
  SELECT unnest(ids[2:]) as id_to_delete
  FROM template_duplicates
  WHERE count > 1
)
DELETE FROM classes 
WHERE id IN (SELECT id_to_delete FROM template_ids_to_delete);

-- Step 3: Update any orphaned recurring classes that lost their parent
UPDATE classes 
SET parent_class_id = NULL, 
    recurrence_pattern = jsonb_build_object('frequency', 'weekly', 'is_infinite', true)
WHERE parent_class_id IS NOT NULL 
  AND parent_class_id NOT IN (SELECT id FROM classes WHERE parent_class_id IS NULL);

-- Display cleanup summary
SELECT 
  'Remaining template classes' as category,
  COUNT(*) as count
FROM classes 
WHERE parent_class_id IS NULL AND recurrence_pattern IS NOT NULL

UNION ALL

SELECT 
  'Remaining recurring instances' as category,
  COUNT(*) as count
FROM classes 
WHERE parent_class_id IS NOT NULL

UNION ALL

SELECT 
  'Total classes' as category,
  COUNT(*) as count
FROM classes;