-- =============================================================================
-- FASE 1: IMPLEMENTAÇÃO MULTI-ENTIDADE - REESTRUTURAÇÃO DO BANCO DE DADOS
-- =============================================================================
-- Esta migração implementa a fundação para arquitetura multi-entidade onde
-- um único usuário pode possuir múltiplos negócios (business_profiles).
-- Todos os recursos passarão a pertencer a um business_profile específico.

-- =============================================================================
-- 1. CRIAÇÃO DA TABELA CENTRAL: business_profiles
-- =============================================================================

CREATE TABLE public.business_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  cnpj TEXT,
  stripe_connect_id TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_profiles IS 'Representa uma entidade de negócio (CNPJ) de um usuário, com sua própria conta Stripe Connect.';
COMMENT ON COLUMN public.business_profiles.user_id IS 'Referência ao usuário proprietário do negócio';
COMMENT ON COLUMN public.business_profiles.business_name IS 'Nome fantasia ou razão social do negócio';
COMMENT ON COLUMN public.business_profiles.cnpj IS 'CNPJ do negócio (opcional para MEI)';
COMMENT ON COLUMN public.business_profiles.stripe_connect_id IS 'ID da conta Stripe Connect do negócio';
COMMENT ON COLUMN public.business_profiles.is_active IS 'Indica se o negócio está ativo';

-- Habilitar RLS na nova tabela
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

-- Índices para performance
CREATE INDEX idx_business_profiles_user_id ON public.business_profiles(user_id);
CREATE INDEX idx_business_profiles_stripe_connect_id ON public.business_profiles(stripe_connect_id);
CREATE INDEX idx_business_profiles_is_active ON public.business_profiles(is_active);

-- Trigger para updated_at
CREATE TRIGGER update_business_profiles_updated_at
BEFORE UPDATE ON public.business_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 2. REMOÇÃO DA COLUNA stripe_connect_id DA TABELA profiles
-- =============================================================================

ALTER TABLE public.profiles DROP COLUMN IF EXISTS stripe_connect_id;

-- =============================================================================
-- 3. ADIÇÃO DE business_profile_id ÀS TABELAS DE RECURSOS
-- =============================================================================

-- Adicionar business_profile_id à tabela teacher_student_relationships
ALTER TABLE public.teacher_student_relationships
ADD COLUMN business_profile_id UUID REFERENCES public.business_profiles(id) ON DELETE CASCADE;

-- Adicionar business_profile_id à tabela classes
ALTER TABLE public.classes
ADD COLUMN business_profile_id UUID REFERENCES public.business_profiles(id) ON DELETE CASCADE;

-- Adicionar business_profile_id à tabela invoices
ALTER TABLE public.invoices
ADD COLUMN business_profile_id UUID REFERENCES public.business_profiles(id) ON DELETE CASCADE;

-- Adicionar business_profile_id à tabela materials
ALTER TABLE public.materials
ADD COLUMN business_profile_id UUID REFERENCES public.business_profiles(id) ON DELETE CASCADE;

-- Adicionar business_profile_id à tabela material_categories
ALTER TABLE public.material_categories
ADD COLUMN business_profile_id UUID REFERENCES public.business_profiles(id) ON DELETE CASCADE;

-- Adicionar business_profile_id à tabela material_access
ALTER TABLE public.material_access
ADD COLUMN business_profile_id UUID REFERENCES public.business_profiles(id) ON DELETE CASCADE;

-- Verificar se existem outras tabelas de recursos que precisam da coluna
-- (Nota: Esta verificação será feita em migrações futuras conforme necessário)

-- Índices para performance nas novas colunas
CREATE INDEX idx_teacher_student_relationships_business_profile_id ON public.teacher_student_relationships(business_profile_id);
CREATE INDEX idx_classes_business_profile_id ON public.classes(business_profile_id);
CREATE INDEX idx_invoices_business_profile_id ON public.invoices(business_profile_id);
CREATE INDEX idx_materials_business_profile_id ON public.materials(business_profile_id);
CREATE INDEX idx_material_categories_business_profile_id ON public.material_categories(business_profile_id);
CREATE INDEX idx_material_access_business_profile_id ON public.material_access(business_profile_id);

-- =============================================================================
-- 4. REESCRITA DAS POLÍTICAS RLS
-- =============================================================================

-- Políticas para business_profiles
CREATE POLICY "Usuários podem gerenciar seus negócios"
ON public.business_profiles
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem ver seus negócios"
ON public.business_profiles
FOR SELECT
USING (auth.uid() = user_id);

-- =============================================================================
-- ATUALIZAÇÃO DAS POLÍTICAS RLS PARA teacher_student_relationships
-- =============================================================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Teachers can manage their student relationships" ON public.teacher_student_relationships;
DROP POLICY IF EXISTS "Students can view their teacher relationships" ON public.teacher_student_relationships;

