
-- Corrigir: adicionar business_profile_id para Erik Senior
UPDATE teacher_student_relationships 
SET business_profile_id = (
  SELECT id FROM business_profiles 
  WHERE user_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492' 
  LIMIT 1
)
WHERE id = '0d2b4c9a-db16-4064-a575-90cd195128fc';
