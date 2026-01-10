-- =====================================================
-- TESTE 1.3: Configuração de Cenário
-- Professor: Teste-Recorrencia (988c4c98-15ac-4401-ad49-1b533e8a28b5)
-- Plano: Gratuito (limite 3 alunos)
-- Objetivo: Deixar com 2/3 do limite para testar bloqueio
-- =====================================================

-- 1. Criar usuários de teste na tabela auth.users
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
VALUES 
  ('aaaa1301-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'teste1.3.1@test.com', crypt('TestPassword123!', gen_salt('bf')), NOW(), NOW(), NOW(), 'authenticated', 'authenticated'),
  ('aaaa1301-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'teste1.3.2@test.com', crypt('TestPassword123!', gen_salt('bf')), NOW(), NOW(), NOW(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- 2. Criar perfis de alunos de teste
INSERT INTO profiles (id, name, email, role)
VALUES 
  ('aaaa1301-0000-0000-0000-000000000001', '[TEST 1.3] Aluno Teste 1', 'teste1.3.1@test.com', 'aluno'),
  ('aaaa1301-0000-0000-0000-000000000002', '[TEST 1.3] Aluno Teste 2', 'teste1.3.2@test.com', 'aluno')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 3. Criar relacionamentos professor-aluno
INSERT INTO teacher_student_relationships (teacher_id, student_id, student_name, billing_day)
VALUES 
  ('988c4c98-15ac-4401-ad49-1b533e8a28b5', 'aaaa1301-0000-0000-0000-000000000001', '[TEST 1.3] Aluno Teste 1', 15),
  ('988c4c98-15ac-4401-ad49-1b533e8a28b5', 'aaaa1301-0000-0000-0000-000000000002', '[TEST 1.3] Aluno Teste 2', 15)
ON CONFLICT (teacher_id, student_id) DO NOTHING;

-- 4. Verificar resultado
SELECT 
  'Teste-Recorrencia' as professor,
  (SELECT COUNT(*) FROM teacher_student_relationships WHERE teacher_id = '988c4c98-15ac-4401-ad49-1b533e8a28b5') as total_alunos,
  (SELECT student_limit FROM subscription_plans WHERE slug = 'gratuito') as limite_plano;