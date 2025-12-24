# Plano de Implementação: Mensalidade Fixa

## Sumário

1. [Visão Geral](#1-visão-geral)
   - 1.1 [Contexto do Problema](#11-contexto-do-problema)
   - 1.2 [Requisitos Funcionais](#12-requisitos-funcionais)
   - 1.3 [Requisitos Não-Funcionais](#13-requisitos-não-funcionais)
   - 1.4 [Decisões de Design](#14-decisões-de-design)
2. [Arquitetura da Solução](#2-arquitetura-da-solução)
   - 2.1 [Diagrama Entidade-Relacionamento](#21-diagrama-entidade-relacionamento)
   - 2.2 [Fluxo de Faturamento](#22-fluxo-de-faturamento)
   - 2.3 [Fluxo de Criação de Mensalidade](#23-fluxo-de-criação-de-mensalidade)
3. [Estrutura de Dados](#3-estrutura-de-dados)
   - 3.1 [Nova Tabela: monthly_subscriptions](#31-nova-tabela-monthly_subscriptions)
   - 3.2 [Nova Tabela: student_monthly_subscriptions](#32-nova-tabela-student_monthly_subscriptions)
   - 3.3 [Alteração: invoices](#33-alteração-invoices)
   - 3.4 [Funções SQL](#34-funções-sql)
   - 3.5 [Índices e Constraints](#35-índices-e-constraints)
4. [Pontas Soltas e Soluções](#4-pontas-soltas-e-soluções)
   - 4.1 [Estado Atual vs. Planejado](#41-estado-atual-vs-planejado)
   - 4.2 [Checklist de Pré-Implementação](#42-checklist-de-pré-implementação)
5. [Casos de Uso Adicionais](#5-casos-de-uso-adicionais)
   - 5.1 [Interfaces TypeScript](#51-interfaces-typescript)
   - 5.2 [Histórico de Mudanças na Mensalidade](#52-histórico-de-mudanças-na-mensalidade)
   - 5.3 [Mensalidades com Data de Início Futura](#53-mensalidades-com-data-de-início-futura)
   - 5.4 [Exclusão de Aulas Experimentais do Limite](#54-exclusão-de-aulas-experimentais-do-limite)
   - 5.5 [Soft Delete de Mensalidades](#55-soft-delete-de-mensalidades)
   - 5.6 [Regras de Cobrança Detalhadas](#56-regras-de-cobrança-detalhadas)
6. [Implementação Frontend](#6-implementação-frontend)
   - 6.1 [Estrutura de Arquivos](#61-estrutura-de-arquivos)
   - 6.2 [Componentes](#62-componentes)
   - 6.3 [Alterações em Componentes Existentes](#63-alterações-em-componentes-existentes)
   - 6.4 [Hook useMonthlySubscriptions](#64-hook-usemonthlysubscriptions)
   - 6.5 [Zod Schema de Validação](#65-zod-schema-de-validação)
   - 6.6 [Alterações em Servicos.tsx e ClassServicesManager.tsx](#66-alterações-em-servicostsx-e-classservicesmanagertsx)
7. [Implementação Backend](#7-implementação-backend)
   - 7.1 [Alteração no Faturamento Automatizado](#71-alteração-no-faturamento-automatizado)
   - 7.2 [Pseudocódigo do Novo Fluxo](#72-pseudocódigo-do-novo-fluxo)
8. [Internacionalização (i18n)](#8-internacionalização-i18n)
   - 8.1 [Português (pt)](#81-português-pt)
   - 8.2 [English (en)](#82-english-en)
9. [Testes e Validações](#9-testes-e-validações)
10. [Cronograma de Implementação](#10-cronograma-de-implementação)
11. [Riscos e Mitigações](#11-riscos-e-mitigações)
12. [Apêndice A: SQL Completo](#12-apêndice-a-sql-completo)
13. [Apêndice B: Checklist de Deploy](#13-apêndice-b-checklist-de-deploy)

---

## 1. Visão Geral

### 1.1 Contexto do Problema

Atualmente, o sistema Tutor Flow cobra os alunos exclusivamente por aula realizada. No entanto, muitos professores preferem trabalhar com **mensalidades fixas**, onde o aluno paga um valor mensal independente da quantidade de aulas.

Esta funcionalidade permite que professores ofereçam:
- Pacotes mensais com valor fixo
- Opcionalmente, limite de aulas por mês
- Cobrança de aulas excedentes quando há limite

### 1.2 Requisitos Funcionais

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF01 | Professor pode criar mensalidades com nome, descrição e valor fixo | Alta |
| RF02 | Professor pode definir limite de aulas por mês (opcional) | Alta |
| RF03 | Professor pode definir valor por aula excedente | Média |
| RF04 | Professor pode atribuir alunos à mensalidade na mesma tela | Alta |
| RF05 | Um aluno só pode ter uma mensalidade ativa por relacionamento | Alta |
| RF06 | Mensalidade cobre responsável + todos os dependentes (cobrança familiar) | Alta |
| RF07 | Cancelamentos de aula NÃO geram cobrança adicional | Alta |
| RF08 | Cobrança usa o billing_day do relacionamento existente | Alta |
| RF09 | Mensalidade tem vigência indeterminada (sem data fim) | Média |
| RF10 | Professor pode desativar mensalidade a qualquer momento | Alta |

### 1.3 Requisitos Não-Funcionais

| ID | Requisito | Métrica |
|----|-----------|---------|
| RNF01 | Verificação de mensalidade deve ser rápida | < 50ms por aluno |
| RNF02 | Interface deve ser responsiva | Mobile-first |
| RNF03 | Retrocompatibilidade com cobrança por aula | 100% mantida |
| RNF04 | Internacionalização completa | PT e EN |

### 1.4 Decisões de Design

| Decisão | Opções Consideradas | Escolha | Justificativa |
|---------|---------------------|---------|---------------|
| Limite de aulas | Nenhum / Flexível | **Flexível** | Permite pacotes como "8 aulas/mês" |
| Escopo da mensalidade | Por aluno / Por relacionamento | **Por relacionamento** | Consistente com billing_day existente |
| Cobertura de dependentes | Individual / Familiar | **Familiar** | Uma mensalidade cobre todos |
| Cancelamentos | Cobrar / Ignorar | **Ignorar** | Mensalidade fixa = preço fixo |
| Dia de cobrança | Novo campo / billing_day | **billing_day** | Reutiliza lógica existente |
| Vigência | Com datas / Indeterminada | **Indeterminada** | Simplifica gestão |
| Atribuição de alunos | Tela separada / Mesma tela | **Mesma tela** | UX mais fluida |

---

## 2. Arquitetura da Solução

### 2.1 Diagrama Entidade-Relacionamento

```mermaid
erDiagram
    profiles ||--o{ teacher_student_relationships : "professor tem"
    profiles ||--o{ teacher_student_relationships : "aluno pertence"
    profiles ||--o{ monthly_subscriptions : "professor cria"
    profiles ||--o{ dependents : "responsável por"
    
    monthly_subscriptions ||--o{ student_monthly_subscriptions : "atribuída a"
    teacher_student_relationships ||--o| student_monthly_subscriptions : "pode ter"
    teacher_student_relationships ||--o{ dependents : "tem dependentes via"
    
    monthly_subscriptions ||--o{ invoices : "gera"
    
    monthly_subscriptions {
        uuid id PK
        uuid teacher_id FK
        text name
        text description
        numeric price
        integer max_classes
        numeric overage_price
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    
    student_monthly_subscriptions {
        uuid id PK
        uuid subscription_id FK
        uuid relationship_id FK
        date starts_at
        date ends_at
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    
    invoices {
        uuid id PK
        uuid monthly_subscription_id FK
        text invoice_type
    }
```

### 2.2 Fluxo de Faturamento

```mermaid
flowchart TD
    A[Dia de Cobrança do Aluno] --> B{Aluno tem mensalidade ativa?}
    
    B -->|Sim| C[Buscar detalhes da mensalidade]
    B -->|Não| D[Fluxo atual: Cobrar por aula]
    
    C --> E{Mensalidade tem limite de aulas?}
    
    E -->|Não - Ilimitado| F[Valor = Mensalidade.price]
    E -->|Sim| G[Contar aulas concluídas no mês]
    
    G --> H{Aulas > max_classes?}
    
    H -->|Não| F
    H -->|Sim| I[Calcular excedentes]
    
    I --> J[excedentes = aulas - max_classes]
    J --> K[valor_extra = excedentes × overage_price]
    K --> L[Valor = price + valor_extra]
    
    F --> M[Criar fatura tipo 'monthly_subscription']
    L --> M
    
    M --> N[Marcar aulas como cobertas pela mensalidade]
    N --> O[Gerar boleto/pagamento]
    
    D --> P[Buscar aulas não faturadas]
    P --> Q[Calcular valor por aula]
    Q --> R[Criar fatura tipo 'regular']
    R --> O
    
    O --> S[Fim]
    
    style B fill:#f9f,stroke:#333,stroke-width:2px
    style E fill:#bbf,stroke:#333,stroke-width:2px
    style H fill:#bbf,stroke:#333,stroke-width:2px
```

### 2.3 Fluxo de Criação de Mensalidade

```mermaid
sequenceDiagram
    autonumber
    actor P as Professor
    participant UI as MonthlySubscriptionModal
    participant API as Supabase
    participant DB as Database
    
    P->>UI: Clica "Nova Mensalidade"
    UI->>API: Buscar alunos do professor
    API->>DB: SELECT get_teacher_students()
    DB-->>API: Lista de alunos
    API-->>UI: Alunos disponíveis
    
    P->>UI: Preenche nome, valor, limite (opcional)
    P->>UI: Seleciona alunos
    P->>UI: Clica "Criar"
    
    UI->>UI: Validar campos obrigatórios
    
    alt Validação OK
        UI->>API: INSERT monthly_subscriptions
        API->>DB: Criar mensalidade
        DB-->>API: subscription_id
        
        loop Para cada aluno selecionado
            UI->>API: Verificar se aluno já tem mensalidade
            API->>DB: SELECT student_monthly_subscriptions
            
            alt Aluno sem mensalidade ativa
                UI->>API: INSERT student_monthly_subscriptions
                API->>DB: Vincular aluno
                DB-->>API: Sucesso
            else Aluno já tem mensalidade
                API-->>UI: Erro: conflito
                UI->>P: Toast de aviso
            end
        end
        
        API-->>UI: Sucesso
        UI->>P: Toast de sucesso
        UI->>UI: Fechar modal e recarregar lista
    else Validação Falhou
        UI->>P: Mostrar erros de validação
    end
```

---

## 3. Estrutura de Dados

### 3.1 Nova Tabela: monthly_subscriptions

```sql
-- ============================================
-- TABELA: monthly_subscriptions
-- Armazena os planos de mensalidade criados pelos professores
-- ============================================

CREATE TABLE public.monthly_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Informações básicas
  name TEXT NOT NULL,
  description TEXT,
  
  -- Valores
  price NUMERIC NOT NULL CHECK (price >= 0),
  
  -- Limite de aulas (NULL = ilimitado)
  max_classes INTEGER CHECK (max_classes IS NULL OR max_classes > 0),
  overage_price NUMERIC CHECK (overage_price IS NULL OR overage_price >= 0),
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Comentários
COMMENT ON TABLE public.monthly_subscriptions IS 'Planos de mensalidade fixa criados por professores';
COMMENT ON COLUMN public.monthly_subscriptions.max_classes IS 'Limite de aulas por mês. NULL = ilimitado';
COMMENT ON COLUMN public.monthly_subscriptions.overage_price IS 'Valor por aula excedente. Só aplicável se max_classes definido';

-- Índices
CREATE INDEX idx_monthly_subscriptions_teacher_id ON public.monthly_subscriptions(teacher_id);
CREATE INDEX idx_monthly_subscriptions_active ON public.monthly_subscriptions(teacher_id, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.monthly_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professores podem gerenciar suas mensalidades"
ON public.monthly_subscriptions
FOR ALL
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- Trigger para updated_at
CREATE TRIGGER update_monthly_subscriptions_updated_at
BEFORE UPDATE ON public.monthly_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3.2 Nova Tabela: student_monthly_subscriptions

```sql
-- ============================================
-- TABELA: student_monthly_subscriptions
-- Vincula alunos (via relationship) a uma mensalidade
-- ============================================

CREATE TABLE public.student_monthly_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referências
  subscription_id UUID NOT NULL REFERENCES public.monthly_subscriptions(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.teacher_student_relationships(id) ON DELETE CASCADE,
  
  -- Vigência
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_at DATE, -- NULL = indeterminado
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Comentários
COMMENT ON TABLE public.student_monthly_subscriptions IS 'Vinculação de alunos a mensalidades';
COMMENT ON COLUMN public.student_monthly_subscriptions.ends_at IS 'Data de término. NULL = vigência indeterminada';

-- Constraint: Um aluno só pode ter UMA mensalidade ativa por relacionamento
-- Usamos um índice parcial único para garantir isso
CREATE UNIQUE INDEX idx_unique_active_subscription_per_relationship 
ON public.student_monthly_subscriptions(relationship_id) 
WHERE is_active = true;

-- Índices adicionais
CREATE INDEX idx_student_monthly_subscriptions_subscription_id ON public.student_monthly_subscriptions(subscription_id);
CREATE INDEX idx_student_monthly_subscriptions_active ON public.student_monthly_subscriptions(subscription_id, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.student_monthly_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professores podem gerenciar assinaturas de seus alunos"
ON public.student_monthly_subscriptions
FOR ALL
USING (
  subscription_id IN (
    SELECT id FROM public.monthly_subscriptions WHERE teacher_id = auth.uid()
  )
)
WITH CHECK (
  subscription_id IN (
    SELECT id FROM public.monthly_subscriptions WHERE teacher_id = auth.uid()
  )
);

-- Política para alunos visualizarem suas próprias mensalidades
CREATE POLICY "Alunos podem ver suas mensalidades"
ON public.student_monthly_subscriptions
FOR SELECT
USING (
  relationship_id IN (
    SELECT id FROM public.teacher_student_relationships WHERE student_id = auth.uid()
  )
);

-- Trigger para updated_at
CREATE TRIGGER update_student_monthly_subscriptions_updated_at
BEFORE UPDATE ON public.student_monthly_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3.3 Alteração: invoices

```sql
-- ============================================
-- ALTERAÇÃO: Adicionar referência a mensalidade em invoices
-- ============================================

-- Adicionar coluna para referência à mensalidade
ALTER TABLE public.invoices 
ADD COLUMN monthly_subscription_id UUID REFERENCES public.monthly_subscriptions(id);

-- Comentário
COMMENT ON COLUMN public.invoices.monthly_subscription_id IS 'Referência à mensalidade que gerou esta fatura (se aplicável)';

-- Índice para buscas por mensalidade
CREATE INDEX idx_invoices_monthly_subscription_id ON public.invoices(monthly_subscription_id) WHERE monthly_subscription_id IS NOT NULL;
```

### 3.4 Funções SQL

```sql
-- ============================================
-- FUNÇÃO: get_student_active_subscription
-- Retorna a mensalidade ativa de um aluno (via relationship_id)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_student_active_subscription(
  p_relationship_id UUID
)
RETURNS TABLE (
  subscription_id UUID,
  subscription_name TEXT,
  price NUMERIC,
  max_classes INTEGER,
  overage_price NUMERIC
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    ms.id as subscription_id,
    ms.name as subscription_name,
    ms.price,
    ms.max_classes,
    ms.overage_price
  FROM student_monthly_subscriptions sms
  JOIN monthly_subscriptions ms ON ms.id = sms.subscription_id
  WHERE sms.relationship_id = p_relationship_id
    AND sms.is_active = true
    AND ms.is_active = true
    AND sms.starts_at <= CURRENT_DATE
    AND (sms.ends_at IS NULL OR sms.ends_at >= CURRENT_DATE)
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_student_active_subscription IS 'Retorna a mensalidade ativa de um aluno para um relacionamento específico';

-- ============================================
-- FUNÇÃO: count_completed_classes_in_month
-- Conta aulas concluídas de um aluno em um mês específico
-- Inclui aulas do responsável + dependentes (cobertura familiar)
-- ============================================

CREATE OR REPLACE FUNCTION public.count_completed_classes_in_month(
  p_teacher_id UUID,
  p_student_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  p_month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(DISTINCT cp.id)::INTEGER
  FROM class_participants cp
  JOIN classes c ON c.id = cp.class_id
  LEFT JOIN dependents d ON d.id = cp.dependent_id
  WHERE c.teacher_id = p_teacher_id
    AND cp.status = 'concluida'
    AND EXTRACT(YEAR FROM c.class_date) = p_year
    AND EXTRACT(MONTH FROM c.class_date) = p_month
    AND (
      cp.student_id = p_student_id  -- Aulas do próprio aluno
      OR d.responsible_id = p_student_id  -- Aulas de dependentes do aluno
    );
$$;

COMMENT ON FUNCTION public.count_completed_classes_in_month IS 'Conta aulas concluídas (responsável + dependentes) em um mês específico';

-- ============================================
-- FUNÇÃO: get_subscription_students_count
-- Conta quantos alunos estão vinculados a uma mensalidade
-- ============================================

CREATE OR REPLACE FUNCTION public.get_subscription_students_count(
  p_subscription_id UUID
)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::INTEGER
  FROM student_monthly_subscriptions
  WHERE subscription_id = p_subscription_id
    AND is_active = true;
$$;

COMMENT ON FUNCTION public.get_subscription_students_count IS 'Conta alunos ativos vinculados a uma mensalidade';

-- ============================================
-- FUNÇÃO: get_subscriptions_with_students
-- Retorna mensalidades de um professor com contagem de alunos
-- ============================================

CREATE OR REPLACE FUNCTION public.get_subscriptions_with_students(
  p_teacher_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  price NUMERIC,
  max_classes INTEGER,
  overage_price NUMERIC,
  is_active BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  students_count INTEGER
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    ms.id,
    ms.name,
    ms.description,
    ms.price,
    ms.max_classes,
    ms.overage_price,
    ms.is_active,
    ms.created_at,
    COALESCE(
      (SELECT COUNT(*)::INTEGER 
       FROM student_monthly_subscriptions sms 
       WHERE sms.subscription_id = ms.id AND sms.is_active = true),
      0
    ) as students_count
  FROM monthly_subscriptions ms
  WHERE ms.teacher_id = p_teacher_id
  ORDER BY ms.is_active DESC, ms.name ASC;
$$;

COMMENT ON FUNCTION public.get_subscriptions_with_students IS 'Lista mensalidades de um professor com contagem de alunos';

-- ============================================
-- FUNÇÃO: get_subscription_assigned_students
-- Retorna alunos vinculados a uma mensalidade específica
-- ============================================

CREATE OR REPLACE FUNCTION public.get_subscription_assigned_students(
  p_subscription_id UUID
)
RETURNS TABLE (
  assignment_id UUID,
  relationship_id UUID,
  student_id UUID,
  student_name TEXT,
  student_email TEXT,
  starts_at DATE,
  is_active BOOLEAN
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    sms.id as assignment_id,
    sms.relationship_id,
    tsr.student_id,
    COALESCE(tsr.student_name, p.name) as student_name,
    p.email as student_email,
    sms.starts_at,
    sms.is_active
  FROM student_monthly_subscriptions sms
  JOIN teacher_student_relationships tsr ON tsr.id = sms.relationship_id
  JOIN profiles p ON p.id = tsr.student_id
  WHERE sms.subscription_id = p_subscription_id
  ORDER BY COALESCE(tsr.student_name, p.name) ASC;
$$;

COMMENT ON FUNCTION public.get_subscription_assigned_students IS 'Lista alunos vinculados a uma mensalidade';

-- ============================================
-- FUNÇÃO: check_student_has_active_subscription
-- Verifica se um aluno já tem mensalidade ativa
-- ============================================

CREATE OR REPLACE FUNCTION public.check_student_has_active_subscription(
  p_relationship_id UUID,
  p_exclude_subscription_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM student_monthly_subscriptions sms
    JOIN monthly_subscriptions ms ON ms.id = sms.subscription_id
    WHERE sms.relationship_id = p_relationship_id
      AND sms.is_active = true
      AND ms.is_active = true
      AND (p_exclude_subscription_id IS NULL OR sms.subscription_id != p_exclude_subscription_id)
  );
$$;

COMMENT ON FUNCTION public.check_student_has_active_subscription IS 'Verifica se aluno já possui mensalidade ativa (opcional: excluir uma mensalidade específica)';
```

### 3.5 Índices e Constraints

```sql
-- ============================================
-- ÍNDICES ADICIONAIS PARA PERFORMANCE
-- ============================================

-- Índice para busca rápida no faturamento
CREATE INDEX idx_student_monthly_subs_lookup 
ON public.student_monthly_subscriptions(relationship_id, is_active, starts_at);

-- Índice para contagem de aulas no mês
CREATE INDEX idx_class_participants_billing 
ON public.class_participants(student_id, status)
WHERE status = 'concluida';

-- Índice para buscar aulas por professor e mês
CREATE INDEX idx_classes_billing_month 
ON public.classes(teacher_id, class_date)
WHERE is_template = false;
```

---

## 4. Pontas Soltas e Soluções

| # | Cenário | Problema | Solução |
|---|---------|----------|---------|
| 1 | Aluno ativado no meio do mês | Quando cobrar pela primeira vez? | Primeira cobrança no próximo `billing_day`. Mês parcial = cobrança integral |
| 2 | Mensalidade desativada no meio do mês | O que acontece com cobrança atual? | Mês corrente ainda cobra (já faturado). Próximo mês não cobra |
| 3 | Aluno troca de mensalidade | Como migrar? | Desativar antiga, ativar nova. Próximo billing_day usa nova |
| 4 | Dependente sem aulas no mês | Cobrar dependente? | Não. Mensalidade familiar cobre todos, com ou sem aulas |
| 5 | Professor exclui mensalidade | O que acontece com alunos? | `ON DELETE CASCADE` remove vínculos. Alunos passam a cobrar por aula |
| 6 | Aluno tem mensalidade mas não teve aulas | Cobrar mensalidade mesmo assim? | **Sim**. Mensalidade é fixa, independe de aulas |
| 7 | Limite de aulas com dependentes | Como contar aulas de dependentes? | Função soma aulas do responsável + todos dependentes |
| 8 | Fatura de mensalidade cancelada | Refaturar como? | Gerar nova fatura de mensalidade no próximo ciclo |
| 9 | Aluno com overdue tenta pagar mensalidade | Bloquear? | Não. Fluxo de pagamento normal |
| 10 | Professor altera valor da mensalidade | Afeta faturas já emitidas? | Não. Valor é capturado no momento da fatura |
| 11 | Aluno removido do professor | Mensalidade é cancelada? | Sim. `ON DELETE CASCADE` na relationship |
| 12 | Aulas de meses anteriores não faturadas | Cobrar junto com mensalidade? | Não. Mensalidade é prospectiva. Aulas antigas: cobrar por aula ou perdoar |
| 13 | Aluno com mensalidade + aula avulsa de outro serviço | Como tratar? | Mensalidade cobre TODAS as aulas do professor. Não há avulso |
| 14 | Dois professores, mesmo aluno | Cada um pode ter mensalidade própria? | Sim. Mensalidade é por `relationship_id` |
| 15 | Cancelamento de aula pelo professor | Afeta limite de aulas? | Não. Só aulas concluídas contam pro limite |
| 16 | Aula com status pendente | Conta pro limite? | Não. Só `status = 'concluida'` conta |
| 17 | Responsável troca de dependentes | Mensalidade atualiza? | Sim. Dependentes são dinâmicos via `responsible_id` |
| 18 | Mensalidade com preço R$0 | Permitir? | Sim. Pode ser útil para testes ou cortesias |
| 19 | Excedente com valor R$0 | Permitir? | Sim. Significa "aulas extras grátis" |
| 20 | Aluno inativo com mensalidade | Cobrar mesmo assim? | Depende do professor. Se `is_active = true` na assinatura, cobra |
| 21 | Badge "Mensalidade" em Financeiro.tsx | Como distinguir visualmente faturas de mensalidade? | Adicionar badge "Mensalidade" em faturas com `invoice_type = 'monthly_subscription'` |
| 22 | Detalhes de fatura de mensalidade pura | O que exibir se não houver aulas avulsas? | Exibir "Mensalidade - [Nome do Plano]" como descrição principal |
| 23 | Seção "Meu Plano" no StudentDashboard | Aluno precisa ver sua mensalidade? | Sim. Card informativo com: nome, valor, limite/uso de aulas. Apenas visualização |
| 24 | Indicador de mensalidade no PerfilAluno | Professor precisa ver rapidamente se aluno tem mensalidade? | Sim. Badge no cabeçalho do perfil mostrando nome do plano ativo |
| 27 | Filtro `invoice_type` em relatórios | Como filtrar faturas por tipo nos relatórios? | Adicionar opção "Tipo" com valores: "Todas", "Mensalidade", "Aula Avulsa" |
| 29 | Auditoria de aulas excedentes | Como registrar aulas cobradas além do limite? | Descrição da fatura inclui "Mensalidade + X aulas excedentes". Aulas excedentes registradas em `invoice_classes` com `item_type = 'overage'` |
| 30 | RLS para alunos verem suas mensalidades | Aluno pode ver detalhes da própria mensalidade? | Sim. Política de SELECT em `student_monthly_subscriptions` onde `relationship_id` pertence ao aluno |
| 31 | Notificação de fatura de mensalidade | Como notificar aluno sobre fatura de mensalidade? | Reusar `send-invoice-notification` existente. A fatura já terá `description` adequada com nome do plano |
| 32 | Aluno ver detalhes da mensalidade | Aluno precisa ver nome, valor e limite da mensalidade? | Sim. RLS de SELECT em `monthly_subscriptions` para alunos vinculados (ver seção 3.5) |
| 33 | Fatura + dependentes na descrição | Fatura de família deve listar dependentes? | Sim. Description: "Mensalidade - Plano X (João, Maria)" incluindo nomes dos dependentes ativos |
| 34 | Timezone na contagem de aulas | Qual timezone usar para contar aulas do mês? | UTC (timezone do servidor). Contagem baseada em `class_date` no banco. Documentar para usuários |
| 35 | Mensalidade com valor R$ 0,00 | Gerar fatura para mensalidade gratuita? | **Não**. Mensalidades gratuitas NÃO geram fatura. Apenas registrar internamente para controle de limite |
| 36 | Reativação de mensalidade | Alunos são reativados automaticamente ao reativar mensalidade? | **Não**. Alunos NÃO são reativados automaticamente. Professor deve re-adicionar manualmente |
| 37 | Remover aluno individual da mensalidade | Como remover um aluno sem desativar a mensalidade toda? | Permitir soft delete (`is_active = false`) por aluno individual via interface de edição |
| 38 | Proteção contra faturas duplicadas | Como evitar gerar duas faturas de mensalidade no mesmo mês? | Verificar existência de fatura `invoice_type = 'monthly_subscription'` para mesmo aluno/mês antes de criar |
| 39 | Integração com relatórios financeiros | Relatórios devem distinguir receita de mensalidades? | Sim. Incluir coluna "Tipo" em `Financeiro.tsx`. Filtrar por `invoice_type` nos relatórios |
| 40 | SQL de contagem inconsistente no Apêndice | Função no Apêndice A não exclui aulas experimentais | Corrigido: adicionado `c.is_experimental = false` na função `count_completed_classes_in_month` do Apêndice A |
| 41 | Filtro `is_active` no faturamento | Verificar se aluno tem mensalidade ativa ou aulas não faturadas | Verificar `sms.is_active = true AND ms.is_active = true` antes de processar. Se ambos false, usar fluxo por aula |
| 42 | Valor mínimo para boleto com mensalidade gratuita | Mensalidade R$ 0 + excedentes < valor mínimo do boleto (ex: R$ 5) | Se valor total < R$ 5, não gerar boleto. Registrar internamente como "cortesia" ou acumular para próximo ciclo |
| 43 | Badge "Mensalidade" em `Financeiro.tsx` | Como distinguir visualmente faturas de mensalidade? | Verificar `invoice_type === 'monthly_subscription'` e exibir badge colorido "Mensalidade" |
| 44 | Query `invoice_classes` para mensalidades puras | INNER JOIN falha se mensalidade não tiver aulas avulsas | Alterar para LEFT JOIN em consultas que incluem `invoice_classes`. Mensalidade pura tem 0 registros em `invoice_classes` |
| 45 | Hook `useMonthlySubscriptions` | Implementação detalhada faltando | Seção 6.4 adicionada com implementação completa usando react-query |
| 46 | Zod schema para formulário de mensalidade | Validação frontend estruturada faltando | Seção 6.5 adicionada com schema completo incluindo validação condicional de `maxClasses` |
| 47 | Distinção de `invoice_type` em relatórios | Como diferenciar `automated` vs `monthly_subscription`? | `automated` = fatura gerada automaticamente por aula. `monthly_subscription` = fatura de mensalidade fixa. Filtros separados nos relatórios |
| 48 | RLS faltante em `monthly_subscriptions` para alunos | Alunos não conseguem ver detalhes da própria mensalidade | Política SELECT adicionada no Apêndice A para alunos via `student_monthly_subscriptions` |
| 49 | Contagem de aulas de dependentes em meses diferentes | Dependente adicionado no meio do mês, como contar? | `count_completed_classes_in_month` já usa `class_date` para filtrar. Dependente adicionado = suas aulas daquele mês contam normalmente |
| 50 | Mensalidade + aluno sem `business_profile_id` | Aluno com mensalidade mas sem perfil de negócio configurado | Logar warning e pular faturamento. Exigir `business_profile_id` no relacionamento antes de atribuir mensalidade |
| 51 | Componente de progresso no `PerfilAluno.tsx` | Exibir "X/Y aulas usadas" para alunos com limite | Adicionar barra de progresso ou indicador textual usando dados de `get_student_subscription_details` |
| 52 | Retry de fatura de mensalidade falha | Como reprocessar faturas que falharam? | Logar erro detalhado. Permitir reprocessamento manual via botão em `Financeiro.tsx` (chamar `automated-billing` com flag `force`) |
| 53 | Badge de tipo inconsistente em `Financeiro.tsx` | Faturas `monthly_subscription` exibem "Regular" ao invés de "Mensalidade" | Atualizar função `getInvoiceTypeBadge` para mapear `monthly_subscription` → badge "Mensalidade" com cor distinta (ex: `bg-purple-100 text-purple-800`) |
| 54 | Query `invoice_classes` com INNER JOIN | Consulta em `Financeiro.tsx` usa INNER JOIN e falha para mensalidades puras | **Consolidado com #44**: Alterar para `LEFT JOIN invoice_classes` em todas as queries |
| 55 | Registro "base de mensalidade" em `invoice_classes` | Mensalidades puras não têm registros em `invoice_classes` | Criar registro `item_type = 'monthly_base'` com `class_id = NULL` e `participant_id = NULL` para auditoria |
| 56 | Constraint NOT NULL em `invoice_classes.class_id` | Impede criar `item_type = 'monthly_base'` sem aula | Alterar tabela: `ALTER TABLE invoice_classes ALTER COLUMN class_id DROP NOT NULL; ALTER TABLE invoice_classes ALTER COLUMN participant_id DROP NOT NULL;` |
| 57 | RPC `create_invoice_and_mark_classes_billed` incompatível | Função espera `class_id` e `participant_id` obrigatórios | Adaptar função para aceitar NULL quando `item_type = 'monthly_base'`. Criar versão v2 ou sobrecarga |
| 58 | Campo `dependent_id` em `invoice_classes` | Código de faturamento usa `dependent_id` mas não existe na tabela atual | **✅ RESOLVIDO**: Campo `dependent_id` já existe em `invoice_classes` conforme schema atual |
| 59 | Regra de corte por data `starts_at` | Aulas realizadas antes de `starts_at` devem ser cobradas como? | Aulas anteriores a `starts_at` são cobradas por aula (fluxo tradicional). Mensalidade só cobre aulas a partir de `starts_at` |
| 60 | RLS duplicada em `monthly_subscriptions` | Duas políticas similares no Apêndice A | Remover duplicata. Manter apenas uma política "Alunos podem ver suas mensalidades" em `monthly_subscriptions` |
| 61 | Coluna `monthly_subscription_id` não existe em `invoices` | Documento referencia coluna que não existe no banco atual | Executar migration: `ALTER TABLE public.invoices ADD COLUMN monthly_subscription_id UUID REFERENCES public.monthly_subscriptions(id);` |
| 62 | Badge de tipo incompleto em `Financeiro.tsx` | Falta tratamento específico para `monthly_subscription` e `automated` | Adicionar cases para todos os `invoice_type` no componente de badge |
| 63 | Constraint `class_id NOT NULL` em `invoice_classes` | Banco atual tem constraint NOT NULL que impede registros de mensalidade | Migration necessária: `ALTER TABLE invoice_classes ALTER COLUMN class_id DROP NOT NULL;` |
| 64 | Tabelas `monthly_subscriptions` e `student_monthly_subscriptions` não existem | Documento descreve tabelas que ainda não foram criadas no banco | **PRÉ-REQUISITO**: Executar SQL do Apêndice A antes de implementar qualquer código |
| 65 | Arquivo `src/types/monthly-subscriptions.ts` não existe | Documento referencia interfaces TypeScript de arquivo inexistente | Criar arquivo com interfaces: `MonthlySubscription`, `StudentMonthlySubscription`, `MonthlySubscriptionFormData`, etc. |
| 66 | Hook `useMonthlySubscriptions` não existe | Documento contém implementação mas arquivo não foi criado | Criar `src/hooks/useMonthlySubscriptions.ts` conforme seção 6.4 |
| 67 | Schema Zod `monthlySubscriptionSchema` não existe | Documento contém schema mas arquivo não foi criado | Criar `src/schemas/monthly-subscription.schema.ts` conforme seção 6.5 |
| 68 | Namespace i18n `subscriptions` não existe | Documento referencia traduções em namespace inexistente | Criar `src/i18n/locales/pt/subscriptions.json` e `src/i18n/locales/en/subscriptions.json`, registrar em `src/i18n/index.ts` |
| 69 | Componente `MonthlySubscriptionsManager` não existe | Documento referencia componente inexistente | Criar `src/components/MonthlySubscriptionsManager.tsx` |
| 70 | Query `invoice_classes` com INNER JOIN em `Financeiro.tsx` | **Consolidado com #44 e #54**: Mesma correção de LEFT JOIN | Alterar para LEFT JOIN conforme solução em #44 |
| 71 | Dashboard aluno sem "Meu Plano" | Não há implementação de seção mostrando mensalidade do aluno | Adicionar card "Meu Plano" em `StudentDashboard.tsx` usando RPC `get_student_subscription_details` |
| 72 | RPC `create_invoice_and_mark_classes_billed` incompatível com mensalidades | Função requer `class_id` e `participant_id`, incompatível com `item_type = 'monthly_base'` | **Consolidado com #57**: Criar função v2 ou adaptar para aceitar NULL |
| 73 | Numeração de seções duplicada no sumário | Linhas 35-37 repetem seções 6.1, 6.2, 6.3 | Remover linhas duplicadas do sumário |
| 74 | Seção Frontend e Backend ambas numeradas como "6" | Numeração incorreta no corpo do documento | Renumerar: Frontend = 6, Backend = 7, i18n = 8, etc. |
| 75 | Subseção 5.3.1 dentro de 6.5 | `#### 5.3.1 Servicos.tsx` aparece após seção 6.5 | Mover para `### 6.6 Alterações em Servicos.tsx` |
| 76 | Query `!inner` em `Financeiro.tsx` para detalhes | `classes!inner` e `class_participants!inner` falham para mensalidades puras | Alterar para LEFT JOIN nas queries de detalhes de fatura |
| 77 | `automated-billing` não verifica mensalidades ativas | Código atual usa `get_unbilled_participants_v2` sem verificar mensalidade | Adicionar verificação de `get_student_active_subscription` antes do processamento |
| 78 | Conflito `invoice_type: 'automated'` vs `'monthly_subscription'` | `automated-billing` usa `invoice_type: 'automated'` mas documento propõe `'monthly_subscription'` | Distinguir: `automated` = por aula automático, `monthly_subscription` = mensalidade fixa |
| 79 | Função `get_student_subscription_details` não existe | Documentada no Apêndice A mas não existe no banco atual | Incluir na migration do Apêndice A (já está no documento) |
| 80 | StudentDashboard sem seção "Meu Plano" | **Consolidado com #71**: Mesma implementação necessária | Adicionar card informativo usando `get_student_subscription_details` |
| 81 | Função `count_completed_classes_in_month` não existe | Usada no pseudocódigo mas não existe no banco atual | Incluir na migration do Apêndice A (já está no documento) |
| 109 | `InvoiceStatusBadge.tsx` não trata `invoice_type` | Componente exibe status de pagamento mas não distingue faturas de mensalidade | Adicionar prop `invoiceType?: string \| null` e exibir badge "Mensalidade" quando `invoice_type = 'monthly_subscription'` |
| 110 | Conflito de namespace i18n `subscription.json` | Arquivo `subscription.json` já existe para assinaturas do PROFESSOR (planos da plataforma) | **Decisão**: Criar `monthlySubscriptions.json` para mensalidades de ALUNOS. Manter `subscription.json` intacto |
| 111 | Namespace `notifications` declarado mas arquivos não existem | `i18n/index.ts` declara namespace mas arquivos PT/EN não existem | **Bug existente**: Remover do array `ns` ou criar arquivos `notifications.json` |
| 112 | `src/types` sem estrutura para tipos de mensalidade | Documento referencia `src/types/monthly-subscriptions.ts` mas diretório só tem `cookie-consent.d.ts` | Criar arquivo `src/types/monthly-subscriptions.ts` com interfaces |
| 113 | `Servicos.tsx` é wrapper simples sem Tabs | Componente atual apenas renderiza `<ClassServicesManager />` diretamente | Modificar para usar `Tabs` conforme seção 6.6.2 |
| 114 | `business_profile_id` nullable em `teacher_student_relationships` | Campo é nullable no schema atual | Validar existência antes de criar fatura com mensalidade; logar warning se null |
| 115 | Nenhuma função SQL de mensalidade existe no banco | Funções `get_student_active_subscription`, `count_completed_classes_in_month`, etc. não existem | **PRÉ-REQUISITO**: Executar migration do Apêndice A antes de implementar código |
| 116 | Confirmado: `invoice_classes.class_id` é NOT NULL | Constraint impede `item_type = 'monthly_base'` sem aula vinculada | Executar: `ALTER TABLE invoice_classes ALTER COLUMN class_id DROP NOT NULL;` |
| 117 | Confirmado: `invoice_classes.participant_id` é NOT NULL | Constraint impede `item_type = 'monthly_base'` sem participante vinculado | Executar: `ALTER TABLE invoice_classes ALTER COLUMN participant_id DROP NOT NULL;` |
| 118 | `regular` não existe como valor de `invoice_type` no banco | Valores encontrados no banco: apenas `'automated'` e `'manual'` | **CORREÇÃO**: Remover `'regular'` da documentação; usar apenas `automated`, `manual`, `monthly_subscription` |
| 119 | Confirmado: INNER JOIN em `Financeiro.tsx` linhas 276-283 | `classes!inner` e `class_participants!inner` falharão para mensalidades puras | **Consolidado com #44, #54, #70**: Alterar para LEFT JOIN |
| 120 | Regeneração de tipos TypeScript não documentada | Após migrations, tipos devem ser regenerados para refletir novas tabelas | Adicionar ao checklist de deploy: `npx supabase gen types typescript --project-id=<ID> > src/integrations/supabase/types.ts` |
| 82 | Todas as funções SQL de mensalidade não existem | Funções documentadas não foram criadas no banco | **PRÉ-REQUISITO**: Executar SQL do Apêndice A para criar todas as funções |
| 83 | Seção Backend numerada incorretamente | "## 6. Implementação Backend" deveria ser "## 7" | Corrigir numeração para manter sequência (Frontend=6, Backend=7) |
| 84 | Referência circular no histórico de revisões | Menciona correções de numeração mas inconsistências persistem | Aplicar correções definitivas nesta revisão (v1.6) |
| 85 | Diretório `src/schemas` não existe | Documento referencia `src/schemas/monthly-subscription.schema.ts` mas diretório não existe | Criar diretório `src/schemas` antes de criar o arquivo |
| 86 | `invoice_type` não tem valor `monthly_subscription` documentado | `types.ts` define como `string \| null` sem constraint; banco só tem `automated` e `manual` | Documentar `monthly_subscription` como valor aceito; considerar constraint futura |
| 87 | Coluna `monthly_subscription_id` não existe em `invoices` | Confirmado via query direta ao banco que coluna não existe | Executar migration do Apêndice A |
| 88 | `invoice_classes.class_id` é NOT NULL | Confirmado via banco; impede criar `item_type = 'monthly_base'` | Migration: `ALTER TABLE invoice_classes ALTER COLUMN class_id DROP NOT NULL;` |
| 89 | `invoice_classes.participant_id` é NOT NULL | Confirmado via banco; impede criar `item_type = 'monthly_base'` | Migration: `ALTER TABLE invoice_classes ALTER COLUMN participant_id DROP NOT NULL;` |
| 90 | Mensalidade R$0 com excedentes | Se `price = 0` mas há aulas excedentes, gerar fatura apenas com excedentes | Regra: `total = max(0, excedentes * overage_price)`; se zero, não gerar fatura |
| 91 | Comportamento de `starts_at` no faturamento | Aulas antes de `starts_at` devem usar fluxo por aula ou mensalidade? | Regra: antes de `starts_at` = por aula; a partir de `starts_at` = mensalidade |
| 92 | Múltiplos professores com mensalidades para mesmo aluno | `StudentDashboard` precisa listar múltiplas mensalidades | Exibir cards por professor com nome do professor visível |
| 93 | Cancelamento de mensalidade no meio do mês | Se cancelado antes do `billing_day`, não cobrar; se após, já foi cobrado | Regra documentada na seção 5.6 |
| 94 | `getInvoiceTypeBadge` em `Financeiro.tsx` | Verificar se função existe e implementa `monthly_subscription` | Criar/atualizar função para mapear todos os `invoice_type` |
| 95 | `get_student_subscription_details` RPC consistência | Garantir que função no Apêndice A está completa e consistente com seção 3.4 | Verificar e consolidar |
| 96 | `update_updated_at_column` trigger function | Usada em triggers do Apêndice A; verificar existência no banco | ✅ Existe no banco atual (confirmado via schema) |
| 97 | Função `getInvoiceTypeBadge` não existe em `Financeiro.tsx` | Documento referencia função que não existe no código atual | Criar função ou adicionar lógica inline para mapear `invoice_type` → badge (incluindo `monthly_subscription` → "Mensalidade" com cor roxa) |
| 98 | `Servicos.tsx` é componente simples, alterações devem ir em `ClassServicesManager` | Documento propõe alterações em `Servicos.tsx` mas lógica principal está em `ClassServicesManager.tsx` | Atualizar seção 6.6 para referenciar `ClassServicesManager.tsx` como local de implementação |
| 99 | Conflito namespace i18n: `subscription.json` vs `subscriptions.json` | Documento propõe `subscriptions.json` (plural) mas já existe `subscription.json` (singular) | Decisão: usar namespace existente `subscription.json` ou criar novo `subscriptions.json`. Documentar escolha |
| 100 | Valores de `invoice_type` no banco incompletos | Apenas `automated` e `manual` existem oficialmente; `regular` usado como default em código | Documentar todos os valores válidos: `automated`, `manual`, `regular`, `monthly_subscription` |
| 101 | Rollback script incompleto | Script de rollback não removia triggers e funções de trigger | ✅ CORRIGIDO: Adicionado `DROP TRIGGER` e `DROP FUNCTION` para triggers de mensalidade no Apêndice B |
| 102 | RLS policy com nome duplicado em duas tabelas | Mesma política "Alunos podem ver suas mensalidades" em `monthly_subscriptions` e `student_monthly_subscriptions` | ✅ CORRIGIDO: Renomeada em `student_monthly_subscriptions` para "Alunos podem ver seus vínculos de mensalidade" |
| 103 | `StudentDashboard` sem infraestrutura para múltiplos professores | Card "Meu Plano" proposto não suporta múltiplos professores com mensalidades | Implementar seção "Meus Planos" com cards múltiplos conforme exemplo em 5.6.3 |
| 104 | SQL de `DROP NOT NULL` disperso no documento | Alterações em `invoice_classes.class_id` e `participant_id` aparecem em vários lugares | ✅ CORRIGIDO: Consolidado em seção 0.2 do Apêndice A (Alterações pré-requisito) |
| 105 | Validação de `business_profile_id` sem implementação concreta | Documento menciona exigir `business_profile_id` antes de atribuir mensalidade | Adicionar validação no hook `useAssignStudentToSubscription` ou na criação de mensalidade |
| 106 | Placeholders de data no histórico de revisões | Datas como "2025-01-XX" são placeholders não substituídos | ✅ CORRIGIDO: Substituído por "2025-01-01" (data estimada) |
| 107 | Valor mínimo de boleto não definido oficialmente | Seção 5.6.5 não definia constante oficial | ✅ CORRIGIDO: Definido `MIN_BOLETO_VALUE = 5.00` (R$ 5,00) como valor padrão |
| 108 | `ClassServicesManager.tsx` não referenciado no documento | Componente existente que gerencia serviços não era mencionado | ✅ CORRIGIDO: Seção 6.6 atualizada para referenciar `ClassServicesManager.tsx` |
| 109 | InvoiceStatusBadge.tsx sem invoice_type | Componente não tem prop para tipo de fatura | ✅ CORRIGIDO v1.9: Adicionada prop `invoiceType` na seção 6.3.1 |
| 110 | Conflito namespace i18n | `subscription.json` existe para professor; documento sugere `subscriptions.json` | ✅ CORRIGIDO v1.9: Decisão documentada em seção 8.0 - usar `monthlySubscriptions.json` |
| 111 | Bug namespace `notifications` | Declarado em `i18n/index.ts` mas arquivos não existem | Documentado em seção 8.0. Remover do array `ns` ou criar arquivos |
| 112 | `src/types` sem estrutura | Falta `monthly-subscriptions.ts` | Criar arquivo com interfaces conforme seção 5.1 |
| 113 | `Servicos.tsx` wrapper simples | Apenas renderiza `ClassServicesManager`, sem Tabs | Adicionar Tabs conforme seção 6.6.2 |
| 114 | `business_profile_id` nullable | Em `teacher_student_relationships`, não há validação obrigatória | Logar warning e pular faturamento se NULL |
| 115 | Funções SQL inexistentes | `get_student_active_subscription`, etc. não existem no banco | PRÉ-REQUISITO: Executar migration do Apêndice A |
| 116 | `invoice_classes.class_id` NOT NULL | Confirmado via banco: constraint impede `monthly_base` | Migration: `ALTER COLUMN class_id DROP NOT NULL` |
| 117 | `invoice_classes.participant_id` NOT NULL | Confirmado via banco: constraint impede `monthly_base` | Migration: `ALTER COLUMN participant_id DROP NOT NULL` |
| 118 | `regular` não existe no banco | Apenas `automated` e `manual` em `invoice_type` | ✅ CORRIGIDO v1.9: Removido `regular` do documento |
| 119 | INNER JOIN em `Financeiro.tsx` | Confirmado linhas 276-283: `classes!inner`, `class_participants!inner` | Alterar para LEFT JOIN |
| 120 | Regeneração tipos não documentada | Após migrations, tipos TypeScript ficam desatualizados | ✅ CORRIGIDO v1.9: Adicionado ao Apêndice B |
| 121 | Namespace inconsistente em exemplos de código | Exemplos usam `useTranslation('subscriptions')` ao invés de `'monthlySubscriptions'` | ✅ CORRIGIDO v1.10: Todos os exemplos atualizados |
| 122 | Hook `useStudentSubscriptionAssignment` sem implementação | Listado em 6.1 mas sem código documentado | ✅ CORRIGIDO v1.10: Adicionada seção 6.4.1 com hooks `useAvailableStudentsForSubscription` e `useBulkAssignStudents` |
| 123 | Tabs em Servicos.tsx vs ClassServicesManager | Alguns lugares dizem "Tabs em ClassServicesManager" | ✅ CORRIGIDO v1.10: Clarificado que Tabs vão em `Servicos.tsx`, `ClassServicesManager` permanece inalterado |
| 124 | Diagrama ASCII em 5.6.3 | Inconsistente com padrão Mermaid usado no documento | Baixa prioridade: ASCII mais legível para UI mockup |
| 125 | `billing_day` nullable sem fallback documentado | Em `teacher_student_relationships`, fallback não explícito | Já tratado: `COALESCE(billing_day, default_billing_day, 5)` em SQL |
| 126 | Tipos TypeScript para novas tabelas | `types.ts` não inclui `monthly_subscriptions` | PRÉ-REQUISITO: Regenerar após migration |
| 127 | Zero referências a `monthly_subscription` | Nenhum arquivo referencia as novas tabelas | ✅ ESPERADO: É PRÉ-REQUISITO, código será criado |
| 128 | StudentDashboard sem "Meus Planos" | Seção 6.3.3 documenta mas implementação não existe | PRÉ-REQUISITO: Criar após migration |
| 129 | Namespace `password` em i18n | Verificar registro em `i18n/index.ts` | Não relacionado a mensalidades |
| 130 | Validação `overagePrice` quando `hasLimit = false` | `overagePrice` deve ser `null` se não tem limite | ✅ CORRIGIDO v1.10: Adicionada validação no Zod schema (seção 6.5) e hooks (seção 6.4) |
| 131 | Datas inconsistentes no histórico | v1.0-v1.2 com datas estimadas | Mantido: datas retroativas para consistência |
| 132 | Versão Apêndice A desincronizada | Apêndice dizia "Versão 1.6" | ✅ CORRIGIDO v1.10: Sincronizado para v1.10 |
| 133 | Mapeamento `invoice_type` incompleto em `Financeiro.tsx` | Código atual mapeia apenas 2 tipos, não inclui `monthly_subscription` | ✅ CORRIGIDO v1.11: Adicionado exemplo completo de `getInvoiceTypeBadge` na seção 6.3.2.1 |
| 134 | `invoices.monthly_subscription_id` não existe | Confirmado via banco: coluna não existe em `invoices` | **Confirmado via banco**: Migration obrigatória do Apêndice A |
| 135 | Constraints NOT NULL em `invoice_classes` | Confirmado via banco: `class_id` e `participant_id` são NOT NULL | **Confirmado via banco**: Executar `ALTER COLUMN ... DROP NOT NULL` |
| 136 | Arquivos `monthlySubscriptions.json` não criados | Confirmado via código: arquivos PT/EN não existem | **Confirmado via código**: Criar arquivos conforme seção 8 |
| 137 | Namespace `monthlySubscriptions` não registrado | Confirmado via código: `i18n/index.ts` não importa namespace | **Confirmado via código**: Adicionar imports e registrar namespace |
| 138 | `InvoiceStatusBadge.tsx` sem prop `invoiceType` | Confirmado via código: componente não tem prop | **Confirmado via código**: Implementar conforme seção 6.3.1 |
| 139 | Diretório `src/schemas` não existe | Confirmado via código: diretório ausente | **Confirmado via código**: Criar diretório antes de arquivos |
| 140 | `src/types` sem `monthly-subscriptions.ts` | Confirmado via código: apenas `cookie-consent.d.ts` existe | **Confirmado via código**: Criar arquivo de tipos |
| 141 | Zero componentes de mensalidade implementados | Nenhum `MonthlySubscription*` encontrado no código | **Confirmado via código**: Todos os componentes são PRÉ-REQUISITO |
| 142 | `default_billing_day` nullable em `profiles` | Campo nullable, mas SQL já usa `COALESCE(..., 5)` | ✅ OK: Fallback para 5 já implementado nas funções SQL |
| 143 | Datas no histórico de revisões | v1.0-v1.2 usam "2025-01-01" como data estimada | ✅ OK: Consistente com data de criação do documento |
| 144 | Seção 6.1 usa nome antigo `subscriptions.json` | Estrutura de arquivos mostra `subscriptions.json` ao invés de `monthlySubscriptions.json` | ✅ CORRIGIDO v1.11: Atualizado para `monthlySubscriptions.json` |
| 145 | **ERRO CRÍTICO**: `'regular'` É valor DEFAULT de `invoice_type` | v1.9 afirmou incorretamente que `'regular'` não existe | **CORRIGIDO v1.12**: `'regular'` é DEFAULT válido no banco (`status text NOT NULL DEFAULT 'regular'::text`). Revertido erro. |
| 146 | `password.json` órfão em locales | Arquivos PT/EN existem mas namespace não registrado em `i18n/index.ts` | ⚠️ Bug existente (não relacionado a mensalidades): Registrar imports ou remover arquivos |
| 147 | Ponta solta #129 correta | Verificação do namespace password não é relacionada a mensalidades | ✅ OK: Fora do escopo deste documento |
| 148 | `automated-billing/index.ts` sem verificação de mensalidade | Edge function não verifica se aluno tem mensalidade ativa | **PRÉ-REQUISITO**: Adicionar verificação antes do processamento por aula |
| 149 | Contradição em seção 6.1 sobre `ClassServicesManager.tsx` | Seção 6.1 diz "MODIFICAR: Mover para dentro de Tabs", mas seções 6.6 e 4.2 dizem manter inalterado | ✅ CORRIGIDO v1.12: Atualizada seção 6.1 para consistência |
| 150 | `invoice_type` sem CHECK constraint no banco | Campo é TEXT sem validação, qualquer valor é aceito | ⚠️ Considerar adicionar CHECK constraint em versão futura |
| 151 | Referências de linha desatualizadas para INNER JOIN | Documento menciona linhas específicas que podem ter mudado | ⚠️ Ignorar referências de linha; usar busca textual |
| 152 | Apêndice A versão desincronizada | Apêndice A não tinha cabeçalho de versão explícito | ✅ CORRIGIDO v1.12: Histórico atualizado para v1.12 |
| 153 | `password.json` verificação EN | Arquivo EN confirmado existente via contexto fornecido | ✅ OK: Ambos PT e EN existem |
| 154 | `pending_amount` referenciado mas coluna não existe | Seção 5.6.5 menciona `pending_amount` em `teacher_student_relationships` | **Documentado v1.12**: Coluna não existe; simplificar para MVP ou criar migration futura |
| 155 | **ERRO**: Remoção de `'regular'` na v1.9 foi incorreta | `'regular'` é valor DEFAULT válido de `invoice_type` | **CORRIGIDO v1.12**: Revertido. `'regular'` adicionado de volta à documentação. |
| 156 | Confirmação final: `monthly_subscription_id` não existe | Verificado via banco: coluna não existe em `invoices` | ✅ Confirmado: Migration do Apêndice A é obrigatória |
| 157 | Namespace `notifications` órfão em `i18n/index.ts` | Linha 118 declara `'notifications'` no array `ns`, mas não há import correspondente (linhas 1-48) e arquivos `notifications.json` não existem em PT/EN | ⚠️ Bug existente (não relacionado a mensalidades): Remover `'notifications'` do array `ns` ou criar imports e arquivos |
| 158 | `password.json` órfão sem registro no namespace | Arquivos existem em `locales/pt/password.json` e `locales/en/password.json`, mas não há imports ou registro no objeto `resources` de `i18n/index.ts` | ⚠️ Bug existente (não relacionado a mensalidades): Adicionar imports e registrar no namespace |
| 159 | Confirmação adicional: `'regular'` é DEFAULT de `invoice_type` | Query direta ao banco confirma: `status text NOT NULL DEFAULT 'regular'::text` | ✅ Confirmado via banco - query direta |
| 160 | Valores de `invoice_type` USADOS no banco | Apenas `'automated'` e `'manual'` encontrados em registros reais; `'regular'` é DEFAULT mas não usado explicitamente | ✅ Confirmado via banco - valores de uso vs. default |
| 161 | Apêndice A versão desatualizada | Cabeçalho SQL diz "Versão 1.10", documento é v1.12 (agora v1.13) | ✅ CORRIGIDO v1.13: Sincronizado para v1.13 |
| 162 | `invoice_classes.class_id` ainda é NOT NULL | Confirmado via banco: constraint existe, impede `monthly_base` | ✅ Confirmado via banco - PRÉ-REQUISITO: Executar migration |
| 163 | `invoice_classes.participant_id` ainda é NOT NULL | Confirmado via banco: constraint existe, impede `monthly_base` | ✅ Confirmado via banco - PRÉ-REQUISITO: Executar migration |
| 164 | Arquivos `monthlySubscriptions.json` não existem | Confirmado via listagem: arquivos PT/EN não criados | ✅ Confirmado via código - PRÉ-REQUISITO: Criar arquivos |
| 165 | Query INNER JOIN em `Financeiro.tsx` confirmada | `classes!inner` e `class_participants!inner` existem e falharão para mensalidades puras | ✅ Confirmado via código - Alterar para LEFT JOIN |
| 166 | Interface `InvoiceWithStudent` sem `monthly_subscription_id` | Interface atual em `Financeiro.tsx` não inclui campo para mensalidade | **Documentado v1.13**: Adicionar `monthly_subscription_id?: string; monthly_subscription?: { name: string; };` |
| 167 | Seção 6.3.2 sugere JOIN com `monthly_subscriptions` inexistente | Query exemplo faz `monthly_subscriptions(name)` mas tabela não existe ainda | **Documentado v1.13**: Adicionada nota sobre PRÉ-REQUISITOS |
| 168 | Filtro por `invoice_type` não implementado em relatórios | `Financeiro.tsx` não oferece opção de filtrar faturas por tipo | ⚠️ Funcionalidade futura: Adicionar dropdown de filtro após implementação |

---

## 4.1 Estado Atual vs. Planejado

Esta seção documenta o gap entre o estado atual do projeto e o que está planejado neste documento.

### Tabela Comparativa

| Item | Status Atual | Ação Necessária |
|------|--------------|-----------------|
| Tabela `monthly_subscriptions` | ❌ Não existe | Executar migration do Apêndice A |
| Tabela `student_monthly_subscriptions` | ❌ Não existe | Executar migration do Apêndice A |
| Coluna `invoices.monthly_subscription_id` | ❌ Não existe | Executar migration do Apêndice A |
| Constraint `invoice_classes.class_id NOT NULL` | ⚠️ Existe (impede mensalidades) | Executar: `ALTER TABLE invoice_classes ALTER COLUMN class_id DROP NOT NULL;` |
| Constraint `invoice_classes.participant_id NOT NULL` | ⚠️ Existe (impede mensalidades) | Executar: `ALTER TABLE invoice_classes ALTER COLUMN participant_id DROP NOT NULL;` |
| Coluna `invoice_classes.dependent_id` | ✅ Existe | Nenhuma |
| Arquivo `src/types/monthly-subscriptions.ts` | ❌ Não existe | Criar arquivo |
| Hook `src/hooks/useMonthlySubscriptions.ts` | ❌ Não existe | Criar arquivo |
| Schema `src/schemas/monthly-subscription.schema.ts` | ❌ Não existe | Criar arquivo |
| Namespace i18n `subscriptions` | ❌ Não existe | Criar arquivos PT/EN, registrar namespace |
| Componente `MonthlySubscriptionsManager` | ❌ Não existe | Criar componente |
| Componente `MonthlySubscriptionModal` | ❌ Não existe | Criar componente |
| Badge "Mensalidade" em `Financeiro.tsx` | ❌ Não implementado | Adicionar case para `monthly_subscription` |
| Query `!inner` em `Financeiro.tsx` | ⚠️ Usa INNER JOIN | Alterar para LEFT JOIN em queries de detalhes |
| `automated-billing` verifica mensalidade | ❌ Não implementado | Adicionar verificação antes do processamento |
| Funções SQL de mensalidade | ❌ Nenhuma existe | Executar migration do Apêndice A |
| `StudentDashboard` seção "Meu Plano" | ❌ Não existe | Criar card informativo com dados da mensalidade |
| Numeração do sumário | ✅ Corrigido | v1.6 |
| Numeração de seções no corpo | ✅ Corrigido | v1.6 |
| Subseção 5.3.1 mal posicionada | ✅ Movida para 6.6 | v1.6 |
| Seção "Meu Plano" em `StudentDashboard.tsx` | ❌ Não implementado | Adicionar card com RPC |
| Query LEFT JOIN em `Financeiro.tsx` | ⚠️ Usa INNER JOIN | Alterar para LEFT JOIN |
| RPC `create_invoice_and_mark_classes_billed` | ⚠️ Requer class_id/participant_id | Adaptar ou criar v2 |
| Funções SQL do Apêndice A | ❌ Não existem | Executar migration |
| Diretório `src/schemas` | ❌ Não existe | Criar diretório antes do arquivo |
| Valores de `invoice_type` no banco | ⚠️ Apenas `automated`, `manual` | Documentar `monthly_subscription` |
| Regras de cobrança para cenários específicos | ✅ Documentadas | Ver seção 5.6 |
| Função `update_updated_at_column` | ✅ Existe | Verificado via schema |
| Função `getInvoiceTypeBadge` em `Financeiro.tsx` | ❌ Não existe | Criar função com cases para todos os tipos |
| Referência a `ClassServicesManager.tsx` | ✅ Documentado | Seção 6.6 atualizada |
| Conflito namespace i18n (subscription vs subscriptions) | ✅ CORRIGIDO v1.9 | Decisão: criar `monthlySubscriptions.json` para alunos, manter `subscription.json` para professores |
| Rollback script com triggers | ✅ Completo | Apêndice B atualizado com DROP TRIGGER/FUNCTION |
| RLS policy com nome único por tabela | ✅ Corrigido | Renomeada policy em `student_monthly_subscriptions` |
| SQL DROP NOT NULL consolidado | ✅ Consolidado | Seção 0.2 do Apêndice A |
| `MIN_BOLETO_VALUE` definido | ✅ Definido | R$ 5,00 na seção 5.6.5 |
| `StudentDashboard` múltiplos professores | ❌ Não implementado | Seguir exemplo em 5.6.3 |
| Validação `business_profile_id` em mensalidades | ❌ Não implementado | Adicionar no hook de atribuição |
| `InvoiceStatusBadge.tsx` com prop `invoiceType` | ⚠️ Documentado | Implementação na seção 6.3.1 |
| Namespace i18n para mensalidades de alunos | ✅ CORRIGIDO v1.9 | Criar `monthlySubscriptions.json` (separado de `subscription.json`) |
| Bug: namespace `notifications` em `i18n/index.ts` | ⚠️ Bug existente | Remover do array `ns` ou criar arquivos |
| `regular` como valor de `invoice_type` | ✅ CORRIGIDO v1.12 | **REVERTIDO**: `'regular'` É valor DEFAULT válido. Erro da v1.9 corrigido. |
| Exemplos de código com namespace correto | ✅ CORRIGIDO v1.10 | Todos usam `useTranslation('monthlySubscriptions')` |
| Hook `useStudentSubscriptionAssignment` documentado | ✅ CORRIGIDO v1.10 | Seção 6.4.1 com `useAvailableStudentsForSubscription` e `useBulkAssignStudents` |
| Clarificação Tabs em Servicos.tsx | ✅ CORRIGIDO v1.10 | Seção 6.6.1 clarifica que Tabs vão em `Servicos.tsx`, não em `ClassServicesManager` |
| Validação `overagePrice` quando `hasLimit = false` | ✅ CORRIGIDO v1.10 | Adicionado `.transform()` no schema Zod e validação nos hooks |
| Versão do Apêndice A | ✅ CORRIGIDO v1.10 | Sincronizado para v1.10 |
| Mensagens i18n para remoção de alunos | ✅ CORRIGIDO v1.10 | Adicionadas `studentRemovedSuccess` e `studentsUpdatedSuccess` |
| Mapeamento `invoice_type` em `Financeiro.tsx` | ⚠️ Incompleto | ✅ CORRIGIDO v1.11: Exemplo de `getInvoiceTypeBadge` na seção 6.3.2.1 |
| Coluna `monthly_subscription_id` em `invoices` | ❌ Confirmado via banco | Migration obrigatória do Apêndice A |
| Arquivos `monthlySubscriptions.json` | ❌ Confirmados não existem | Criar arquivos PT e EN conforme seção 8 |
| Registro namespace em `i18n/index.ts` | ❌ Não registrado | Adicionar imports e namespace |
| Zero componentes de mensalidade | ❌ Confirmado via código | PRÉ-REQUISITO: Criar todos os componentes |
| Seção 6.1 usa `subscriptions.json` | ✅ CORRIGIDO v1.11 | Atualizado para `monthlySubscriptions.json` |
| Exemplo `getInvoiceTypeBadge` completo | ✅ CORRIGIDO v1.11 | Nova seção 6.3.2.1 com função de mapeamento |

### 4.2 Checklist de Pré-Implementação

Antes de iniciar o desenvolvimento, execute na ordem:

#### Fase 1: Banco de Dados (Obrigatório Primeiro)
- [ ] **Backup do banco** antes de qualquer alteração
- [ ] Executar SQL de criação de tabelas (`monthly_subscriptions`, `student_monthly_subscriptions`)
- [ ] Executar ALTER TABLE para `invoices` (adicionar `monthly_subscription_id`)
- [ ] Executar ALTER TABLE para `invoice_classes` (permitir NULL em `class_id`, `participant_id`)
- [ ] Criar funções SQL (`get_student_active_subscription`, `count_completed_classes_in_month`, etc.)
- [ ] Configurar RLS policies
- [ ] Criar triggers e índices
- [ ] **Regenerar tipos TypeScript** (`npx supabase gen types typescript`)

#### Fase 2: Arquivos TypeScript
- [ ] **Criar diretório `src/schemas`** (não existe atualmente)
- [ ] Criar `src/types/monthly-subscriptions.ts`
- [ ] Criar `src/hooks/useMonthlySubscriptions.ts` (conforme seção 6.4)
- [ ] **Criar `src/hooks/useStudentSubscriptionAssignment.ts`** (conforme seção 6.4.1 - hooks `useAvailableStudentsForSubscription`, `useBulkAssignStudents`)
- [ ] Criar `src/schemas/monthly-subscription.schema.ts` (inclui validação `overagePrice = null` quando `hasLimit = false`)
- [ ] Verificar função `getInvoiceTypeBadge` em `Financeiro.tsx` e adicionar case para `monthly_subscription`

#### Fase 3: Internacionalização
- [ ] **Decisão v1.10**: Criar `src/i18n/locales/pt/monthlySubscriptions.json` (nome final escolhido, separado de `subscription.json`) - **Confirmado v1.11: Arquivo não existe**
- [ ] Criar `src/i18n/locales/en/monthlySubscriptions.json` - **Confirmado v1.11: Arquivo não existe**
- [ ] **Registrar namespace** em `src/i18n/index.ts` (adicionar imports e registrar em `resources` e `ns`) - **Confirmado v1.11: Namespace não registrado**
- [ ] Registrar namespace `monthlySubscriptions` em `src/i18n/index.ts`
- [ ] **Bug**: Remover `notifications` do array `ns` em `i18n/index.ts` OU criar arquivos `notifications.json` faltantes
- [ ] **Verificar**: Todos os exemplos de código usam `useTranslation('monthlySubscriptions')` (✅ verificado v1.10)

#### Fase 4: Componentes
- [ ] Criar `MonthlySubscriptionsManager`
- [ ] Criar `MonthlySubscriptionCard`
- [ ] Criar `MonthlySubscriptionModal`
- [ ] Criar `StudentSubscriptionSelect`

#### Fase 5: Atualizações em Código Existente
- [ ] Atualizar `Servicos.tsx` (adicionar Tabs conforme seção 6.6.2 - **Tabs vão aqui, não em ClassServicesManager**)
- [ ] **Manter** `ClassServicesManager.tsx` inalterado (apenas gerencia serviços por aula)
- [ ] Atualizar `Financeiro.tsx` (badge de tipo, LEFT JOIN)
- [ ] Atualizar `StudentDashboard.tsx` (seção "Meus Planos" com múltiplos professores conforme 5.6.3)
- [ ] Atualizar `PerfilAluno.tsx` (badge/indicador de mensalidade)
- [ ] Atualizar `automated-billing/index.ts` (novo fluxo de faturamento)

#### Fase 6: Validações Finais
- [ ] Testar cenário: mensalidade R$0 com excedentes (deve gerar fatura apenas com excedentes)
- [ ] Testar cenário: aulas antes de `starts_at` (deve usar fluxo por aula)
- [ ] Testar cenário: múltiplos professores com mensalidades para mesmo aluno
- [ ] Testar cenário: cancelamento de mensalidade antes/depois do `billing_day`
- [ ] Verificar numeração sequencial de todas as seções do documento
- [ ] Testar queries de `Financeiro.tsx` com mensalidades puras (sem aulas)

---

## 5. Casos de Uso Adicionais

### 5.1 Interfaces TypeScript

```typescript
// ============================================
// ARQUIVO: src/types/monthly-subscriptions.ts
// ============================================

/**
 * Representa uma mensalidade criada pelo professor
 */
export interface MonthlySubscription {
  id: string;
  teacher_id: string;
  name: string;
  description: string | null;
  price: number;
  max_classes: number | null;
  overage_price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Representa o vínculo de um aluno a uma mensalidade
 */
export interface StudentMonthlySubscription {
  id: string;
  subscription_id: string;
  relationship_id: string;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Dados agregados (quando join)
  subscription?: MonthlySubscription;
  student?: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * Dados do formulário de criação/edição de mensalidade
 */
export interface MonthlySubscriptionFormData {
  name: string;
  description: string;
  price: number;
  hasLimit: boolean;
  maxClasses: number | null;
  overagePrice: number | null;
  selectedStudents: string[]; // relationship_ids
}

/**
 * Detalhes da mensalidade para o Dashboard do aluno
 * Retornado pela função get_student_subscription_details
 */
export interface StudentSubscriptionDetails {
  teacher_id: string;
  teacher_name: string;
  subscription_name: string;
  monthly_value: number;
  max_classes: number | null;
  overage_price: number | null;
  classes_used: number;
  classes_remaining: number | null;
  billing_day: number;
  starts_at: string;
}

/**
 * Mensalidade com contagem de alunos (para listagem)
 */
export interface MonthlySubscriptionWithCount extends MonthlySubscription {
  students_count: number;
}

/**
 * Aluno atribuído a uma mensalidade
 */
export interface AssignedStudent {
  assignment_id: string;
  relationship_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  starts_at: string;
  is_active: boolean;
}
```

### 5.2 Histórico de Mudanças na Mensalidade

Quando o professor edita uma mensalidade (valor, limite, etc.), as alterações entram em vigor **imediatamente**.

**Comportamento:**
- Faturas já emitidas NÃO são afetadas
- Próximo ciclo de faturamento usa os novos valores
- Opcional (fase futura): tabela `monthly_subscription_history` para auditoria completa

**Frontend:**
- Exibir aviso ao editar: "Alterações serão aplicadas a partir do próximo faturamento"

### 5.3 Mensalidades com Data de Início Futura

O campo `starts_at` em `student_monthly_subscriptions` pode ser configurado para uma data futura.

**Validações:**
- `starts_at` não pode ser no passado (exceto data atual)
- Função `get_student_active_subscription` já filtra `starts_at <= CURRENT_DATE`

**Comportamento:**
- Aluno aparece na lista de atribuídos com indicador "Inicia em DD/MM/YYYY"
- Cobrança só é ativada quando `starts_at <= CURRENT_DATE`

**SQL de validação (trigger opcional):**
```sql
CREATE OR REPLACE FUNCTION validate_subscription_starts_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.starts_at < CURRENT_DATE THEN
    -- Permitir apenas se for a data atual ou futura
    IF NEW.starts_at != CURRENT_DATE THEN
      RAISE EXCEPTION 'Data de início não pode ser no passado';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 5.4 Exclusão de Aulas Experimentais do Limite

Aulas marcadas como `is_experimental = true` **NÃO contam** para o limite de aulas (`max_classes`).

**Justificativa:**
- Aulas experimentais são "degustação" para novos alunos
- Não faz sentido consumir o pacote com aulas de teste

**Alteração na função `count_completed_classes_in_month`:**
```sql
CREATE OR REPLACE FUNCTION public.count_completed_classes_in_month(
  p_teacher_id UUID,
  p_student_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  p_month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(DISTINCT cp.id)::INTEGER
  FROM class_participants cp
  JOIN classes c ON c.id = cp.class_id
  LEFT JOIN dependents d ON d.id = cp.dependent_id
  WHERE c.teacher_id = p_teacher_id
    AND cp.status = 'concluida'
    AND c.is_experimental = false  -- NOVA CONDIÇÃO
    AND EXTRACT(YEAR FROM c.class_date) = p_year
    AND EXTRACT(MONTH FROM c.class_date) = p_month
    AND (
      cp.student_id = p_student_id
      OR d.responsible_id = p_student_id
    );
$$;
```

### 5.5 Soft Delete de Mensalidades

Mensalidades **nunca são deletadas** do banco de dados. Apenas **desativadas**.

**Regras:**
- Hard delete é proibido (remover opção do frontend)
- Ao "excluir", apenas `is_active = false`
- Mensalidades desativadas aparecem em seção "Arquivadas" (toggle no frontend)
- Mensalidades desativadas não aceitam novos alunos
- Alunos vinculados: `student_monthly_subscriptions.is_active = false` junto com a mensalidade

**Trigger para impedir hard delete:**
```sql
CREATE OR REPLACE FUNCTION prevent_monthly_subscription_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Exclusão de mensalidades não é permitida. Use desativação (is_active = false).';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_delete_monthly_subscriptions
BEFORE DELETE ON public.monthly_subscriptions
FOR EACH ROW EXECUTE FUNCTION prevent_monthly_subscription_delete();
```

**Comportamento de desativação em cascata:**
```sql
CREATE OR REPLACE FUNCTION deactivate_subscription_students()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE public.student_monthly_subscriptions
    SET is_active = false, updated_at = now()
    WHERE subscription_id = NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cascade_deactivate_subscription_students
AFTER UPDATE OF is_active ON public.monthly_subscriptions
FOR EACH ROW
WHEN (OLD.is_active = true AND NEW.is_active = false)
EXECUTE FUNCTION deactivate_subscription_students();
```

### 5.6 Regras de Cobrança Detalhadas

Esta seção documenta regras específicas para cenários de cobrança que requerem clareza.

#### 5.6.1 Mensalidade R$0 com Excedentes

**Cenário:** Professor cria mensalidade com `price = 0` e `max_classes = 4`, `overage_price = 50`.

**Regra:**
- Se aluno teve ≤ 4 aulas: **NÃO gerar fatura** (valor zero)
- Se aluno teve > 4 aulas: **Gerar fatura apenas com excedentes**
  - Exemplo: 6 aulas → fatura de R$ 100 (2 × R$ 50)

**Pseudocódigo:**
```typescript
const baseValue = subscription.price; // 0
const excedentes = Math.max(0, classesUsed - subscription.max_classes);
const excedenteValue = excedentes * subscription.overage_price;
const totalValue = baseValue + excedenteValue;

if (totalValue <= 0) {
  // Não gerar fatura, apenas registrar internamente
  return null;
}
```

#### 5.6.2 Transição de `starts_at` no Faturamento

**Cenário:** Aluno tem mensalidade com `starts_at = 2025-01-15`, mas teve aulas no dia 10 e 12 de janeiro.

**Regra:**
- Aulas **antes de `starts_at`**: cobrar por aula (fluxo tradicional)
- Aulas **a partir de `starts_at`**: cobertas pela mensalidade

**Implementação no `automated-billing`:**
```typescript
// Verificar se mensalidade está ativa HOJE
const subscriptionActive = sms.starts_at <= today;

if (!subscriptionActive) {
  // Usar fluxo por aula para TODAS as aulas
  return processPerClassBilling(relationship);
}

// Separar aulas por período
const aulasAntes = aulas.filter(a => a.class_date < sms.starts_at);
const aulasDepois = aulas.filter(a => a.class_date >= sms.starts_at);

// Aulas antes: faturar por aula
if (aulasAntes.length > 0) {
  await createPerClassInvoice(aulasAntes);
}

// Aulas depois: incluir na mensalidade
await createMonthlyInvoice(subscription, aulasDepois);
```

#### 5.6.3 Múltiplos Professores com Mensalidades

**Cenário:** Aluno tem aulas com Prof. A (mensalidade) e Prof. B (mensalidade diferente).

**Regra:**
- Cada professor tem sua própria mensalidade independente
- `StudentDashboard` exibe um card por professor
- Cada card mostra: nome do professor, nome do plano, valor, uso de aulas

**UI sugerida:**
```
┌─────────────────────────────────────┐
│ Meus Planos                          │
├─────────────────────────────────────┤
│ ┌───────────────────────────────┐   │
│ │ Prof. João Silva              │   │
│ │ Plano Básico - R$ 400/mês     │   │
│ │ 3/8 aulas usadas              │   │
│ │ ████████░░░░░░░░ 37%          │   │
│ └───────────────────────────────┘   │
│ ┌───────────────────────────────┐   │
│ │ Profa. Maria Santos           │   │
│ │ Plano Ilimitado - R$ 600/mês  │   │
│ │ Aulas ilimitadas              │   │
│ │ ∞                              │   │
│ └───────────────────────────────┘   │
└─────────────────────────────────────┘
```

#### 5.6.4 Cancelamento de Mensalidade no Meio do Mês

**Cenário:** Professor cancela mensalidade do aluno no dia 20, `billing_day = 5`.

**Regras:**
| Situação | Comportamento |
|----------|---------------|
| Cancelamento **antes** do `billing_day` | Não gerar fatura neste ciclo |
| Cancelamento **após** o `billing_day` | Fatura já foi gerada; manter como está |
| Cancelamento **no** `billing_day` | Fatura é gerada; cancelamento efetivo no próximo ciclo |

**Nota:** O campo `ends_at` em `student_monthly_subscriptions` pode ser preenchido para indicar a data de término. Se `ends_at < billing_day`, a fatura não é gerada.

#### 5.6.5 Valor Mínimo para Geração de Boleto

**Constante oficial:**
```typescript
const MIN_BOLETO_VALUE = 5.00; // R$ 5,00
```

**Regra existente:** O sistema tem valor mínimo para geração de boleto de **R$ 5,00**.

**Aplicação a mensalidades:**
- Se `price + excedentes < MIN_BOLETO_VALUE`: NÃO gerar boleto
- Opções:
  1. Acumular para próximo ciclo
  2. Perdoar automaticamente
  3. Exibir warning para professor

**Recomendação:** Acumular para próximo ciclo com flag `pending_amount` no relationship.

> **⚠️ NOTA v1.12:** A coluna `pending_amount` em `teacher_student_relationships` **NÃO EXISTE** atualmente no banco de dados.
> 
> **Opções de implementação:**
> 1. **Simplificar (MVP)**: Perdoar automaticamente valores < R$ 5,00
> 2. **Fase 2**: Adicionar migration: `ALTER TABLE teacher_student_relationships ADD COLUMN pending_amount NUMERIC DEFAULT 0;`
> 3. **Fase 2**: Criar tabela separada para acumulação de valores pendentes
> 
> **Recomendação inicial:** Opção 1 (simplificar) para MVP, implementar acumulação em versão futura.

**Implementação (simplificada para MVP):**
```typescript
if (totalValue < MIN_BOLETO_VALUE) {
  // MVP: Perdoar automaticamente valores muito pequenos
  console.log(`Valor ${totalValue} abaixo do mínimo R$ 5,00. Perdoado automaticamente.`);
  return;
}

// FASE 2 (futura): Implementar acumulação
// await updatePendingAmount(relationship.id, totalValue);
```

---

## 6. Implementação Frontend

### 6.1 Estrutura de Arquivos

```
src/
├── components/
│   ├── ClassServicesManager.tsx          # INALTERADO: Componente de serviços por aula
│   ├── MonthlySubscriptionsManager.tsx   # NOVO: Lista de mensalidades
│   ├── MonthlySubscriptionModal.tsx      # NOVO: Modal criar/editar
│   ├── MonthlySubscriptionCard.tsx       # NOVO: Card individual
│   └── StudentSubscriptionSelect.tsx     # NOVO: Seleção múltipla de alunos
│
├── pages/
│   └── Servicos.tsx                      # MODIFICAR: Adicionar Tabs
│
├── hooks/
│   ├── useMonthlySubscriptions.ts        # NOVO: Hook para CRUD
│   └── useStudentSubscriptionAssignment.ts # NOVO: Hook para atribuições
│
└── i18n/
    └── locales/
        ├── pt/
        │   └── monthlySubscriptions.json # NOVO (decisão v1.10)
        └── en/
            └── monthlySubscriptions.json # NOVO (decisão v1.10)
```

### 6.2 Componentes

#### 6.2.1 MonthlySubscriptionsManager

```tsx
// Responsabilidades:
// - Listar mensalidades do professor
// - Mostrar cards com nome, valor, limite, qtd alunos
// - Botão "Nova Mensalidade"
// - Ações: Editar, Desativar/Ativar
// - Toggle para mostrar inativos

interface MonthlySubscription {
  id: string;
  name: string;
  description: string | null;
  price: number;
  max_classes: number | null;
  overage_price: number | null;
  is_active: boolean;
  created_at: string;
  students_count: number;
}
```

#### 6.2.2 MonthlySubscriptionModal

```tsx
// Responsabilidades:
// - Formulário de criação/edição
// - Campos: nome, descrição, valor, limite (toggle), excedente
// - Seleção múltipla de alunos
// - Validação de campos
// - Verificação de conflitos (aluno já com mensalidade)

interface MonthlySubscriptionFormData {
  name: string;
  description: string;
  price: number;
  hasLimit: boolean;
  maxClasses: number | null;
  overagePrice: number | null;
  selectedStudents: string[]; // relationship_ids
}
```

#### 6.2.3 MonthlySubscriptionCard

```tsx
// Responsabilidades:
// - Exibir dados da mensalidade
// - Badges: valor, limite, qtd alunos
// - Menu de ações (editar, desativar)
// - Indicador visual ativo/inativo
```

#### 6.2.4 StudentSubscriptionSelect

```tsx
// Responsabilidades:
// - Lista de alunos com checkbox
// - Busca por nome
// - Indicador se aluno já tem outra mensalidade
// - Bloquear seleção se conflito
```

### 6.3 Alterações em Componentes Existentes

#### 6.3.1 InvoiceStatusBadge.tsx

O componente `InvoiceStatusBadge.tsx` precisa ser atualizado para exibir um badge visual distinguindo faturas de mensalidade.

**Alterações necessárias:**

```tsx
// ============================================
// ARQUIVO: src/components/InvoiceStatusBadge.tsx
// Adicionar suporte para invoice_type
// ============================================

interface InvoiceStatusBadgeProps {
  status: 'paid' | 'open' | 'overdue' | 'void' | 'draft' | 'paga' | 'pendente' | 'vencida' | 'cancelada';
  paymentOrigin?: string | null;
  invoiceType?: string | null; // NOVO: tipo da fatura
}

export function InvoiceStatusBadge({ status, paymentOrigin, invoiceType }: InvoiceStatusBadgeProps) {
  // ... código existente ...
  
  // Renderizar badge adicional para mensalidade
  const isMonthlySubscription = invoiceType === 'monthly_subscription';
  
  return (
    <div className="flex items-center gap-1.5">
      {/* Badge de status (existente) */}
      <Badge className={cn('text-white gap-1', className)}>
        {isPaid && isManual && <CheckCircle className="h-3 w-3" />}
        {isPaid && isAutomatic && <Zap className="h-3 w-3" />}
        {label}
        {isPaid && isManual && <span className="text-xs opacity-80">(Manual)</span>}
        {isPaid && isAutomatic && <span className="text-xs opacity-80">(Auto)</span>}
      </Badge>
      
      {/* NOVO: Badge de tipo (mensalidade) */}
      {isMonthlySubscription && (
        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
          Mensalidade
        </Badge>
      )}
    </div>
  );
}
```

**Nota:** A cor roxa foi escolhida para diferenciar visualmente das cores já usadas (verde=sucesso, azul=aberto, vermelho=vencido).

#### 6.3.2 Financeiro.tsx

Alterações necessárias em `Financeiro.tsx`:

1. **LEFT JOIN em queries**: Alterar `classes!inner` e `class_participants!inner` para LEFT JOIN
2. **Badge de tipo**: Passar prop `invoiceType` para `InvoiceStatusBadge`
3. **Mapeamento de `invoice_type`**: Adicionar função para mapear todos os tipos

```tsx
// Exemplo de query atualizada (linhas ~276-283)
const { data: invoices } = await supabase
  .from('invoices')
  .select(`
    *,
    classes(*),                    // LEFT JOIN (remover !inner)
    class_participants(*),         // LEFT JOIN (remover !inner)
    monthly_subscriptions(name)    // NOVO: JOIN opcional para nome da mensalidade
  `)
  .eq('teacher_id', user.id);

// Exemplo de uso do badge
<InvoiceStatusBadge 
  status={invoice.status} 
  paymentOrigin={invoice.payment_origin}
  invoiceType={invoice.invoice_type}  // NOVO
/>
```

##### 6.3.2.1 Função getInvoiceTypeBadge (NOVO v1.11)

O código atual em `Financeiro.tsx` mapeia apenas dois tipos de `invoice_type` (`automated` e `manual`). Para suportar mensalidades, é necessário criar uma função completa de mapeamento:

```tsx
// ============================================
// FUNÇÃO: getInvoiceTypeBadge
// Mapeia invoice_type para propriedades de badge visual
// Inclui todos os tipos válidos: automated, manual, monthly_subscription
// ============================================

type InvoiceTypeBadgeProps = {
  label: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
};

const getInvoiceTypeBadge = (invoiceType: string | null | undefined): InvoiceTypeBadgeProps | null => {
  switch (invoiceType) {
    case 'automated':
      return { 
        label: 'Automática', 
        variant: 'secondary' 
      };
    case 'manual':
      return { 
        label: 'Manual', 
        variant: 'outline' 
      };
    case 'monthly_subscription':
      return { 
        label: 'Mensalidade', 
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' 
      };
    default:
      // null, undefined ou valor desconhecido
      return null;
  }
};

// Exemplo de uso no componente
const invoiceTypeBadge = getInvoiceTypeBadge(invoice.invoice_type);

return (
  <div className="flex items-center gap-2">
    <InvoiceStatusBadge 
      status={invoice.status} 
      paymentOrigin={invoice.payment_origin}
    />
    {invoiceTypeBadge && (
      <Badge 
        variant={invoiceTypeBadge.variant} 
        className={invoiceTypeBadge.className}
      >
        {invoiceTypeBadge.label}
      </Badge>
    )}
  </div>
);
```

**Valores de `invoice_type` no banco (confirmado v1.11):**
- `'automated'` - Fatura gerada automaticamente pelo sistema
- `'manual'` - Fatura criada manualmente pelo professor
- `'monthly_subscription'` - Fatura de mensalidade fixa (NOVO)
- `null` - Faturas antigas ou sem tipo definido

**Nota v1.13 (CORRIGIDO):** O valor `'regular'` É o DEFAULT válido de `invoice_type` no banco. Foi incorretamente afirmado em v1.9 que não existia. Valores confirmados: `'regular'` (DEFAULT), `'automated'`, `'manual'`, e `'monthly_subscription'` (novo).

> **⚠️ NOTA DE PRÉ-REQUISITOS v1.13:**
> 
> O JOIN `monthly_subscriptions(name)` na query acima **SÓ FUNCIONARÁ** após execução da migration do Apêndice A.
> Antes da migration, este código causará erro de tabela inexistente.
> 
> **Ordem de implementação:**
> 1. Executar migration do Apêndice A (cria tabela `monthly_subscriptions`)
> 2. Regenerar tipos TypeScript: `npx supabase gen types typescript --project-id=<ID> > src/integrations/supabase/types.ts`
> 3. Implementar código frontend com JOIN
> 
> **Interface InvoiceWithStudent atualizada:**
> ```typescript
> interface InvoiceWithStudent {
>   // ... campos existentes ...
>   monthly_subscription_id?: string;      // NOVO: FK para mensalidade
>   monthly_subscription?: {               // NOVO: dados da mensalidade via JOIN
>     name: string;
>   };
> }
> ```

#### 6.3.3 StudentDashboard.tsx

Adicionar seção "Meus Planos" conforme descrito em 5.6.3:

```tsx
// Buscar mensalidades do aluno
const { data: subscriptions } = await supabase
  .rpc('get_student_subscription_details', { p_student_id: user.id });

// Renderizar cards múltiplos (um por professor)
{subscriptions?.map((sub) => (
  <Card key={`${sub.teacher_id}-${sub.subscription_name}`}>
    <CardHeader>
      <CardTitle>{sub.teacher_name}</CardTitle>
      <CardDescription>{sub.subscription_name}</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-2xl font-bold">
        {formatCurrency(sub.monthly_value)}
        <span className="text-sm text-muted-foreground">/mês</span>
      </p>
      {sub.max_classes ? (
        <Progress value={(sub.classes_used / sub.max_classes) * 100} />
        <p>{sub.classes_used}/{sub.max_classes} aulas usadas</p>
      ) : (
        <p>Aulas ilimitadas</p>
      )}
    </CardContent>
  </Card>
))}
```

### 6.4 Hook useMonthlySubscriptions

```typescript
// ============================================
// ARQUIVO: src/hooks/useMonthlySubscriptions.ts
// Hook completo para CRUD de mensalidades
// ============================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { 
  MonthlySubscription, 
  MonthlySubscriptionWithCount,
  MonthlySubscriptionFormData,
  AssignedStudent
} from '@/types/monthly-subscriptions';

// ============================================
// QUERY: Listar mensalidades do professor
// ============================================
export function useMonthlySubscriptions(includeInactive = false) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['monthly-subscriptions', user?.id, includeInactive],
    queryFn: async (): Promise<MonthlySubscriptionWithCount[]> => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .rpc('get_subscriptions_with_students', { p_teacher_id: user.id });
      
      if (error) throw error;
      
      // Filtrar inativas se necessário
      if (!includeInactive) {
        return (data || []).filter(s => s.is_active);
      }
      
      return data || [];
    },
    enabled: !!user?.id,
  });
}

// ============================================
// QUERY: Listar alunos de uma mensalidade
// ============================================
export function useSubscriptionStudents(subscriptionId: string | null) {
  return useQuery({
    queryKey: ['subscription-students', subscriptionId],
    queryFn: async (): Promise<AssignedStudent[]> => {
      if (!subscriptionId) return [];
      
      const { data, error } = await supabase
        .rpc('get_subscription_assigned_students', { p_subscription_id: subscriptionId });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!subscriptionId,
  });
}

// ============================================
// MUTATION: Criar mensalidade
// ============================================
export function useCreateMonthlySubscription() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
const { t } = useTranslation('monthlySubscriptions');
  
  return useMutation({
    mutationFn: async (formData: MonthlySubscriptionFormData) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      // 1. Criar mensalidade
      const { data: subscription, error: subscriptionError } = await supabase
        .from('monthly_subscriptions')
        .insert({
          teacher_id: user.id,
          name: formData.name.trim(),
          description: formData.description?.trim() || null,
          price: formData.price,
          // NOTA v1.10: overagePrice só é válido se hasLimit = true E maxClasses > 0
          max_classes: formData.hasLimit ? formData.maxClasses : null,
          overage_price: formData.hasLimit && formData.maxClasses ? formData.overagePrice : null,
        })
        .select()
        .single();
      
      if (subscriptionError) throw subscriptionError;
      
      // 2. Atribuir alunos selecionados
      if (formData.selectedStudents.length > 0) {
        const assignments = formData.selectedStudents.map(relationshipId => ({
          subscription_id: subscription.id,
          relationship_id: relationshipId,
          starts_at: new Date().toISOString().split('T')[0],
          is_active: true,
        }));
        
        const { error: assignError } = await supabase
          .from('student_monthly_subscriptions')
          .insert(assignments);
        
        if (assignError) throw assignError;
      }
      
      return subscription;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
      toast.success(t('messages.createSuccess'));
    },
    onError: (error) => {
      console.error('Error creating subscription:', error);
      toast.error(t('messages.saveError'));
    },
  });
}

// ============================================
// MUTATION: Atualizar mensalidade
// ============================================
export function useUpdateMonthlySubscription() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('monthlySubscriptions');
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      formData 
    }: { 
      id: string; 
      formData: Partial<MonthlySubscriptionFormData> 
    }) => {
      const updateData: Partial<MonthlySubscription> = {
        name: formData.name?.trim(),
        description: formData.description?.trim() || null,
        price: formData.price,
        // NOTA v1.10: overagePrice só é válido se hasLimit = true E maxClasses > 0
        max_classes: formData.hasLimit ? formData.maxClasses : null,
        overage_price: formData.hasLimit && formData.maxClasses ? formData.overagePrice : null,
      };
      
      const { data, error } = await supabase
        .from('monthly_subscriptions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
      toast.success(t('messages.updateSuccess'));
    },
    onError: (error) => {
      console.error('Error updating subscription:', error);
      toast.error(t('messages.saveError'));
    },
  });
}

// ============================================
// MUTATION: Ativar/Desativar mensalidade
// ============================================
export function useToggleMonthlySubscription() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('monthlySubscriptions');
  
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('monthly_subscriptions')
        .update({ is_active: isActive })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
      toast.success(
        variables.isActive 
          ? t('messages.activateSuccess') 
          : t('messages.deactivateSuccess')
      );
    },
    onError: (error) => {
      console.error('Error toggling subscription:', error);
      toast.error(t('messages.saveError'));
    },
  });
}

// ============================================
// MUTATION: Atribuir aluno à mensalidade
// ============================================
export function useAssignStudentToSubscription() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('monthlySubscriptions');
  
  return useMutation({
    mutationFn: async ({ 
      subscriptionId, 
      relationshipId,
      startsAt 
    }: { 
      subscriptionId: string; 
      relationshipId: string;
      startsAt?: string;
    }) => {
      // Verificar se aluno já tem mensalidade ativa
      const { data: hasActive } = await supabase
        .rpc('check_student_has_active_subscription', { 
          p_relationship_id: relationshipId 
        });
      
      if (hasActive) {
        throw new Error('STUDENT_ALREADY_HAS_SUBSCRIPTION');
      }
      
      const { data, error } = await supabase
        .from('student_monthly_subscriptions')
        .insert({
          subscription_id: subscriptionId,
          relationship_id: relationshipId,
          starts_at: startsAt || new Date().toISOString().split('T')[0],
          is_active: true,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['subscription-students', variables.subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
    },
    onError: (error: Error) => {
      if (error.message === 'STUDENT_ALREADY_HAS_SUBSCRIPTION') {
        toast.error(t('messages.studentAlreadyHasSubscription'));
      } else {
        console.error('Error assigning student:', error);
        toast.error(t('messages.saveError'));
      }
    },
  });
}

// ============================================
// MUTATION: Remover aluno da mensalidade
// ============================================
export function useRemoveStudentFromSubscription() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('monthlySubscriptions');
  
  return useMutation({
    mutationFn: async ({ 
      assignmentId,
      subscriptionId 
    }: { 
      assignmentId: string;
      subscriptionId: string;
    }) => {
      const { error } = await supabase
        .from('student_monthly_subscriptions')
        .update({ is_active: false })
        .eq('id', assignmentId);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['subscription-students', variables.subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
      toast.success(t('messages.studentRemovedSuccess'));
    },
    onError: (error) => {
      console.error('Error removing student:', error);
      toast.error(t('messages.saveError'));
    },
  });
}

// ============================================
// 6.4.1 HOOK: useStudentSubscriptionAssignment
// Gerencia atribuição de alunos a mensalidades (view/assign/remove)
// ============================================

/**
 * Hook para listar alunos disponíveis para atribuição
 * Retorna alunos que NÃO têm mensalidade ativa
 */
export function useAvailableStudentsForSubscription(subscriptionId: string | null) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['available-students-for-subscription', user?.id, subscriptionId],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // Buscar todos os alunos do professor
      const { data: allStudents, error: studentsError } = await supabase
        .from('teacher_student_relationships')
        .select(`
          id,
          student_id,
          student_name,
          profiles!teacher_student_relationships_student_id_fkey(name, email)
        `)
        .eq('teacher_id', user.id);
      
      if (studentsError) throw studentsError;
      
      // Verificar quais já têm mensalidade ativa
      const studentsWithStatus = await Promise.all(
        (allStudents || []).map(async (student) => {
          const { data: hasActive } = await supabase
            .rpc('check_student_has_active_subscription', {
              p_relationship_id: student.id,
              p_exclude_subscription_id: subscriptionId
            });
          
          return {
            relationshipId: student.id,
            studentId: student.student_id,
            studentName: student.student_name || student.profiles?.name || 'Sem nome',
            studentEmail: student.profiles?.email || '',
            hasActiveSubscription: hasActive || false,
          };
        })
      );
      
      return studentsWithStatus;
    },
    enabled: !!user?.id,
  });
}

/**
 * Hook para gerenciar atribuições em massa
 * Útil para o modal de edição de mensalidade
 */
export function useBulkAssignStudents() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('monthlySubscriptions');
  
  return useMutation({
    mutationFn: async ({
      subscriptionId,
      toAdd,
      toRemove,
    }: {
      subscriptionId: string;
      toAdd: string[]; // relationship_ids a adicionar
      toRemove: string[]; // assignment_ids a remover
    }) => {
      // Remover alunos
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('student_monthly_subscriptions')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .in('id', toRemove);
        
        if (removeError) throw removeError;
      }
      
      // Adicionar novos alunos
      if (toAdd.length > 0) {
        const assignments = toAdd.map(relationshipId => ({
          subscription_id: subscriptionId,
          relationship_id: relationshipId,
          starts_at: new Date().toISOString().split('T')[0],
          is_active: true,
        }));
        
        const { error: addError } = await supabase
          .from('student_monthly_subscriptions')
          .insert(assignments);
        
        if (addError) throw addError;
      }
      
      return { added: toAdd.length, removed: toRemove.length };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['subscription-students', variables.subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['available-students-for-subscription'] });
      
      if (result.added > 0 || result.removed > 0) {
        toast.success(t('messages.studentsUpdatedSuccess'));
      }
    },
    onError: (error) => {
      console.error('Error updating student assignments:', error);
      toast.error(t('messages.saveError'));
    },
  });
}
```

### 6.5 Zod Schema de Validação

```typescript
// ============================================
// ARQUIVO: src/schemas/monthly-subscription.schema.ts
// Schema Zod para validação do formulário de mensalidade
// ============================================

import { z } from 'zod';

/**
 * Schema de validação para criação/edição de mensalidade
 * 
 * Regras:
 * - nome: obrigatório, 1-100 caracteres
 * - description: opcional, max 500 caracteres
 * - price: obrigatório, >= 0
 * - hasLimit: boolean para toggle de limite
 * - maxClasses: obrigatório SE hasLimit = true, > 0
 * - overagePrice: obrigatório SE hasLimit = true, >= 0
 * - selectedStudents: array de relationship_ids (pode ser vazio)
 */
export const monthlySubscriptionSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'O nome da mensalidade é obrigatório.' })
    .max(100, { message: 'O nome deve ter no máximo 100 caracteres.' })
    .transform(val => val.trim()),
  
  description: z
    .string()
    .max(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
    .optional()
    .transform(val => val?.trim() || ''),
  
  price: z
    .number({ invalid_type_error: 'Informe um valor válido.' })
    .min(0, { message: 'O valor deve ser maior ou igual a zero.' }),
  
  hasLimit: z.boolean().default(false),
  
  maxClasses: z
    .number({ invalid_type_error: 'Informe um número válido.' })
    .int({ message: 'O limite deve ser um número inteiro.' })
    .positive({ message: 'O limite de aulas deve ser maior que zero.' })
    .nullable()
    .optional(),
  
  overagePrice: z
    .number({ invalid_type_error: 'Informe um valor válido.' })
    .min(0, { message: 'O valor por aula excedente deve ser maior ou igual a zero.' })
    .nullable()
    .optional(),
  
  selectedStudents: z
    .array(z.string().uuid())
    .default([]),
    
}).refine(
  // Validação condicional: se hasLimit = true, maxClasses é obrigatório
  (data) => {
    if (data.hasLimit && (data.maxClasses === null || data.maxClasses === undefined)) {
      return false;
    }
    return true;
  },
  {
    message: 'Informe o limite de aulas quando a opção estiver ativada.',
    path: ['maxClasses'],
  }
).refine(
  // Validação condicional: se hasLimit = true, overagePrice é obrigatório
  (data) => {
    if (data.hasLimit && (data.overagePrice === null || data.overagePrice === undefined)) {
      return false;
    }
    return true;
  },
  {
    message: 'Informe o valor por aula excedente quando o limite estiver ativado.',
    path: ['overagePrice'],
  }
).transform((data) => {
  // TRANSFORMAÇÃO v1.10: Se hasLimit = false, garantir que overagePrice também é null
  // Isso evita inconsistências onde overagePrice tem valor mas não há limite
  if (!data.hasLimit) {
    return {
      ...data,
      maxClasses: null,
      overagePrice: null,
    };
  }
  return data;
});

// Tipo inferido do schema
export type MonthlySubscriptionFormValues = z.infer<typeof monthlySubscriptionSchema>;

// ============================================
// Helpers para conversão de valores monetários
// ============================================

/**
 * Converte string formatada (ex: "150,00") para número (150)
 */
export function parseCurrencyToNumber(value: string): number {
  const cleaned = value
    .replace(/[^\d,.-]/g, '')  // Remove tudo exceto dígitos, vírgula, ponto e hífen
    .replace(',', '.');         // Troca vírgula por ponto
  return parseFloat(cleaned) || 0;
}

/**
 * Converte número para string formatada (ex: 150 → "150,00")
 */
export function formatNumberToCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formata valor em centavos para exibição (ex: 15000 → "R$ 150,00")
 */
export function formatCentsToDisplay(cents: number): string {
  const reais = cents / 100;
  return reais.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
```

### 6.6 Alterações em Servicos.tsx e ClassServicesManager.tsx

#### 6.6.1 Contexto dos Componentes Existentes

O sistema atual possui:
- **`src/pages/Servicos.tsx`**: Página wrapper simples que renderiza `ClassServicesManager`
- **`src/components/ClassServicesManager.tsx`**: Componente principal que gerencia serviços por aula

**Estratégia de implementação (CLARIFICADO v1.10):**
1. **Modificar `Servicos.tsx`** para adicionar Tabs (Serviços | Mensalidades)
2. **Manter `ClassServicesManager.tsx` INALTERADO** - continua gerenciando apenas serviços por aula
3. **Criar `MonthlySubscriptionsManager.tsx`** para nova tab "Mensalidades"

**NOTA IMPORTANTE v1.10:** As Tabs são adicionadas em `Servicos.tsx` (a página), NÃO em `ClassServicesManager.tsx` (o componente). O `ClassServicesManager` permanece focado em sua responsabilidade única de gerenciar serviços por aula.

#### 6.6.2 Alterações em Servicos.tsx

```tsx
// ============================================
// ARQUIVO: src/pages/Servicos.tsx
// Modificação: Adicionar Tabs para Serviços e Mensalidades
// ============================================

// ANTES:
<ClassServicesManager />

// DEPOIS:
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MonthlySubscriptionsManager } from '@/components/MonthlySubscriptionsManager';

// No JSX:
<Tabs defaultValue="services">
  <TabsList className="mb-4">
    <TabsTrigger value="services">
      {t('monthlySubscriptions:tabs.services')}
    </TabsTrigger>
    <TabsTrigger value="subscriptions">
      {t('monthlySubscriptions:tabs.subscriptions')}
    </TabsTrigger>
  </TabsList>
  
  <TabsContent value="services">
    <ClassServicesManager />
  </TabsContent>
  
  <TabsContent value="subscriptions">
    <MonthlySubscriptionsManager />
  </TabsContent>
</Tabs>
```

#### 6.6.3 ClassServicesManager.tsx (Referência)

O componente `ClassServicesManager.tsx` **não precisa de alterações** para a implementação de mensalidades. Ele continua gerenciando:
- Serviços por aula (CRUD)
- Preços por aula
- Duração de serviços

**Nota:** A tab de mensalidades é completamente separada e usa `MonthlySubscriptionsManager`.

---

## 7. Implementação Backend

### 7.1 Alteração no Faturamento Automatizado

O arquivo `supabase/functions/automated-billing/index.ts` precisa ser modificado para:

1. **Verificar mensalidade ativa** antes de buscar aulas
2. **Se tiver mensalidade**: cobrar valor fixo + excedentes (se aplicável)
3. **Se NÃO tiver mensalidade**: manter comportamento atual (cobrar por aula)

### 7.2 Pseudocódigo do Novo Fluxo

```typescript
// automated-billing/index.ts

async function processStudentBilling(
  relationship: TeacherStudentRelationship,
  billingDate: Date
): Promise<void> {
  
  // ========================================
  // 1. VERIFICAR SE ALUNO TEM MENSALIDADE ATIVA
  // ========================================
  const { data: subscription } = await supabase
    .rpc('get_student_active_subscription', {
      p_relationship_id: relationship.id
    })
    .single();
  
  if (subscription) {
    // ========================================
    // 2. FLUXO MENSALIDADE
    // ========================================
    await processMonthlySubscriptionBilling(
      relationship,
      subscription,
      billingDate
    );
    
  } else {
    // ========================================
    // 3. FLUXO TRADICIONAL (por aula)
    // ========================================
    await processPerClassBilling(relationship, billingDate);
  }
}

async function processMonthlySubscriptionBilling(
  relationship: TeacherStudentRelationship,
  subscription: ActiveSubscription,
  billingDate: Date
): Promise<void> {
  
  let totalAmount = subscription.price;
  let description = `Mensalidade - ${subscription.subscription_name}`;
  let overageClasses = 0;
  
  // ========================================
  // 2.1 VERIFICAR LIMITE DE AULAS (se aplicável)
  // ========================================
  if (subscription.max_classes !== null) {
    const { data: classCount } = await supabase
      .rpc('count_completed_classes_in_month', {
        p_teacher_id: relationship.teacher_id,
        p_student_id: relationship.student_id,
        p_year: billingDate.getFullYear(),
        p_month: billingDate.getMonth() + 1
      })
      .single();
    
    if (classCount > subscription.max_classes) {
      overageClasses = classCount - subscription.max_classes;
      const overageAmount = overageClasses * (subscription.overage_price || 0);
      totalAmount += overageAmount;
      
      description += ` + ${overageClasses} aula(s) excedente(s)`;
    }
  }
  
  // ========================================
  // 2.2 CRIAR FATURA DE MENSALIDADE
  // ========================================
  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      student_id: relationship.student_id,
      teacher_id: relationship.teacher_id,
      amount: totalAmount,
      description: description,
      due_date: calculateDueDate(billingDate),
      status: 'pendente',
      invoice_type: 'monthly_subscription',
      monthly_subscription_id: subscription.subscription_id,
      business_profile_id: relationship.business_profile_id
    })
    .select()
    .single();
  
  if (error) {
    console.error('Erro ao criar fatura de mensalidade:', error);
    throw error;
  }
  
  console.log(`Fatura de mensalidade criada: ${invoice.id} - R$ ${totalAmount}`);
  
  // ========================================
  // 2.3 MARCAR AULAS COMO COBERTAS PELA MENSALIDADE
  // (Opcional: criar registros em invoice_classes para auditoria)
  // ========================================
  // As aulas não são vinculadas individualmente à fatura de mensalidade,
  // pois a cobrança é fixa. Apenas registramos que a fatura é do tipo
  // 'monthly_subscription' para distinguir no relatório.
}

async function processPerClassBilling(
  relationship: TeacherStudentRelationship,
  billingDate: Date
): Promise<void> {
  // ... código existente de cobrança por aula ...
  // Este fluxo permanece inalterado
}
```

---

## 8. Internacionalização (i18n)

### 8.0 Nota sobre Namespaces

**⚠️ IMPORTANTE: Conflito de Namespace Resolvido**

O arquivo `src/i18n/locales/pt/subscription.json` **já existe** e contém traduções para **assinatura do PROFESSOR** (planos da plataforma TutorFlow: Free, Básico, Premium, etc.).

**Decisão de design (v1.9):** As traduções de mensalidade do **ALUNO** devem usar um namespace **diferente** para evitar confusão:

| Namespace | Propósito | Arquivo |
|-----------|-----------|---------|
| `subscription` (existente) | Planos da plataforma para professores | `subscription.json` |
| `monthlySubscriptions` (NOVO) | Mensalidades fixas para alunos | `monthlySubscriptions.json` |

**Exemplo de uso no código:**
```tsx
// Para assinaturas do professor (planos da plataforma)
const { t } = useTranslation('subscription');
t('plans.basic.title'); // "Plano Básico"

// Para mensalidades de alunos
const { t } = useTranslation('monthlySubscriptions');
t('title'); // "Mensalidades"
```

**Nota adicional:** Os exemplos de código neste documento usam `useTranslation('subscriptions')` (plural). Isso deve ser atualizado para `useTranslation('monthlySubscriptions')` na implementação final.

---

**⚠️ Bug Existente: Namespace `notifications`**

O arquivo `src/i18n/index.ts` declara o namespace `notifications` no array `ns` (provavelmente na linha 118), mas os arquivos de tradução correspondentes **NÃO EXISTEM**:
- ❌ `src/i18n/locales/pt/notifications.json`
- ❌ `src/i18n/locales/en/notifications.json`

**Ação recomendada:** Remover `'notifications'` do array `ns` ou criar os arquivos vazios para evitar warnings no console durante desenvolvimento.

---

### 8.1 Português (pt)

**Arquivo:** `src/i18n/locales/pt/monthlySubscriptions.json`

```json
{
  "title": "Mensalidades",
  "new": "Nova Mensalidade",
  "edit": "Editar Mensalidade",
  "tabs": {
    "services": "Serviços por Aula",
    "subscriptions": "Mensalidades"
  },
  "fields": {
    "name": "Nome da Mensalidade",
    "namePlaceholder": "Ex: Pacote Mensal Premium",
    "description": "Descrição",
    "descriptionPlaceholder": "Descrição opcional do plano",
    "price": "Valor Mensal",
    "pricePlaceholder": "0,00",
    "hasLimit": "Definir limite de aulas por mês",
    "maxClasses": "Máximo de aulas",
    "maxClassesPlaceholder": "Ex: 8",
    "overagePrice": "Valor por aula excedente",
    "overagePricePlaceholder": "0,00",
    "students": "Alunos vinculados",
    "searchStudents": "Buscar alunos...",
    "noStudentsSelected": "Nenhum aluno selecionado",
    "selectStudents": "Selecione os alunos que terão esta mensalidade"
  },
  "list": {
    "noSubscriptions": "Nenhuma mensalidade cadastrada",
    "noSubscriptionsDescription": "Crie sua primeira mensalidade para cobrar um valor fixo mensal de seus alunos, independente da quantidade de aulas.",
    "createFirst": "Criar Primeira Mensalidade",
    "studentsCount": "{{count}} aluno(s)",
    "unlimited": "Aulas ilimitadas",
    "classesLimit": "Até {{max}} aulas/mês",
    "overage": "+{{price}}/aula extra",
    "showInactive": "Mostrar inativas",
    "inactive": "Inativa"
  },
  "validation": {
    "nameRequired": "O nome da mensalidade é obrigatório.",
    "validPrice": "O valor deve ser maior ou igual a zero.",
    "validMaxClasses": "O limite de aulas deve ser maior que zero.",
    "validOveragePrice": "O valor por aula excedente deve ser maior ou igual a zero."
  },
  "actions": {
    "cancel": "Cancelar",
    "create": "Criar Mensalidade",
    "update": "Salvar Alterações",
    "saving": "Salvando...",
    "deactivate": "Desativar",
    "activate": "Ativar",
    "edit": "Editar"
  },
  "messages": {
    "createSuccess": "Mensalidade criada com sucesso!",
    "updateSuccess": "Mensalidade atualizada com sucesso!",
    "saveError": "Não foi possível salvar a mensalidade. Tente novamente.",
    "deactivateSuccess": "Mensalidade desativada com sucesso!",
    "activateSuccess": "Mensalidade ativada com sucesso!",
    "studentAlreadyHasSubscription": "Este aluno já possui outra mensalidade ativa.",
    "studentRemovedSuccess": "Aluno removido da mensalidade com sucesso!",
    "studentsUpdatedSuccess": "Alunos atualizados com sucesso!",
    "loadError": "Erro ao carregar mensalidades."
  },
  "info": {
    "familyBilling": "A mensalidade cobre o aluno e todos os seus dependentes.",
    "ignoreCancellations": "Cancelamentos de aula não geram cobranças adicionais.",
    "billingDay": "A cobrança ocorre no dia de faturamento configurado para cada aluno.",
    "overageExplanation": "Quando o limite de aulas é atingido, cada aula adicional será cobrada separadamente."
  },
  "confirm": {
    "deactivate": "Desativar mensalidade?",
    "deactivateDescription": "Os alunos vinculados passarão a ser cobrados por aula a partir do próximo ciclo de faturamento."
  }
}
```

### 8.2 English (en)

**Arquivo:** `src/i18n/locales/en/monthlySubscriptions.json`

```json
{
  "title": "Monthly Subscriptions",
  "new": "New Subscription",
  "edit": "Edit Subscription",
  "tabs": {
    "services": "Per-Class Services",
    "subscriptions": "Monthly Subscriptions"
  },
  "fields": {
    "name": "Subscription Name",
    "namePlaceholder": "E.g.: Premium Monthly Package",
    "description": "Description",
    "descriptionPlaceholder": "Optional plan description",
    "price": "Monthly Price",
    "pricePlaceholder": "0.00",
    "hasLimit": "Set monthly class limit",
    "maxClasses": "Maximum classes",
    "maxClassesPlaceholder": "E.g.: 8",
    "overagePrice": "Price per extra class",
    "overagePricePlaceholder": "0.00",
    "students": "Assigned students",
    "searchStudents": "Search students...",
    "noStudentsSelected": "No students selected",
    "selectStudents": "Select students who will have this subscription"
  },
  "list": {
    "noSubscriptions": "No subscriptions created",
    "noSubscriptionsDescription": "Create your first subscription to charge a fixed monthly fee from your students, regardless of the number of classes.",
    "createFirst": "Create First Subscription",
    "studentsCount": "{{count}} student(s)",
    "unlimited": "Unlimited classes",
    "classesLimit": "Up to {{max}} classes/month",
    "overage": "+{{price}}/extra class",
    "showInactive": "Show inactive",
    "inactive": "Inactive"
  },
  "validation": {
    "nameRequired": "Subscription name is required.",
    "validPrice": "Price must be greater than or equal to zero.",
    "validMaxClasses": "Class limit must be greater than zero.",
    "validOveragePrice": "Price per extra class must be greater than or equal to zero."
  },
  "actions": {
    "cancel": "Cancel",
    "create": "Create Subscription",
    "update": "Save Changes",
    "saving": "Saving...",
    "deactivate": "Deactivate",
    "activate": "Activate",
    "edit": "Edit"
  },
  "messages": {
    "createSuccess": "Subscription created successfully!",
    "updateSuccess": "Subscription updated successfully!",
    "saveError": "Could not save subscription. Please try again.",
    "deactivateSuccess": "Subscription deactivated successfully!",
    "activateSuccess": "Subscription activated successfully!",
    "studentAlreadyHasSubscription": "This student already has another active subscription.",
    "studentRemovedSuccess": "Student removed from subscription successfully!",
    "studentsUpdatedSuccess": "Students updated successfully!",
    "loadError": "Error loading subscriptions."
  },
  "info": {
    "familyBilling": "The subscription covers the student and all their dependents.",
    "ignoreCancellations": "Class cancellations do not generate additional charges.",
    "billingDay": "Billing occurs on the billing day configured for each student.",
    "overageExplanation": "When the class limit is reached, each additional class will be charged separately."
  },
  "confirm": {
    "deactivate": "Deactivate subscription?",
    "deactivateDescription": "Assigned students will be charged per class from the next billing cycle."
  }
}
```

---

## 9. Testes e Validações

### 9.1 Testes Unitários

| ID | Cenário | Input | Expected Output |
|----|---------|-------|-----------------|
| T01 | Criar mensalidade válida | nome, valor | Mensalidade criada |
| T02 | Criar mensalidade sem nome | valor | Erro de validação |
| T03 | Criar mensalidade com limite | nome, valor, max=8 | Mensalidade com limite |
| T04 | Atribuir aluno sem conflito | relationship_id | Atribuição criada |
| T05 | Atribuir aluno com conflito | relationship_id já com mensalidade | Erro |
| T06 | Desativar mensalidade | subscription_id | is_active = false |
| T07 | Contagem de aulas no mês | teacher_id, student_id | Número correto |
| T08 | Contagem inclui dependentes | responsável com dependentes | Soma correta |

### 9.2 Testes de Integração

| ID | Cenário | Pré-condição | Ação | Resultado Esperado |
|----|---------|--------------|------|-------------------|
| I01 | Faturamento com mensalidade | Aluno com mensalidade ativa | Executar billing | Fatura tipo 'monthly_subscription' |
| I02 | Faturamento sem mensalidade | Aluno sem mensalidade | Executar billing | Fatura tipo 'automated' |
| I03 | Faturamento com excedente | Aluno com limite=4, 6 aulas | Executar billing | Fatura = mensalidade + 2×excedente |
| I04 | Faturamento ilimitado | Aluno com max_classes=null, 20 aulas | Executar billing | Fatura = apenas mensalidade |
| I05 | Migração de mensalidade | Aluno troca de plano | Desativar antiga, ativar nova | Próxima fatura usa novo valor |
| I06 | Aluno removido | Relacionamento deletado | Verificar cascata | student_monthly_subscription deletado |

### 9.3 Testes E2E

| ID | Fluxo | Passos |
|----|-------|--------|
| E01 | Criar primeira mensalidade | Login → Serviços → Mensalidades → Nova → Preencher → Salvar |
| E02 | Atribuir alunos | Editar mensalidade → Selecionar alunos → Salvar |
| E03 | Verificar fatura | Aluno com mensalidade → Aguardar billing_day → Verificar fatura |
| E04 | Desativar e verificar | Desativar mensalidade → Próximo billing → Verificar cobrança por aula |

---

## 10. Cronograma de Implementação

### Fase 1: Banco de Dados (1-2 dias)
- [ ] Criar tabela `monthly_subscriptions`
- [ ] Criar tabela `student_monthly_subscriptions`
- [ ] Adicionar coluna em `invoices`
- [ ] Criar funções SQL
- [ ] Criar índices
- [ ] Configurar RLS
- [ ] Testar migrations

### Fase 2: Frontend - Estrutura (1 dia)
- [ ] Criar arquivos i18n (PT/EN)
- [ ] Registrar namespace no i18n/index.ts
- [ ] Criar hooks (useMonthlySubscriptions, useStudentSubscriptionAssignment)
- [ ] Modificar Servicos.tsx para usar Tabs

### Fase 3: Frontend - Componentes (2 dias)
- [ ] Criar MonthlySubscriptionsManager
- [ ] Criar MonthlySubscriptionCard
- [ ] Criar MonthlySubscriptionModal
- [ ] Criar StudentSubscriptionSelect
- [ ] Estilização e responsividade

### Fase 4: Backend - Faturamento (1-2 dias)
- [ ] Modificar automated-billing/index.ts
- [ ] Implementar verificação de mensalidade
- [ ] Implementar cálculo de excedentes
- [ ] Testes de integração

### Fase 5: Testes e Refinamentos (1 dia)
- [ ] Testes manuais completos
- [ ] Correção de bugs
- [ ] Revisão de código
- [ ] Documentação final

**Total Estimado: 6-8 dias**

---

## 11. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Conflito com faturamento existente | Média | Alto | Verificação de mensalidade antes do fluxo tradicional |
| Performance na contagem de aulas | Baixa | Médio | Índices otimizados, cache se necessário |
| Inconsistência em cascata | Baixa | Alto | Constraints FK com ON DELETE CASCADE |
| UX confusa na atribuição | Média | Médio | Indicadores visuais claros de conflito |
| Erros de arredondamento | Baixa | Baixo | Usar NUMERIC no banco, formatação consistente |
| Migração de dados incorreta | N/A | N/A | Não há migração - nova funcionalidade |

---

## 12. Apêndice A: SQL Completo

```sql
-- ============================================
-- SCRIPT COMPLETO DE MIGRAÇÃO
-- Tutor Flow - Mensalidade Fixa
-- Versão 1.13 - Sincronizado com documento principal v1.13
-- ============================================

-- 0. VERIFICAÇÕES PRÉ-MIGRAÇÃO

-- 0.1 Verificar existência de função update_updated_at_column (DEVE EXISTIR)
-- Se não existir, descomentar e executar:
/*
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
*/

-- 0.2 Alterações PRÉ-REQUISITO em invoice_classes
-- Necessário para suportar item_type = 'monthly_base' sem class_id/participant_id
-- NOTA: Executar apenas se NOT NULL constraints existem
-- ALTER TABLE public.invoice_classes ALTER COLUMN class_id DROP NOT NULL;
-- ALTER TABLE public.invoice_classes ALTER COLUMN participant_id DROP NOT NULL;

-- 0.3 Documentação de valores de invoice_type
-- Valores ATUAIS aceitos no banco (campo TEXT sem constraint CHECK):
-- - 'regular': valor DEFAULT - fatura padrão/avulsa (CORRIGIDO v1.12: valor válido, não removido)
-- - 'automated': fatura gerada automaticamente pelo sistema (cobrança por aula)
-- - 'manual': fatura criada manualmente pelo professor
-- - 'monthly_subscription': NOVO - fatura de mensalidade fixa (a ser implementado)
-- NOTA: Não há constraint de CHECK em invoice_type; é apenas TEXT
-- NOTA v1.12: 'regular' É o valor DEFAULT no banco (corrigido erro da v1.9)

-- 1. TABELA: monthly_subscriptions
CREATE TABLE public.monthly_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL CHECK (price >= 0),
  max_classes INTEGER CHECK (max_classes IS NULL OR max_classes > 0),
  overage_price NUMERIC CHECK (overage_price IS NULL OR overage_price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.monthly_subscriptions IS 'Planos de mensalidade fixa criados por professores';
COMMENT ON COLUMN public.monthly_subscriptions.max_classes IS 'Limite de aulas por mês. NULL = ilimitado';
COMMENT ON COLUMN public.monthly_subscriptions.overage_price IS 'Valor por aula excedente. Só aplicável se max_classes definido';

CREATE INDEX idx_monthly_subscriptions_teacher_id ON public.monthly_subscriptions(teacher_id);
CREATE INDEX idx_monthly_subscriptions_active ON public.monthly_subscriptions(teacher_id, is_active) WHERE is_active = true;

ALTER TABLE public.monthly_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS: Professores gerenciam suas mensalidades
CREATE POLICY "Professores podem gerenciar suas mensalidades"
ON public.monthly_subscriptions
FOR ALL
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- RLS: Alunos podem ver suas mensalidades (via student_monthly_subscriptions)
-- NOTA: Apenas UMA política para alunos em monthly_subscriptions
CREATE POLICY "Alunos podem ver suas mensalidades"
ON public.monthly_subscriptions
FOR SELECT
USING (
  id IN (
    SELECT sms.subscription_id 
    FROM public.student_monthly_subscriptions sms
    JOIN public.teacher_student_relationships tsr ON tsr.id = sms.relationship_id
    WHERE tsr.student_id = auth.uid()
      AND sms.is_active = true
  )
);

CREATE TRIGGER update_monthly_subscriptions_updated_at
BEFORE UPDATE ON public.monthly_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. TABELA: student_monthly_subscriptions
CREATE TABLE public.student_monthly_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.monthly_subscriptions(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.teacher_student_relationships(id) ON DELETE CASCADE,
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_at DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.student_monthly_subscriptions IS 'Vinculação de alunos a mensalidades';
COMMENT ON COLUMN public.student_monthly_subscriptions.ends_at IS 'Data de término. NULL = vigência indeterminada';

CREATE UNIQUE INDEX idx_unique_active_subscription_per_relationship 
ON public.student_monthly_subscriptions(relationship_id) 
WHERE is_active = true;

CREATE INDEX idx_student_monthly_subscriptions_subscription_id ON public.student_monthly_subscriptions(subscription_id);
CREATE INDEX idx_student_monthly_subscriptions_active ON public.student_monthly_subscriptions(subscription_id, is_active) WHERE is_active = true;
CREATE INDEX idx_student_monthly_subs_lookup ON public.student_monthly_subscriptions(relationship_id, is_active, starts_at);

ALTER TABLE public.student_monthly_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professores podem gerenciar assinaturas de seus alunos"
ON public.student_monthly_subscriptions
FOR ALL
USING (
  subscription_id IN (
    SELECT id FROM public.monthly_subscriptions WHERE teacher_id = auth.uid()
  )
)
WITH CHECK (
  subscription_id IN (
    SELECT id FROM public.monthly_subscriptions WHERE teacher_id = auth.uid()
  )
);

-- Política para alunos visualizarem suas próprias mensalidades
-- NOTA: Nome diferente da policy em monthly_subscriptions para evitar confusão
CREATE POLICY "Alunos podem ver seus vínculos de mensalidade"
ON public.student_monthly_subscriptions
FOR SELECT
USING (
  relationship_id IN (
    SELECT id FROM public.teacher_student_relationships WHERE student_id = auth.uid()
  )
);

CREATE TRIGGER update_student_monthly_subscriptions_updated_at
BEFORE UPDATE ON public.student_monthly_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2.1 TRIGGERS PARA SOFT DELETE
-- Impedir hard delete de mensalidades
CREATE OR REPLACE FUNCTION prevent_monthly_subscription_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Exclusão de mensalidades não é permitida. Use desativação (is_active = false).';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_delete_monthly_subscriptions
BEFORE DELETE ON public.monthly_subscriptions
FOR EACH ROW EXECUTE FUNCTION prevent_monthly_subscription_delete();

-- Desativar alunos em cascata ao desativar mensalidade
CREATE OR REPLACE FUNCTION deactivate_subscription_students()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE public.student_monthly_subscriptions
    SET is_active = false, updated_at = now()
    WHERE subscription_id = NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cascade_deactivate_subscription_students
AFTER UPDATE OF is_active ON public.monthly_subscriptions
FOR EACH ROW
WHEN (OLD.is_active = true AND NEW.is_active = false)
EXECUTE FUNCTION deactivate_subscription_students();

-- 3. ALTERAÇÃO: invoices
ALTER TABLE public.invoices 
ADD COLUMN monthly_subscription_id UUID REFERENCES public.monthly_subscriptions(id);

COMMENT ON COLUMN public.invoices.monthly_subscription_id IS 'Referência à mensalidade que gerou esta fatura (se aplicável)';

CREATE INDEX idx_invoices_monthly_subscription_id ON public.invoices(monthly_subscription_id) WHERE monthly_subscription_id IS NOT NULL;

-- 4. FUNÇÕES SQL
CREATE OR REPLACE FUNCTION public.get_student_active_subscription(
  p_relationship_id UUID
)
RETURNS TABLE (
  subscription_id UUID,
  subscription_name TEXT,
  price NUMERIC,
  max_classes INTEGER,
  overage_price NUMERIC
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    ms.id as subscription_id,
    ms.name as subscription_name,
    ms.price,
    ms.max_classes,
    ms.overage_price
  FROM student_monthly_subscriptions sms
  JOIN monthly_subscriptions ms ON ms.id = sms.subscription_id
  WHERE sms.relationship_id = p_relationship_id
    AND sms.is_active = true
    AND ms.is_active = true
    AND sms.starts_at <= CURRENT_DATE
    AND (sms.ends_at IS NULL OR sms.ends_at >= CURRENT_DATE)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.count_completed_classes_in_month(
  p_teacher_id UUID,
  p_student_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  p_month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(DISTINCT cp.id)::INTEGER
  FROM class_participants cp
  JOIN classes c ON c.id = cp.class_id
  LEFT JOIN dependents d ON d.id = cp.dependent_id
  WHERE c.teacher_id = p_teacher_id
    AND cp.status = 'concluida'
    AND c.is_experimental = false  -- Aulas experimentais não contam
    AND EXTRACT(YEAR FROM c.class_date) = p_year
    AND EXTRACT(MONTH FROM c.class_date) = p_month
    AND (
      cp.student_id = p_student_id
      OR d.responsible_id = p_student_id
    );
$$;

-- Função para Dashboard do aluno
CREATE OR REPLACE FUNCTION public.get_student_subscription_details(
  p_student_id UUID
)
RETURNS TABLE (
  teacher_id UUID,
  teacher_name TEXT,
  subscription_name TEXT,
  monthly_value NUMERIC,
  max_classes INTEGER,
  overage_price NUMERIC,
  classes_used INTEGER,
  classes_remaining INTEGER,
  billing_day INTEGER,
  starts_at DATE
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    tsr.teacher_id,
    p.name as teacher_name,
    ms.name as subscription_name,
    ms.price as monthly_value,
    ms.max_classes,
    ms.overage_price,
    public.count_completed_classes_in_month(
      tsr.teacher_id, 
      p_student_id, 
      EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
      EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
    ) as classes_used,
    CASE 
      WHEN ms.max_classes IS NULL THEN NULL
      ELSE GREATEST(0, ms.max_classes - public.count_completed_classes_in_month(
        tsr.teacher_id, 
        p_student_id, 
        EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
        EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
      ))
    END as classes_remaining,
    COALESCE(tsr.billing_day, p.default_billing_day, 5) as billing_day,
    sms.starts_at
  FROM student_monthly_subscriptions sms
  JOIN monthly_subscriptions ms ON ms.id = sms.subscription_id
  JOIN teacher_student_relationships tsr ON tsr.id = sms.relationship_id
  JOIN profiles p ON p.id = tsr.teacher_id
  WHERE tsr.student_id = p_student_id
    AND sms.is_active = true
    AND ms.is_active = true
    AND sms.starts_at <= CURRENT_DATE
    AND (sms.ends_at IS NULL OR sms.ends_at >= CURRENT_DATE);
$$;

CREATE OR REPLACE FUNCTION public.get_subscription_students_count(
  p_subscription_id UUID
)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::INTEGER
  FROM student_monthly_subscriptions
  WHERE subscription_id = p_subscription_id
    AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_subscriptions_with_students(
  p_teacher_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  price NUMERIC,
  max_classes INTEGER,
  overage_price NUMERIC,
  is_active BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  students_count INTEGER
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    ms.id,
    ms.name,
    ms.description,
    ms.price,
    ms.max_classes,
    ms.overage_price,
    ms.is_active,
    ms.created_at,
    COALESCE(
      (SELECT COUNT(*)::INTEGER 
       FROM student_monthly_subscriptions sms 
       WHERE sms.subscription_id = ms.id AND sms.is_active = true),
      0
    ) as students_count
  FROM monthly_subscriptions ms
  WHERE ms.teacher_id = p_teacher_id
  ORDER BY ms.is_active DESC, ms.name ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_subscription_assigned_students(
  p_subscription_id UUID
)
RETURNS TABLE (
  assignment_id UUID,
  relationship_id UUID,
  student_id UUID,
  student_name TEXT,
  student_email TEXT,
  starts_at DATE,
  is_active BOOLEAN
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    sms.id as assignment_id,
    sms.relationship_id,
    tsr.student_id,
    COALESCE(tsr.student_name, p.name) as student_name,
    p.email as student_email,
    sms.starts_at,
    sms.is_active
  FROM student_monthly_subscriptions sms
  JOIN teacher_student_relationships tsr ON tsr.id = sms.relationship_id
  JOIN profiles p ON p.id = tsr.student_id
  WHERE sms.subscription_id = p_subscription_id
  ORDER BY COALESCE(tsr.student_name, p.name) ASC;
$$;

CREATE OR REPLACE FUNCTION public.check_student_has_active_subscription(
  p_relationship_id UUID,
  p_exclude_subscription_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM student_monthly_subscriptions sms
    JOIN monthly_subscriptions ms ON ms.id = sms.subscription_id
    WHERE sms.relationship_id = p_relationship_id
      AND sms.is_active = true
      AND ms.is_active = true
      AND (p_exclude_subscription_id IS NULL OR sms.subscription_id != p_exclude_subscription_id)
  );
$$;

-- 5. ÍNDICES ADICIONAIS
CREATE INDEX IF NOT EXISTS idx_class_participants_billing 
ON public.class_participants(student_id, status)
WHERE status = 'concluida';

CREATE INDEX IF NOT EXISTS idx_classes_billing_month 
ON public.classes(teacher_id, class_date)
WHERE is_template = false;
```

---

## 13. Apêndice B: Checklist de Deploy

### Pré-Deploy
- [ ] Backup do banco de dados
- [ ] Revisar migrations SQL
- [ ] Testar em ambiente de staging
- [ ] Verificar RLS policies
- [ ] Atualizar tipos TypeScript (regenerar)

### Deploy - Banco de Dados
- [ ] Executar migration via Supabase Dashboard
- [ ] Verificar criação de tabelas
- [ ] Verificar criação de funções
- [ ] Verificar índices
- [ ] Testar RLS policies
- [ ] **Regenerar tipos TypeScript**: `npx supabase gen types typescript --project-id=<PROJECT_ID> > src/integrations/supabase/types.ts`

### Deploy - Frontend
- [ ] Build sem erros
- [ ] Verificar bundle size
- [ ] Testar em produção (smoke test)
- [ ] Verificar i18n carregando

### Deploy - Backend
- [ ] Deploy edge functions
- [ ] Verificar logs de erro
- [ ] Testar faturamento manualmente

### Pós-Deploy
- [ ] Monitorar erros no Sentry/logs
- [ ] Verificar métricas de performance
- [ ] Comunicar usuários sobre nova funcionalidade
- [ ] Documentar rollback procedure

### Rollback (se necessário)
```sql
-- ============================================
-- ROLLBACK SCRIPT COMPLETO
-- Executar na ordem inversa
-- Versão 1.1 - Inclui triggers e funções de trigger
-- ============================================

-- 1. Remover triggers
DROP TRIGGER IF EXISTS prevent_delete_monthly_subscriptions ON public.monthly_subscriptions;
DROP TRIGGER IF EXISTS cascade_deactivate_subscription_students ON public.monthly_subscriptions;
DROP TRIGGER IF EXISTS update_monthly_subscriptions_updated_at ON public.monthly_subscriptions;
DROP TRIGGER IF EXISTS update_student_monthly_subscriptions_updated_at ON public.student_monthly_subscriptions;

-- 2. Remover funções de trigger (específicas de mensalidade)
DROP FUNCTION IF EXISTS public.prevent_monthly_subscription_delete();
DROP FUNCTION IF EXISTS public.deactivate_subscription_students();

-- 3. Remover funções SQL
DROP FUNCTION IF EXISTS public.check_student_has_active_subscription;
DROP FUNCTION IF EXISTS public.get_subscription_assigned_students;
DROP FUNCTION IF EXISTS public.get_subscriptions_with_students;
DROP FUNCTION IF EXISTS public.get_subscription_students_count;
DROP FUNCTION IF EXISTS public.get_student_subscription_details;
DROP FUNCTION IF EXISTS public.count_completed_classes_in_month;
DROP FUNCTION IF EXISTS public.get_student_active_subscription;

-- 4. Remover índices (se criados separadamente)
DROP INDEX IF EXISTS idx_invoices_monthly_subscription_id;
DROP INDEX IF EXISTS idx_class_participants_billing;
DROP INDEX IF EXISTS idx_classes_billing_month;

-- 5. Remover coluna de invoices
ALTER TABLE public.invoices DROP COLUMN IF EXISTS monthly_subscription_id;

-- 6. Remover tabelas (cascata remove dependências)
DROP TABLE IF EXISTS public.student_monthly_subscriptions CASCADE;
DROP TABLE IF EXISTS public.monthly_subscriptions CASCADE;
```

---

## Histórico de Revisões

| Versão | Data | Autor | Descrição |
|--------|------|-------|-----------|
| 1.0 | 2025-01-01 | Lovable AI | Versão inicial do documento |
| 1.1 | 2025-01-01 | Lovable AI | Adicionados: pontas soltas 21-30, casos de uso (histórico, datas futuras, aulas experimentais, soft delete), RLS para alunos |
| 1.2 | 2025-01-23 | Lovable AI | Adicionados: pontas soltas 31-40, interfaces TypeScript, query `get_student_subscription_details` para Dashboard do aluno, correção SQL `is_experimental = false` no Apêndice A, RLS adicional para alunos em `monthly_subscriptions` |
| 1.3 | 2025-12-24 | Lovable AI | Adicionados: pontas soltas 41-52, corrigida numeração de seções (5.x → 6.x), implementação completa do hook `useMonthlySubscriptions` (seção 6.4), Zod schema de validação (seção 6.5), RLS para alunos em `monthly_subscriptions` no Apêndice A |
| 1.4 | 2025-12-24 | Lovable AI | Adicionados: pontas soltas 53-60 (badge inconsistente, INNER JOIN, invoice_classes NULL, RPC v2, dependent_id, regra starts_at, RLS duplicada), correção SQL Apêndice A (removida RLS duplicada, adicionado comentário versão 1.4) |
| 1.5 | 2025-12-24 | Lovable AI | Adicionados: pontas soltas 61-72 (coluna monthly_subscription_id, tabelas inexistentes, arquivos TypeScript faltantes, namespace i18n, componentes, RPC incompatível). Nova seção 4.1 "Estado Atual vs. Planejado" com tabela comparativa. Nova seção 4.2 "Checklist de Pré-Implementação" com fases ordenadas. Consolidação de duplicatas (#44/#54/#70, #57/#72). Marcação de #58 como resolvido. Correção de numeração (5.0 → 5.1). |
| 1.6 | 2025-12-24 | Lovable AI | Adicionados: pontas soltas 73-84 (numeração duplicada no sumário, seções Frontend/Backend ambas "6", subseção 5.3.1 mal posicionada, query `!inner` em Financeiro.tsx, automated-billing sem verificação de mensalidade, conflito invoice_type, funções SQL inexistentes, StudentDashboard sem "Meu Plano"). Corrigido: sumário sem duplicatas, numeração sequencial das seções (Frontend=6, Backend=7, i18n=8, Testes=9, Cronograma=10, Riscos=11, Apêndice A=12, Apêndice B=13), subseção 5.3.1 movida para 6.6. Atualizada tabela 4.1 com novos itens comparativos. Adicionados itens ao checklist 4.2 para verificações de numeração e testes de query. |
| 1.7 | 2025-12-24 | Lovable AI | Adicionados: pontas soltas 85-96 (diretório src/schemas inexistente, invoice_type sem valor documentado, confirmações de constraints NOT NULL via banco, regras de cobrança para cenários específicos, comportamento de starts_at, múltiplos professores, cancelamento mid-month, verificação de getInvoiceTypeBadge, consistência de get_student_subscription_details, verificação de update_updated_at_column). Nova seção 5.6 "Regras de Cobrança Detalhadas" com 5 subseções cobrindo: mensalidade R$0 + excedentes, transição de starts_at, múltiplos professores, cancelamento no meio do mês, valor mínimo para boleto. Atualizado Apêndice A versão 1.5 com verificações pré-migração. Atualizado checklist 4.2 com itens de criação de diretório e testes de cenários específicos. Atualizada tabela 4.1 com status de itens corrigidos (✅) e novos gaps identificados. |
| 1.8 | 2025-12-24 | Lovable AI | Adicionados: pontas soltas 97-108 (getInvoiceTypeBadge inexistente, ClassServicesManager não referenciado, conflito namespace i18n subscription/subscriptions, valores invoice_type incompletos, rollback script sem triggers, RLS policy duplicada, StudentDashboard sem múltiplos professores, DROP NOT NULL disperso, validação business_profile_id, placeholders de data, valor mínimo boleto indefinido). Corrigidos: rollback script completo com triggers (#101), RLS policy renomeada (#102), SQL consolidado no Apêndice A seção 0.2 (#104), datas no histórico (#106), MIN_BOLETO_VALUE=5.00 definido (#107), seção 6.6 atualizada com ClassServicesManager (#108). Atualizado Apêndice A para versão 1.6. Sumário atualizado para referenciar nova seção 6.6. |
| 1.9 | 2025-12-24 | Lovable AI | Adicionados: pontas soltas 109-120 (InvoiceStatusBadge sem invoice_type, conflito namespace i18n confirmado, bug notifications em i18n/index.ts, src/types sem estrutura, Servicos.tsx wrapper simples, business_profile_id nullable, funções SQL inexistentes confirmadas, constraints NOT NULL confirmadas via banco, 'regular' não existe no banco, INNER JOIN confirmado em Financeiro.tsx, regeneração tipos não documentada). Corrigidos: removido 'regular' da documentação de invoice_type (#118), adicionada regeneração de tipos ao checklist de deploy (#120), decisão de namespace i18n tomada (usar `monthlySubscriptions.json` separado de `subscription.json`) (#110), documentado bug de namespace `notifications` (#111). Nova seção 8.0 "Nota sobre Namespaces" explicando conflito e decisão. Nova seção 6.3.1 "InvoiceStatusBadge.tsx" com implementação de prop invoiceType. Expandida seção 6.3 com alterações em Financeiro.tsx e StudentDashboard.tsx. Atualizado Apêndice A seção 0.3 removendo 'regular'. Atualizado checklist 4.2 Fase 3 com decisão de namespace e bug de notifications. Atualizada tabela 4.1 com novos itens de InvoiceStatusBadge, namespace i18n, e regeneração de tipos. |
| 1.10 | 2025-12-24 | Lovable AI | Adicionados: pontas soltas 121-132 (namespace inconsistente nos exemplos de código, hook useStudentSubscriptionAssignment sem implementação documentada, clarificação Servicos.tsx vs ClassServicesManager, diagrama ASCII inconsistente, billing_day nullable sem fallback documentado, tipos TypeScript para novas tabelas, zero referências a monthly_subscription no código é PRÉ-REQUISITO, StudentDashboard sem "Meus Planos", namespace password não verificado, validação overagePrice quando hasLimit=false, datas inconsistentes no histórico, versão Apêndice A desincronizada). Corrigidos: todos os exemplos de código agora usam `useTranslation('monthlySubscriptions')` ao invés de `useTranslation('subscriptions')` (#121), adicionada implementação completa de `useStudentSubscriptionAssignment` na seção 6.4.1 (#122), clarificado que Tabs vão em `Servicos.tsx` e não em `ClassServicesManager.tsx` (#123), adicionada validação de `overagePrice = null` quando `hasLimit = false` no schema Zod (#130), sincronizada versão do Apêndice A para v1.10 (#132). Atualizada seção 6.4 com novo hook de atribuição. Atualizada seção 6.5 com validação adicional de overagePrice. Atualizado checklist 4.2 com novos itens de verificação. Atualizada tabela 4.1 com status de correções. |
| 1.11 | 2025-12-24 | Lovable AI | Adicionados: pontas soltas 133-144 (mapeamento invoice_type incompleto em Financeiro.tsx, confirmação invoices.monthly_subscription_id não existe, confirmação constraints NOT NULL em invoice_classes, arquivos monthlySubscriptions.json não criados, namespace monthlySubscriptions não registrado em i18n/index.ts, InvoiceStatusBadge sem prop invoiceType confirmado, diretório src/schemas não existe confirmado, src/types sem monthly-subscriptions.ts, zero componentes de mensalidade implementados, default_billing_day nullable com fallback OK, datas consistentes no histórico, seção 6.1 usa subscriptions.json antigo). Corrigidos: seção 6.1 atualizada para usar `monthlySubscriptions.json` (#144), adicionado exemplo completo de mapeamento `getInvoiceTypeBadge` na seção 6.3.2.1 (#133), marcados itens confirmados via banco/código com status apropriado, atualizada tabela 4.1 com novos gaps identificados e status de confirmações. Atualizado checklist 4.2 Fase 3 com itens de criação de arquivos i18n. Atualizada seção 6.3.2 com função de mapeamento de invoice_type. |
| 1.12 | 2025-12-24 | Lovable AI | Adicionados: pontas soltas 145-156 (`'regular'` É DEFAULT válido - erro v1.9, `password.json` órfão, `automated-billing` sem verificação, contradição ClassServicesManager na seção 6.1, `invoice_type` sem CHECK constraint, referências de linha desatualizadas, Apêndice A desincronizado, `pending_amount` não existe no banco, confirmação final `monthly_subscription_id` não existe). **CORREÇÕES CRÍTICAS**: Revertido erro da v1.9 - `'regular'` É valor DEFAULT válido de `invoice_type` (#145/#155), atualizado Apêndice A seção 0.3 para incluir `'regular'`. Corrigida seção 6.1 - `ClassServicesManager.tsx` marcado como INALTERADO (#149). Documentado `pending_amount` como não existente com recomendação de simplificar para MVP (#154). Documentado bug `password.json` como existente mas fora do escopo (#146). Atualizada tabela 4.1 com status corrigido para `'regular'`. |
| 1.13 | 2025-12-24 | Lovable AI | Adicionados: pontas soltas 157-168 (namespace `notifications` órfão, `password.json` sem registro, confirmação `'regular'` é DEFAULT via query direta, valores de `invoice_type` usados vs. default, Apêndice A desatualizado, constraints NOT NULL confirmadas, arquivos i18n inexistentes, INNER JOIN confirmado, interface `InvoiceWithStudent` sem `monthly_subscription_id`, JOIN com tabela inexistente, filtro `invoice_type` não implementado). **CORREÇÕES**: Sincronizado Apêndice A para v1.13 (#161). Adicionada nota de PRÉ-REQUISITOS na seção 6.3.2 (#167). Documentada interface `InvoiceWithStudent` atualizada com `monthly_subscription_id` e `monthly_subscription` (#166). Corrigida nota sobre `'regular'` - agora documenta corretamente como DEFAULT válido (#159). Documentados bugs de i18n (`notifications` órfão, `password.json` sem registro) como issues separados (#157/#158). |

---

**Fim do Documento**
