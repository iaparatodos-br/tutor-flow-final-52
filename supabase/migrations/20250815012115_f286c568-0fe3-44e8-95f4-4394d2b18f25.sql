-- Fix default categories by using a special UUID that won't conflict with real users
-- First delete the existing ones with the placeholder UUID
DELETE FROM public.expense_categories WHERE teacher_id = '00000000-0000-0000-0000-000000000000';

-- Insert default categories with a proper system approach - use first teacher as template but mark as default
-- This approach will make them available to all teachers
INSERT INTO public.expense_categories (teacher_id, name, color, is_default) VALUES
  (uuid_generate_v4(), 'Material didático', '#3B82F6', true),
  (uuid_generate_v4(), 'Transporte', '#10B981', true),
  (uuid_generate_v4(), 'Alimentação', '#F59E0B', true),
  (uuid_generate_v4(), 'Equipamentos', '#8B5CF6', true),
  (uuid_generate_v4(), 'Cursos e treinamentos', '#EF4444', true),
  (uuid_generate_v4(), 'Marketing', '#EC4899', true),
  (uuid_generate_v4(), 'Despesas administrativas', '#6B7280', true),
  (uuid_generate_v4(), 'Outros', '#64748B', true);