-- Criar novas políticas baseadas em business_profile
CREATE POLICY "Professores podem gerenciar relacionamentos dos seus negócios"
ON public.teacher_student_relationships
FOR ALL
USING (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Alunos podem ver relacionamentos através dos negócios"
ON public.teacher_student_relationships
FOR SELECT
USING (auth.uid() = student_id);

-- =============================================================================
-- ATUALIZAÇÃO DAS POLÍTICAS RLS PARA classes
-- =============================================================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Professores podem gerenciar suas aulas" ON public.classes;
DROP POLICY IF EXISTS "Alunos podem ver suas aulas" ON public.classes;

-- Criar novas políticas baseadas em business_profile
CREATE POLICY "Professores podem gerenciar aulas dos seus negócios"
ON public.classes
FOR ALL
USING (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Alunos podem ver suas aulas"
ON public.classes
FOR SELECT
USING (auth.uid() = student_id);

-- =============================================================================
-- ATUALIZAÇÃO DAS POLÍTICAS RLS PARA invoices
-- =============================================================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Professores podem gerenciar suas faturas" ON public.invoices;
DROP POLICY IF EXISTS "Alunos podem ver suas faturas" ON public.invoices;

-- Criar novas políticas baseadas em business_profile
CREATE POLICY "Professores podem gerenciar faturas dos seus negócios"
ON public.invoices
FOR ALL
USING (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Alunos podem ver suas faturas"
ON public.invoices
FOR SELECT
USING (auth.uid() = student_id);

-- =============================================================================
-- ATUALIZAÇÃO DAS POLÍTICAS RLS PARA materials
-- =============================================================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Professores podem gerenciar seus materiais" ON public.materials;
DROP POLICY IF EXISTS "Alunos podem ver materiais compartilhados com eles" ON public.materials;

-- Criar novas políticas baseadas em business_profile
CREATE POLICY "Professores podem gerenciar materiais dos seus negócios"
ON public.materials
FOR ALL
USING (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Alunos podem ver materiais compartilhados com eles"
ON public.materials
FOR SELECT
USING (id IN (
    SELECT material_id 
    FROM public.material_access 
    WHERE student_id = auth.uid()
));

-- =============================================================================
-- ATUALIZAÇÃO DAS POLÍTICAS RLS PARA material_categories
-- =============================================================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Professores podem gerenciar suas categorias de materiais" ON public.material_categories;

-- Criar novas políticas baseadas em business_profile
CREATE POLICY "Professores podem gerenciar categorias dos seus negócios"
ON public.material_categories
FOR ALL
USING (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
);

-- =============================================================================
-- ATUALIZAÇÃO DAS POLÍTICAS RLS PARA material_access
-- =============================================================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Professores podem gerenciar acessos aos seus materiais" ON public.material_access;
DROP POLICY IF EXISTS "Alunos podem ver seus acessos" ON public.material_access;

-- Criar novas políticas baseadas em business_profile
CREATE POLICY "Professores podem gerenciar acessos dos seus negócios"
ON public.material_access
FOR ALL
USING (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  business_profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Alunos podem ver seus acessos"
ON public.material_access
FOR SELECT
USING (auth.uid() = student_id);

-- =============================================================================
-- 5. FUNÇÕES DE UTILIDADE PARA MULTI-ENTIDADE
-- =============================================================================

-- Função para obter business_profiles de um usuário
CREATE OR REPLACE FUNCTION public.get_user_business_profiles(user_uuid uuid)
RETURNS TABLE (
  id uuid,
  business_name text,
  cnpj text,
  stripe_connect_id text,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    bp.id,
    bp.business_name,
    bp.cnpj,
    bp.stripe_connect_id,
    bp.is_active,
    bp.created_at
  FROM business_profiles bp
  WHERE bp.user_id = user_uuid
  AND bp.is_active = true
  ORDER BY bp.created_at ASC;
$$;

-- Função para verificar se usuário possui um business_profile específico
CREATE OR REPLACE FUNCTION public.user_owns_business_profile(user_uuid uuid, business_profile_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM business_profiles 
    WHERE id = business_profile_uuid 
    AND user_id = user_uuid
    AND is_active = true
  );
$$;

-- =============================================================================
-- 6. COMENTÁRIOS FINAIS E VALIDAÇÕES
-- =============================================================================

-- Adicionar comentários nas novas colunas para documentação
COMMENT ON COLUMN public.teacher_student_relationships.business_profile_id IS 'Referência ao negócio responsável por este relacionamento professor-aluno';
COMMENT ON COLUMN public.classes.business_profile_id IS 'Referência ao negócio responsável por esta aula';
COMMENT ON COLUMN public.invoices.business_profile_id IS 'Referência ao negócio responsável por esta fatura';
COMMENT ON COLUMN public.materials.business_profile_id IS 'Referência ao negócio responsável por este material';
COMMENT ON COLUMN public.material_categories.business_profile_id IS 'Referência ao negócio responsável por esta categoria';
COMMENT ON COLUMN public.material_access.business_profile_id IS 'Referência ao negócio que concedeu este acesso';

-- =============================================================================
-- NOTAS IMPORTANTES PARA AS PRÓXIMAS FASES:
-- =============================================================================
-- 
-- FASE 2: Migração de dados existentes
-- - Criar business_profile padrão para cada usuário existente
-- - Migrar dados existentes para usar o business_profile_id
-- - Tornar business_profile_id NOT NULL após migração
--
-- FASE 3: Atualização do código da aplicação
-- - Modificar todas as queries para incluir business_profile_id
-- - Atualizar formulários para seleção de business_profile
-- - Implementar contexto de business_profile no frontend
--
-- FASE 4: Implementação da interface multi-entidade
-- - Seletor de business_profile
-- - Gestão de múltiplos negócios
-- - Onboarding Stripe Connect por business_profile
--
-- FASE 5: Validação e limpeza
-- - Tornar business_profile_id NOT NULL em todas as tabelas
-- - Remover colunas teacher_id onde aplicável
-- - Validação final do sistema multi-entidade
-- =============================================================================