# Tarefas de Implementação: Sistema de Mensalidades

> **Baseado em:** `docs/monthly-subscriptions-implementation-plan.md` v1.38  
> **Data:** 2025-01-30  
> **Total:** 7 Fases | 28 Grupos | 111 Tarefas  
> **Tempo Estimado:** 6-8 dias

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Grafo de Dependências](#grafo-de-dependências)
3. [Fase 1: Banco de Dados (Dia 1 - CRÍTICO)](#fase-1-banco-de-dados-dia-1---crítico)
4. [Fase 2: Internacionalização (Dia 1)](#fase-2-internacionalização-dia-1)
5. [Fase 3: Tipos TypeScript e Schemas (Dia 2)](#fase-3-tipos-typescript-e-schemas-dia-2)
6. [Fase 4: Hooks React (Dia 2)](#fase-4-hooks-react-dia-2)
7. [Fase 5: Componentes Frontend (Dias 3-4)](#fase-5-componentes-frontend-dias-3-4)
8. [Fase 6: Backend - Edge Functions (Dia 5)](#fase-6-backend---edge-functions-dia-5)
9. [Fase 7: Testes e Validações (Dia 6)](#fase-7-testes-e-validações-dia-6)
10. [Resumo e Métricas](#resumo-e-métricas)

---

## Visão Geral

Este documento organiza a implementação do sistema de mensalidades em tarefas granulares, agrupadas por fase e área técnica. Cada tarefa referencia a seção correspondente no plano de implementação e os gaps identificados.

### Legenda de Prioridades

| Prioridade | Significado |
|------------|-------------|
| 🔴 Crítica | Bloqueia outras tarefas, deve ser feita primeiro |
| 🟠 Alta | Importante para funcionalidade core |
| 🟡 Média | Melhoria de UX ou casos secundários |
| 🟢 Baixa | Nice-to-have, pode ser postergada |

### Legenda de Status

- [ ] Pendente
- [x] Concluída
- [~] Em progresso
- [!] Bloqueada

---

## Grafo de Dependências

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   ┌──────────────────┐                                          │
│   │   FASE 1         │                                          │
│   │   Banco de Dados │ ◄─── PRÉ-REQUISITO OBRIGATÓRIO           │
│   │   (Crítico)      │                                          │
│   └────────┬─────────┘                                          │
│            │                                                    │
│            ├──────────────────┬──────────────────┐              │
│            ▼                  ▼                  ▼              │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│   │   FASE 2     │   │   FASE 3     │   │   FASE 6     │        │
│   │   i18n       │   │   Tipos TS   │   │   Backend    │        │
│   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘        │
│          │                  │                  │                │
│          └────────┬─────────┘                  │                │
│                   ▼                            │                │
│          ┌──────────────┐                      │                │
│          │   FASE 4     │                      │                │
│          │   Hooks      │                      │                │
│          └──────┬───────┘                      │                │
│                 │                              │                │
│                 ▼                              │                │
│          ┌──────────────┐                      │                │
│          │   FASE 5     │                      │                │
│          │   Frontend   │                      │                │
│          └──────┬───────┘                      │                │
│                 │                              │                │
│                 └──────────────┬───────────────┘                │
│                                ▼                                │
│                       ┌──────────────┐                          │
│                       │   FASE 7     │                          │
│                       │   Testes     │                          │
│                       └──────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**⚠️ ALERTA CRÍTICO:** A FASE 1 (Banco de Dados) é PRÉ-REQUISITO OBRIGATÓRIO. Não iniciar nenhuma outra fase sem concluir a migração SQL e regenerar os tipos TypeScript.

---

## Fase 1: Banco de Dados (Dia 1 - CRÍTICO)

### Grupo 1A: Tabelas e Colunas

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 1.1 | [ ] | Criar tabela `monthly_subscriptions` com campos: `id`, `teacher_id`, `name`, `description`, `price`, `max_classes`, `overage_price`, `is_active`, `created_at`, `updated_at` | §3.1 | 🔴 Crítica |
| 1.2 | [ ] | Criar tabela `student_monthly_subscriptions` com campos: `id`, `subscription_id`, `relationship_id`, `starts_at`, `ends_at`, `is_active`, `created_at`, `updated_at` | §3.2 | 🔴 Crítica |
| 1.3 | [ ] | Adicionar coluna `monthly_subscription_id UUID REFERENCES monthly_subscriptions(id)` na tabela `invoices` | §3.3, Gap #329 | 🔴 Crítica |
| 1.4 | [ ] | Alterar `invoice_classes.class_id` para nullable (`ALTER COLUMN class_id DROP NOT NULL`) | Gap #328, #56 | 🔴 Crítica |
| 1.5 | [ ] | Alterar `invoice_classes.participant_id` para nullable (`ALTER COLUMN participant_id DROP NOT NULL`) | Gap #328, #56 | 🔴 Crítica |

### Grupo 1B: Funções SQL e RPCs

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 1.6 | [ ] | Criar função `get_student_active_subscription(p_relationship_id UUID) RETURNS TABLE` | §3.4, Gap #362 | 🔴 Crítica |
| 1.7 | [ ] | Criar função `count_completed_classes_in_month(p_teacher_id UUID, p_student_id UUID, p_year INT, p_month INT) RETURNS INT` | §3.4, Gap #362 | 🔴 Crítica |
| 1.8 | [ ] | Criar função `get_subscription_students_count(p_subscription_id UUID) RETURNS INT` | §3.4 | 🟠 Alta |
| 1.9 | [ ] | Criar função `get_subscriptions_with_students(p_teacher_id UUID) RETURNS TABLE` | §3.4 | 🟠 Alta |
| 1.10 | [ ] | Criar função `get_subscription_assigned_students(p_subscription_id UUID) RETURNS TABLE` | §3.4 | 🟠 Alta |
| 1.11 | [ ] | Criar função `check_student_has_active_subscription(p_relationship_id UUID, p_exclude_subscription_id UUID) RETURNS BOOLEAN` | §3.4 | 🟠 Alta |
| 1.12 | [ ] | Criar função `get_student_subscription_details(p_student_id UUID) RETURNS TABLE` para StudentDashboard | §5.6.3, Gap #79 | 🟠 Alta |

### Grupo 1C: Políticas RLS

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 1.13 | [ ] | Criar política RLS: professores podem gerenciar suas mensalidades em `monthly_subscriptions` (USING teacher_id = auth.uid()) | §3.1 | 🔴 Crítica |
| 1.14 | [ ] | Criar política RLS: alunos podem visualizar mensalidades ativas onde estão vinculados | Gap #48 | 🔴 Crítica |
| 1.15 | [ ] | Criar política RLS: professores podem gerenciar assinaturas em `student_monthly_subscriptions` | §3.2 | 🔴 Crítica |
| 1.16 | [ ] | Criar política RLS: alunos podem ver suas próprias assinaturas em `student_monthly_subscriptions` | §3.2 | 🔴 Crítica |

### Grupo 1D: Índices, Constraints e Triggers

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 1.17 | [ ] | Criar índice único parcial: `CREATE UNIQUE INDEX ... ON student_monthly_subscriptions(relationship_id) WHERE is_active = true` | §3.2, #331 | 🔴 Crítica |
| 1.18 | [ ] | Criar índices de performance em `monthly_subscriptions` (teacher_id, is_active) | §3.5 | 🟠 Alta |
| 1.19 | [ ] | Criar índices de performance em `student_monthly_subscriptions` (subscription_id, relationship_id) | §3.5 | 🟠 Alta |
| 1.20 | [ ] | Criar índice em `invoices.monthly_subscription_id` | §3.3 | 🟠 Alta |
| 1.21 | [ ] | Criar trigger para atualização automática de `updated_at` em `monthly_subscriptions` | §3.1 | 🟠 Alta |
| 1.22 | [ ] | Criar trigger para atualização automática de `updated_at` em `student_monthly_subscriptions` | §3.2 | 🟠 Alta |
| 1.23 | [ ] | Criar trigger para soft delete (impedir DELETE físico em `monthly_subscriptions`, forçar uso de is_active) | §5.5, Gap #86 | 🟡 Média |

### Grupo 1E: Regeneração de Tipos

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 1.24 | [ ] | Executar comando: `npx supabase gen types typescript --project-id nwgomximjevgczwuyqcx > src/integrations/supabase/types.ts` | Gap #372 | 🔴 Crítica |

### ✅ Checkpoint Fase 1

```sql
-- Verificar tabelas criadas
SELECT * FROM monthly_subscriptions LIMIT 1;
SELECT * FROM student_monthly_subscriptions LIMIT 1;

-- Verificar funções
SELECT get_student_active_subscription('00000000-0000-0000-0000-000000000000'::uuid);
SELECT count_completed_classes_in_month(
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  2025, 1
);

-- Verificar nova coluna em invoices
SELECT monthly_subscription_id FROM invoices LIMIT 1;

-- Verificar nullability em invoice_classes
\d invoice_classes
```

---

## Fase 2: Internacionalização (Dia 1)

### Grupo 2A: Criação de Arquivos i18n

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 2.1 | [ ] | Criar arquivo `src/i18n/locales/pt/monthlySubscriptions.json` com traduções completas | §8.1, Gap #322 | 🟠 Alta |
| 2.2 | [ ] | Criar arquivo `src/i18n/locales/en/monthlySubscriptions.json` com traduções completas | §8.2, Gap #322 | 🟠 Alta |
| 2.3 | [ ] | Registrar namespace `monthlySubscriptions` no array `ns` em `src/i18n/index.ts` | Gap #360 | 🟠 Alta |

### Grupo 2B: Atualização de Traduções Existentes

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 2.4 | [ ] | Adicionar `invoiceTypes.monthlySubscription` em `src/i18n/locales/pt/financial.json` e `en/financial.json` | Gap #332, #338 | 🟠 Alta |
| 2.5 | [ ] | Adicionar `invoiceTypes.automated` em `financial.json` (PT/EN) | Gap #339 | 🟠 Alta |
| 2.6 | [ ] | Adicionar `invoiceTypes.manual` em `financial.json` (PT/EN) | Gap #339 | 🟠 Alta |
| 2.7 | [ ] | Adicionar `invoiceTypes.orphanCharges` em `financial.json` (PT/EN) | Gap #348, #358 | 🟠 Alta |
| 2.8 | [ ] | Adicionar `invoiceTypes.regular` (fallback/default) em `financial.json` (PT/EN) | Gap #369 | 🟠 Alta |

### ✅ Checkpoint Fase 2

```typescript
// Verificar carregamento sem erros no console
import { useTranslation } from 'react-i18next';

const { t } = useTranslation('monthlySubscriptions');
console.log(t('title')); // Deve exibir "Mensalidades" ou "Monthly Subscriptions"

const { t: tFinancial } = useTranslation('financial');
console.log(tFinancial('invoiceTypes.monthlySubscription')); // Deve exibir "Mensalidade"
```

---

## Fase 3: Tipos TypeScript e Schemas (Dia 2)

### Grupo 3A: Diretório e Estrutura

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 3.1 | [ ] | Criar diretório `src/schemas` (se não existir) | Gap #139 | 🟠 Alta |

### Grupo 3B: Interfaces TypeScript

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 3.2 | [ ] | Criar arquivo `src/types/monthly-subscriptions.ts` com interface `MonthlySubscription` | §5.1, Gap #65 | 🟠 Alta |
| 3.3 | [ ] | Adicionar interface `StudentMonthlySubscription` | §5.1 | 🟠 Alta |
| 3.4 | [ ] | Adicionar interface `MonthlySubscriptionFormData` | §5.1 | 🟠 Alta |
| 3.5 | [ ] | Adicionar interface `MonthlySubscriptionWithCount` (inclui contagem de alunos) | §5.1 | 🟠 Alta |
| 3.6 | [ ] | Adicionar interface `AssignedStudent` | §5.1 | 🟠 Alta |
| 3.7 | [ ] | Adicionar interface `StudentSubscriptionDetails` (para visão do aluno) | §5.6.3 | 🟠 Alta |
| 3.8 | [ ] | Adicionar interfaces `TeacherStudentRelationship` e `ActiveSubscription` para uso no backend | Gap #363 | 🟡 Média |

### Grupo 3C: Zod Schema

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 3.9 | [ ] | Criar arquivo `src/schemas/monthly-subscription.schema.ts` com `monthlySubscriptionSchema` | §6.5, Gap #67 | 🟠 Alta |
| 3.10 | [ ] | Incluir validação condicional: `overage_price` obrigatório apenas se `max_classes > 0` | §6.5 | 🟠 Alta |

### Grupo 3D: Atualização de Interfaces Existentes

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 3.11 | [ ] | Atualizar interface `InvoiceWithStudent` em `src/pages/Financeiro.tsx` adicionando `monthly_subscription_id?: string` | Gap #323, #340 | 🟠 Alta |
| 3.12 | [ ] | Adicionar campo `monthly_subscription?: { name: string }` na interface `InvoiceWithStudent` | Gap #357 | 🟠 Alta |

### ✅ Checkpoint Fase 3

```typescript
// Verificar compilação sem erros
import type { MonthlySubscription, StudentMonthlySubscription } from '@/types/monthly-subscriptions';
import { monthlySubscriptionSchema } from '@/schemas/monthly-subscription.schema';

// Teste básico do schema
const result = monthlySubscriptionSchema.safeParse({
  name: 'Plano Básico',
  price: 200,
  max_classes: 4,
  overage_price: 60
});
console.log(result.success); // true
```

---

## Fase 4: Hooks React (Dia 2)

### Grupo 4A: Hook Principal

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 4.1 | [ ] | Criar arquivo `src/hooks/useMonthlySubscriptions.ts` | §6.4, Gap #66 | 🔴 Crítica |
| 4.2 | [ ] | Implementar `useMonthlySubscriptions(includeInactive?: boolean)` - listar mensalidades do professor | §6.4 | 🔴 Crítica |
| 4.3 | [ ] | Implementar `useSubscriptionStudents(subscriptionId: string)` - listar alunos de uma mensalidade | §6.4 | 🔴 Crítica |
| 4.4 | [ ] | Implementar `useCreateMonthlySubscription()` - mutação para criar mensalidade | §6.4 | 🔴 Crítica |
| 4.5 | [ ] | Implementar `useUpdateMonthlySubscription()` - mutação para atualizar mensalidade | §6.4 | 🟠 Alta |
| 4.6 | [ ] | Implementar `useToggleMonthlySubscription()` - mutação para ativar/desativar | §6.4 | 🟠 Alta |

### Grupo 4B: Hooks de Atribuição de Alunos

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 4.7 | [ ] | Implementar `useAvailableStudentsForSubscription(subscriptionId: string)` - alunos sem mensalidade ativa | §6.4.1 | 🟠 Alta |
| 4.8 | [ ] | Implementar `useAssignStudentToSubscription()` - mutação para atribuir aluno | §6.4 | 🟠 Alta |
| 4.9 | [ ] | Implementar `useRemoveStudentFromSubscription()` - mutação para remover aluno | §6.4 | 🟠 Alta |
| 4.10 | [ ] | Implementar `useBulkAssignStudents()` - atribuição em lote | §6.4.1 | 🟠 Alta |

### ✅ Checkpoint Fase 4

```typescript
// Verificar hooks funcionais (sem erros no console)
const { data, isLoading } = useMonthlySubscriptions();
console.log(data); // [] (lista vazia mas sem erros)

const createMutation = useCreateMonthlySubscription();
console.log(createMutation.isPending); // false
```

---

## Fase 5: Componentes Frontend (Dias 3-4)

### Grupo 5A: Componentes Novos

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 5.1 | [ ] | Criar `src/components/MonthlySubscriptionsManager.tsx` - lista de mensalidades com ações | §6.2.1, Gap #69 | 🔴 Crítica |
| 5.2 | [ ] | Criar `src/components/MonthlySubscriptionCard.tsx` - card individual de mensalidade | §6.2.2 | 🔴 Crítica |
| 5.3 | [ ] | Criar `src/components/MonthlySubscriptionModal.tsx` - modal de criação/edição | §6.2.3 | 🔴 Crítica |
| 5.4 | [ ] | Criar `src/components/StudentSubscriptionSelect.tsx` - seletor de alunos para atribuição | §6.2.4 | 🟠 Alta |

### Grupo 5B: Modificação de Servicos.tsx

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 5.5 | [ ] | Modificar `src/pages/Servicos.tsx` para usar Tabs: "Serviços" e "Mensalidades" | §6.6.2, Gap #113 | 🔴 Crítica |
| 5.6 | [ ] | Integrar `MonthlySubscriptionsManager` na Tab "Mensalidades" | §6.6.2 | 🔴 Crítica |
| 5.7 | [ ] | Manter `ClassServicesManager` inalterado na Tab "Serviços" | §6.6.3 | - |

### Grupo 5C: Modificação de Financeiro.tsx

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 5.8 | [ ] | Alterar INNER JOIN para LEFT JOIN em `loadInvoiceDetails` (linhas ~280-298) para não excluir faturas sem aulas | Gap #321, #44 | 🔴 Crítica |
| 5.9 | [ ] | Adicionar LEFT JOIN com `monthly_subscriptions(name)` na query para obter nome do plano | Gap #357 | 🟠 Alta |
| 5.10 | [ ] | Expandir função `getInvoiceTypeBadge` com TODOS os 6 cases: `monthly_subscription`, `automated`, `manual`, `cancellation`, `orphan_charges`, `default` | Gap #320, #339, #355 | 🔴 Crítica |
| 5.11 | [ ] | Passar função `t` (useTranslation) para `getInvoiceTypeBadge` para i18n completo | §6.3.2.1 | 🟠 Alta |

### Grupo 5D: Modificação de InvoiceStatusBadge.tsx

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 5.12 | [ ] | Adicionar prop `invoiceType?: string` ao componente `InvoiceStatusBadge` | Gap #344, §6.3.1 | 🟠 Alta |
| 5.13 | [ ] | Refatorar labels hardcoded para usar `useTranslation('financial')` | Gap #336 | 🟠 Alta |

### Grupo 5E: Modificação de PerfilAluno.tsx

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 5.14 | [ ] | Adicionar badge de mensalidade ativa no cabeçalho do perfil do aluno | Gap #353, Ponta #24 | 🟠 Alta |
| 5.15 | [ ] | Adicionar barra de progresso de aulas usadas (se limite definido) | Ponta #51 | 🟡 Média |

### Grupo 5F: Modificação de StudentDashboard.tsx

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 5.16 | [ ] | Criar seção "Meus Planos" no dashboard do aluno | §6.3.3, Gap #71, #103 | 🟠 Alta |
| 5.17 | [ ] | Suportar múltiplos professores (um card por professor com mensalidade) | §5.6.3 | 🟠 Alta |
| 5.18 | [ ] | Exibir uso de aulas (X/Y) e barra de progresso para cada mensalidade | §5.6.3 | 🟠 Alta |

### Grupo 5G: Modificação de Faturas.tsx

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 5.19 | [ ] | Exibir badge `invoice_type` para alunos distinguirem faturas de mensalidade vs. avulsas | Gap #350 | 🟠 Alta |
| 5.20 | [ ] | Passar prop `invoiceType` para `InvoiceStatusBadge` | Gap #350 | 🟠 Alta |

### Grupo 5H: Modificação de Recibo.tsx

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 5.21 | [ ] | Refatorar texto hardcoded de `payment_origin` para usar i18n | Gap #343 | 🟡 Média |

### ✅ Checkpoint Fase 5

```
Testes manuais:
1. ✅ Acessar Serviços → Ver tabs "Serviços" e "Mensalidades"
2. ✅ Criar mensalidade com limite de aulas
3. ✅ Atribuir alunos à mensalidade
4. ✅ Verificar badge em Financeiro (tipo "Mensalidade")
5. ✅ Aluno visualiza "Meus Planos" no Dashboard
6. ✅ Recibo exibe origem do pagamento traduzida
```

---

## Fase 6: Backend - Edge Functions (Dia 5)

### Grupo 6A: Modificação de automated-billing

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 6.1 | [ ] | Verificar mensalidade ativa via RPC `get_student_active_subscription` após obter relacionamento (após linha ~79) | Gap #318, #334, §7.1 | 🔴 Crítica |
| 6.2 | [ ] | Implementar lógica de separação por `starts_at`: aulas antes da data = cobrança por aula; após = mensalidade | §5.6.2, Gap #352 | 🔴 Crítica |
| 6.3 | [ ] | Criar fatura com `invoice_type = 'monthly_subscription'` quando aplicável | §7.2 | 🔴 Crítica |
| 6.4 | [ ] | Calcular e adicionar excedentes quando `classCount > max_classes` usando `overage_price` | §7.2 | 🟠 Alta |
| 6.5 | [ ] | Vincular `monthly_subscription_id` na fatura criada | §7.2 | 🟠 Alta |

### Grupo 6B: Modificação de send-invoice-notification

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 6.6 | [ ] | Verificar `invoice_type === 'monthly_subscription'` e personalizar template de email | §7.3, Gap #351 | 🟠 Alta |
| 6.7 | [ ] | Buscar dados da mensalidade via RPC para incluir no template (nome, limite, uso) | §7.3, Gap #366 | 🟠 Alta |
| 6.8 | [ ] | Incluir informações de excedentes no email quando aplicável | §7.3 | 🟠 Alta |

### Grupo 6C: Adaptação de RPC

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 6.9 | [ ] | Adaptar função `create_invoice_and_mark_classes_billed` para aceitar `item_type='monthly_base'` com `class_id=NULL` e `participant_id=NULL` | Gap #324, #371 | 🟠 Alta |

### ✅ Checkpoint Fase 6

```bash
# Verificar via logs de edge function
1. Executar automated-billing para aluno COM mensalidade ativa
2. Verificar fatura criada com invoice_type='monthly_subscription'
3. Verificar email enviado contendo nome do plano
4. Testar cenário com excedentes (5 aulas quando limite é 4)
```

---

## Fase 7: Testes e Validações (Dia 6)

### Grupo 7A: Testes Unitários

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 7.1 | [ ] | T01: Testar criação de mensalidade válida | §9.1 | 🟠 Alta |
| 7.2 | [ ] | T02: Testar validação de nome obrigatório | §9.1 | 🟠 Alta |
| 7.3 | [ ] | T03: Testar criação com limite de aulas e preço de excedente | §9.1 | 🟠 Alta |
| 7.4 | [ ] | T04: Testar atribuição de aluno sem conflito | §9.1 | 🟠 Alta |
| 7.5 | [ ] | T05: Testar rejeição de atribuição quando aluno já tem mensalidade ativa | §9.1 | 🟠 Alta |
| 7.6 | [ ] | T06: Testar desativação de mensalidade (soft delete) | §9.1 | 🟠 Alta |
| 7.7 | [ ] | T07: Testar contagem de aulas no mês | §9.1 | 🟠 Alta |
| 7.8 | [ ] | T08: Testar contagem incluindo aulas de dependentes | §9.1 | 🟠 Alta |

### Grupo 7B: Testes de Integração

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 7.9 | [ ] | I01: Testar faturamento automático com mensalidade ativa (valor fixo + excedentes) | §9.2 | 🔴 Crítica |
| 7.10 | [ ] | I02: Testar faturamento sem mensalidade (fluxo tradicional por aula) | §9.2 | 🔴 Crítica |
| 7.11 | [ ] | I03: Testar faturamento com excedentes (6 aulas, limite 4, preço excedente R$60) | §9.2 | 🟠 Alta |
| 7.12 | [ ] | I04: Testar faturamento ilimitado (20 aulas, max_classes=NULL, preço fixo R$300) | §9.2 | 🟠 Alta |
| 7.13 | [ ] | I05: Testar migração de mensalidade (desativar antiga, ativar nova) | §9.2 | 🟡 Média |
| 7.14 | [ ] | I06: Testar cascata ao deletar relacionamento professor-aluno | §9.2 | 🟡 Média |
| 7.15 | [ ] | I07: Testar cancelamento tardio que deve criar fatura de cobrança | §9.2, Gap #370 | 🟠 Alta |

### Grupo 7C: Testes E2E

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 7.16 | [ ] | E01: Fluxo completo - Criar primeira mensalidade via UI | §9.3 | 🔴 Crítica |
| 7.17 | [ ] | E02: Fluxo completo - Atribuir múltiplos alunos a uma mensalidade | §9.3 | 🔴 Crítica |
| 7.18 | [ ] | E03: Fluxo completo - Verificar fatura gerada corretamente no dia de cobrança | §9.3 | 🔴 Crítica |
| 7.19 | [ ] | E04: Fluxo completo - Desativar mensalidade e verificar retorno à cobrança por aula | §9.3 | 🟠 Alta |
| 7.20 | [ ] | E05: Fluxo completo - Aluno visualiza mensalidade no Dashboard | Gap #364 | 🟠 Alta |

### Grupo 7D: Cenários de Edge Cases

| # | Status | Tarefa | Ref. Plano | Prioridade |
|---|--------|--------|------------|------------|
| 7.21 | [ ] | EC01: Testar mensalidade R$0 com excedentes apenas (plano gratuito com limite) | Ponta #18, §5.6.1 | 🟠 Alta |
| 7.22 | [ ] | EC02: Testar aulas realizadas ANTES de `starts_at` são cobradas por aula | §5.6.2 | 🟠 Alta |
| 7.23 | [ ] | EC03: Testar aluno com múltiplos professores, cada um com mensalidade diferente | §5.6.3 | 🟠 Alta |
| 7.24 | [ ] | EC04: Testar cancelamento antes do billing_day vs. após billing_day | §5.6.4 | 🟠 Alta |
| 7.25 | [ ] | EC05: Testar boleto com valor final < R$5,00 (deve pular geração) | §5.6.5, Ponta #42 | 🟠 Alta |
| 7.26 | [ ] | EC06: Testar LEFT JOIN com fatura de mensalidade pura (sem invoice_classes vinculadas a aulas) | Gap #44 | 🟠 Alta |
| 7.27 | [ ] | EC07: Testar i18n alternando entre PT e EN | §4.4 Passo 8 | 🟡 Média |

### ✅ Checkpoint Final

```
Resumo de Testes:
- 8 testes unitários ✅
- 7 testes de integração ✅
- 5 testes E2E ✅
- 7 cenários de edge cases ✅
────────────────────────
Total: 27 cenários de teste
```

---

## Resumo e Métricas

### Distribuição por Fase

| Fase | Grupos | Tarefas | Tempo Estimado |
|------|--------|---------|----------------|
| 1. Banco de Dados | 5 | 24 | 1 dia |
| 2. Internacionalização | 2 | 8 | 0.5 dia |
| 3. Tipos TypeScript | 4 | 12 | 0.5 dia |
| 4. Hooks React | 2 | 10 | 0.5 dia |
| 5. Componentes Frontend | 8 | 21 | 2 dias |
| 6. Backend Edge Functions | 3 | 9 | 1 dia |
| 7. Testes e Validações | 4 | 27 | 1 dia |
| **TOTAL** | **28** | **111** | **6-8 dias** |

### Distribuição por Prioridade

| Prioridade | Quantidade | Percentual |
|------------|------------|------------|
| 🔴 Crítica | 31 | 28% |
| 🟠 Alta | 67 | 60% |
| 🟡 Média | 10 | 9% |
| 🟢 Baixa | 3 | 3% |

### Arquivos a Serem Criados

```
src/
├── components/
│   ├── MonthlySubscriptionsManager.tsx   (novo)
│   ├── MonthlySubscriptionCard.tsx       (novo)
│   ├── MonthlySubscriptionModal.tsx      (novo)
│   └── StudentSubscriptionSelect.tsx     (novo)
├── hooks/
│   └── useMonthlySubscriptions.ts        (novo)
├── types/
│   └── monthly-subscriptions.ts          (novo)
├── schemas/
│   └── monthly-subscription.schema.ts    (novo)
└── i18n/locales/
    ├── pt/monthlySubscriptions.json      (novo)
    └── en/monthlySubscriptions.json      (novo)
```

### Arquivos a Serem Modificados

```
src/
├── pages/
│   ├── Servicos.tsx                      (adicionar tabs)
│   ├── Financeiro.tsx                    (LEFT JOIN, badges)
│   ├── PerfilAluno.tsx                   (badge mensalidade)
│   ├── StudentDashboard.tsx              (seção Meus Planos)
│   ├── Faturas.tsx                       (badge invoice_type)
│   └── Recibo.tsx                        (i18n payment_origin)
├── components/
│   └── InvoiceStatusBadge.tsx            (prop invoiceType)
├── i18n/
│   ├── index.ts                          (namespace)
│   └── locales/
│       ├── pt/financial.json             (invoiceTypes)
│       └── en/financial.json             (invoiceTypes)
└── integrations/supabase/
    └── types.ts                          (regenerado)

supabase/functions/
├── automated-billing/index.ts            (lógica mensalidade)
└── send-invoice-notification/index.ts    (template email)
```

---

## Próximos Passos

Após aprovação deste documento, a implementação seguirá esta ordem:

1. **Executar migração SQL** (Fase 1, Grupos 1A-1D)
2. **Regenerar tipos TypeScript** (Tarefa 1.24)
3. **Criar arquivos i18n** (Fase 2)
4. **Implementar tipos e hooks** (Fases 3-4)
5. **Desenvolver componentes** (Fase 5)
6. **Adaptar edge functions** (Fase 6)
7. **Executar testes** (Fase 7)

---

*Documento gerado em 2025-01-30 | Baseado no plano v1.38*
