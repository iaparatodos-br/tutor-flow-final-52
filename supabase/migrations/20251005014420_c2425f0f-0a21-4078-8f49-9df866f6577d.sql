-- Atualizar política RLS para permitir acesso a categorias padrão
DROP POLICY IF EXISTS "Professores podem gerenciar suas categorias de despesa" ON expense_categories;

CREATE POLICY "Professores podem visualizar suas categorias e categorias padrão"
  ON expense_categories
  FOR SELECT
  USING (auth.uid() = teacher_id OR is_default = true);

CREATE POLICY "Professores podem inserir suas próprias categorias"
  ON expense_categories
  FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Professores podem atualizar suas próprias categorias"
  ON expense_categories
  FOR UPDATE
  USING (auth.uid() = teacher_id);

CREATE POLICY "Professores podem deletar suas próprias categorias"
  ON expense_categories
  FOR DELETE
  USING (auth.uid() = teacher_id);

-- Criar categorias padrão do sistema (usando UUID nulo como teacher_id)
INSERT INTO expense_categories (teacher_id, name, color, is_default)
VALUES 
  ('00000000-0000-0000-0000-000000000000'::uuid, 'Material Didático', '#3B82F6', true),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'Transporte', '#10B981', true),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'Alimentação', '#F59E0B', true),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'Tecnologia', '#8B5CF6', true),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'Outros', '#6B7280', true)
ON CONFLICT DO NOTHING;