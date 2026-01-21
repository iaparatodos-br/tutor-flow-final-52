# Central de Ações do Professor (Teacher Inbox)

## Visão Geral

A Central de Ações é uma funcionalidade que centraliza todas as tarefas pendentes do professor em um único lugar, com um ícone de sino no header mostrando um badge com a contagem total de ações requeridas.

### Problema que Resolve

- Aulas passadas ficam sem confirmação indefinidamente
- Cancelamentos elegíveis para anistia não têm visibilidade
- Professor precisa navegar por múltiplas telas para encontrar pendências
- Faturas atrasadas e relatórios pendentes passam despercebidos

### Solução

- Ícone de sino (🔔) no header com badge de contagem e popover preview
- Página dedicada `/inbox` com lista agrupada de ações
- Ações inline para resolver pendências rapidamente

---

## Arquitetura

### Estrutura de Componentes

```
Header (Layout.tsx)
    └── NotificationBell
            └── Badge com contagem total
            └── Popover com preview das ações urgentes
            └── Clique navega para /inbox
            
/inbox (InboxPage)
    └── InboxSummaryCards (grid de contadores)
    └── InboxActionList (lista agrupada por categoria)
            └── InboxActionItem (item com ações inline)
    └── InboxEmptyState (estado vazio dedicado)
```

### Estrutura de Arquivos

```
src/
├── components/
│   ├── NotificationBell.tsx
│   └── Inbox/
│       ├── InboxSummaryCards.tsx
│       ├── InboxActionList.tsx
│       ├── InboxActionItem.tsx
│       └── InboxEmptyState.tsx
├── hooks/
│   ├── useInboxCounts.ts
│   └── useInboxItems.ts
├── types/
│   └── inbox.ts
├── utils/
│   └── inbox-cache.ts
├── pages/
│   └── Inbox.tsx
└── i18n/locales/
    ├── pt/inbox.json
    └── en/inbox.json
```

---

## Schema de Banco de Dados - Referência

> ⚠️ **IMPORTANTE:** As queries deste documento foram validadas contra o schema real do banco.

### Tabela `classes`

A tabela `classes` **NÃO** possui `student_id` ou `dependent_id`. Esses campos existem apenas em `class_participants`.

Colunas relevantes:
- `id`, `teacher_id`, `class_date`, `status`, `is_group_class`
- `cancelled_at`, `cancellation_reason`, `charge_applied`, `amnesty_granted`
- `service_id`

### Tabela `class_participants`

Representa a participação de alunos (ou dependentes) em uma aula:
- `class_id`, `student_id`, `dependent_id`, `status`
- `confirmed_at`, `completed_at`, `cancelled_at`

### Tabela `invoices`

A tabela `invoices` **NÃO** possui `dependent_id`:
- `id`, `teacher_id`, `student_id`, `amount`, `due_date`, `status`

O `student_id` referencia `profiles.id` (o responsável/adulto).

### Tabela `teacher_student_relationships`

Contém o nome "amigável" do aluno definido pelo professor:
- `teacher_id`, `student_id`, `student_name`

---

## Tipos Compartilhados

**Arquivo:** `src/types/inbox.ts`

```typescript
// Categorias de ações do inbox
export type InboxCategory = 
  | 'pending_past_classes'
  | 'amnesty_eligible'
  | 'overdue_invoices'
  | 'pending_reports';

// Níveis de urgência
export type UrgencyLevel = 'high' | 'medium' | 'low' | 'info';

// Contagens retornadas pela RPC
export interface InboxCounts {
  pending_past_classes: number;
  amnesty_eligible: number;
  overdue_invoices: number;
  pending_reports: number;
  total: number;
}

// Interface compatível com CalendarView.tsx para mapeamento de participantes
export interface InboxClassParticipant {
  id: string;                    // participant row id (obrigatório para CalendarClass)
  student_id: string;
  student_name: string;
  student_email?: string;
  dependent_id?: string | null;
  dependent_name?: string | null;
  responsible_name?: string;
  status: 'pendente' | 'confirmada' | 'cancelada' | 'concluida' | 'removida';
}

// Item individual do inbox
export interface InboxItem {
  id: string;
  category: InboxCategory;
  title: string;
  subtitle: string;
  date: string;
  urgency: UrgencyLevel;
  student_id: string;
  student_name: string;
  dependent_id?: string;
  dependent_name?: string;
  metadata: Record<string, unknown>;
}

// Props do hook useInboxCounts
export interface UseInboxCountsReturn {
  counts: InboxCounts | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Props do hook useInboxItems
export interface UseInboxItemsReturn {
  items: InboxItem[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  hasMore: boolean;
  fetchMore: () => void;
}

// Mapeamento de categoria para configuração visual
export const INBOX_CATEGORY_CONFIG: Record<InboxCategory, {
  icon: string;
  urgency: UrgencyLevel;
  colorClass: string;
  borderClass: string;
  bgClass: string;
  labelKey: string;
}> = {
  pending_past_classes: {
    icon: 'Clock',
    urgency: 'high',
    colorClass: 'text-destructive',
    borderClass: 'border-l-destructive',
    bgClass: 'bg-destructive/5',
    labelKey: 'inbox.categories.pendingPastClasses',
  },
  amnesty_eligible: {
    icon: 'Gift',
    urgency: 'medium',
    colorClass: 'text-warning',
    borderClass: 'border-l-warning',
    bgClass: 'bg-warning/5',
    labelKey: 'inbox.categories.amnestyEligible',
  },
  overdue_invoices: {
    icon: 'AlertCircle',
    urgency: 'high',
    colorClass: 'text-destructive',
    borderClass: 'border-l-destructive',
    bgClass: 'bg-destructive/5',
    labelKey: 'inbox.categories.overdueInvoices',
  },
  pending_reports: {
    icon: 'FileText',
    urgency: 'low',
    colorClass: 'text-primary',
    borderClass: 'border-l-primary',
    bgClass: 'bg-primary/5',
    labelKey: 'inbox.categories.pendingReports',
  },
};

// Estilos por urgência
export const URGENCY_STYLES: Record<UrgencyLevel, {
  border: string;
  background: string;
  iconAnimation?: string;
}> = {
  high: {
    border: 'border-l-4 border-l-destructive',
    background: 'bg-destructive/5',
    iconAnimation: 'animate-pulse',
  },
  medium: {
    border: 'border-l-4 border-l-warning',
    background: 'bg-warning/5',
  },
  low: {
    border: 'border-l-4 border-l-primary',
    background: 'bg-primary/5',
  },
  info: {
    border: 'border-l-4 border-l-muted',
    background: 'bg-muted/5',
  },
};
```

---

## Categorias de Ações

| Categoria | Descrição | Urgência | Ação Principal |
|-----------|-----------|----------|----------------|
| Aulas Passadas | Aulas com status 'pendente' e data < hoje | 🔴 Alta | Marcar Concluída |
| Anistias Pendentes | Cancelamentos com cobrança (últimos 30 dias) | 🟡 Média | Conceder Anistia |
| Faturas Atrasadas | Invoices com status 'overdue' | 🔴 Alta | Ver Fatura |
| Relatórios Pendentes | Aulas concluídas sem class_report | 🔵 Baixa | Criar Relatório |

---

## Fases de Implementação

### Fase 1: MVP (Fundação)

#### Tarefa 1.0: Função RPC PostgreSQL - Contagens

> ⚠️ **ATENÇÃO:** Esta query usa `class_participants` como fonte de dados para aulas, pois `classes` não tem `student_id`.

**Migração SQL:**

```sql
-- ============================================
-- RPC para contagens do inbox
-- ============================================
CREATE OR REPLACE FUNCTION get_teacher_inbox_counts(p_teacher_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_past_classes INT;
  v_amnesty_eligible INT;
  v_overdue_invoices INT;
  v_pending_reports INT;
BEGIN
  -- VALIDAÇÃO DE SEGURANÇA: Garantir que o caller é o próprio professor
  IF auth.uid() IS DISTINCT FROM p_teacher_id THEN
    RAISE EXCEPTION 'Unauthorized: caller must be the teacher';
  END IF;

  -- Aulas passadas pendentes (via class_participants)
  -- Conta AULAS distintas que têm pelo menos um participante pendente
  -- FILTROS: Exclui aulas experimentais e templates
  SELECT COUNT(DISTINCT c.id) INTO v_pending_past_classes
  FROM classes c
  INNER JOIN class_participants cp ON cp.class_id = c.id
  WHERE c.teacher_id = p_teacher_id
    AND c.class_date < NOW()
    AND c.status = 'pendente'
    AND cp.status = 'pendente'
    AND c.is_experimental = false
    AND (c.is_template IS NULL OR c.is_template = false);

  -- Cancelamentos elegíveis para anistia (últimos 30 dias)
  -- Nota: Aqui usamos classes diretamente pois é o status da AULA
  -- FILTROS: Exclui aulas experimentais e templates
  SELECT COUNT(*) INTO v_amnesty_eligible
  FROM classes c
  WHERE c.teacher_id = p_teacher_id
    AND c.status = 'cancelada'
    AND c.charge_applied = true
    AND c.amnesty_granted = false
    AND c.cancelled_at >= NOW() - INTERVAL '30 days'
    AND c.is_experimental = false
    AND (c.is_template IS NULL OR c.is_template = false);

  -- Faturas atrasadas
  -- NOTA: Status 'overdue' é definido pelo edge function check-overdue-invoices
  SELECT COUNT(*) INTO v_overdue_invoices
  FROM invoices i
  WHERE i.teacher_id = p_teacher_id
    AND i.status = 'overdue';

  -- Aulas concluídas sem relatório (últimos 30 dias)
  -- FILTROS: Exclui aulas experimentais e templates
  SELECT COUNT(*) INTO v_pending_reports
  FROM classes c
  LEFT JOIN class_reports cr ON cr.class_id = c.id
  WHERE c.teacher_id = p_teacher_id
    AND c.status = 'concluida'
    AND cr.id IS NULL
    AND c.class_date >= NOW() - INTERVAL '30 days'
    AND c.is_experimental = false
    AND (c.is_template IS NULL OR c.is_template = false);

  RETURN json_build_object(
    'pending_past_classes', COALESCE(v_pending_past_classes, 0),
    'amnesty_eligible', COALESCE(v_amnesty_eligible, 0),
    'overdue_invoices', COALESCE(v_overdue_invoices, 0),
    'pending_reports', COALESCE(v_pending_reports, 0),
    'total', COALESCE(v_pending_past_classes, 0) + COALESCE(v_amnesty_eligible, 0) + 
             COALESCE(v_overdue_invoices, 0) + COALESCE(v_pending_reports, 0)
  );
END;
$$;
```

#### Tarefa 1.1: Função RPC PostgreSQL - Itens Detalhados

> ⚠️ **ATENÇÃO:** 
> - `pending_past_classes` e `pending_reports` usam JOINs com `class_participants` e `teacher_student_relationships`
> - `amnesty_eligible` usa `class_participants` para buscar o participante afetado
> - `overdue_invoices` usa `teacher_student_relationships` para o nome amigável

**Migração SQL:**

```sql
-- ============================================
-- RPC para itens detalhados do inbox por categoria
-- ============================================
CREATE OR REPLACE FUNCTION get_teacher_inbox_items(
  p_teacher_id UUID,
  p_category TEXT,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- VALIDAÇÃO DE SEGURANÇA
  IF auth.uid() IS DISTINCT FROM p_teacher_id THEN
    RAISE EXCEPTION 'Unauthorized: caller must be the teacher';
  END IF;

  CASE p_category
    -- =============================================
    -- AULAS PASSADAS PENDENTES
    -- =============================================
    WHEN 'pending_past_classes' THEN
      SELECT json_agg(item ORDER BY date ASC) INTO v_result
      FROM (
        SELECT DISTINCT ON (c.id)
          c.id,
          'pending_past_classes'::text as category,
          COALESCE(cs.name, 'Aula') as title,
          to_char(c.class_date AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as subtitle,
          c.class_date::text as date,
          'high'::text as urgency,
          cp.student_id,
          COALESCE(tsr.student_name, p.name, 'Aluno') as student_name,
          cp.dependent_id,
          d.name as dependent_name,
          json_build_object(
            'service_id', c.service_id,
            'is_group_class', c.is_group_class,
            'pending_participants', (
              SELECT json_agg(json_build_object(
                'participant_id', cp2.id,
                'student_id', cp2.student_id,
                'student_name', COALESCE(tsr2.student_name, p2.name),
                'dependent_id', cp2.dependent_id,
                'dependent_name', d2.name
              ))
              FROM class_participants cp2
              LEFT JOIN teacher_student_relationships tsr2 
                ON tsr2.teacher_id = c.teacher_id AND tsr2.student_id = cp2.student_id
              LEFT JOIN profiles p2 ON p2.id = cp2.student_id
              LEFT JOIN dependents d2 ON d2.id = cp2.dependent_id
              WHERE cp2.class_id = c.id AND cp2.status = 'pendente'
            )
          ) as metadata
        FROM classes c
        INNER JOIN class_participants cp ON cp.class_id = c.id
        LEFT JOIN teacher_student_relationships tsr 
          ON tsr.teacher_id = c.teacher_id AND tsr.student_id = cp.student_id
        LEFT JOIN profiles p ON p.id = cp.student_id
        LEFT JOIN dependents d ON d.id = cp.dependent_id
        LEFT JOIN class_services cs ON cs.id = c.service_id
        WHERE c.teacher_id = p_teacher_id
          AND c.class_date < NOW()
          AND c.status = 'pendente'
          AND cp.status = 'pendente'
          AND c.is_experimental = false
          AND (c.is_template IS NULL OR c.is_template = false)
        ORDER BY c.id, c.class_date ASC
        LIMIT p_limit OFFSET p_offset
      ) as item;

    -- =============================================
    -- CANCELAMENTOS ELEGÍVEIS PARA ANISTIA
    -- =============================================
    WHEN 'amnesty_eligible' THEN
      SELECT json_agg(item ORDER BY date DESC) INTO v_result
      FROM (
        SELECT 
          c.id,
          'amnesty_eligible'::text as category,
          COALESCE(cs.name, 'Aula cancelada') as title,
          'Cancelado em ' || to_char(c.cancelled_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM') as subtitle,
          c.cancelled_at::text as date,
          'medium'::text as urgency,
          -- Buscar o primeiro participante da aula para exibição
          (SELECT cp.student_id FROM class_participants cp WHERE cp.class_id = c.id LIMIT 1) as student_id,
          COALESCE(
            (SELECT tsr.student_name FROM class_participants cp 
             LEFT JOIN teacher_student_relationships tsr 
               ON tsr.teacher_id = c.teacher_id AND tsr.student_id = cp.student_id
             WHERE cp.class_id = c.id LIMIT 1),
            (SELECT p.name FROM class_participants cp 
             LEFT JOIN profiles p ON p.id = cp.student_id
             WHERE cp.class_id = c.id LIMIT 1),
            'Aluno'
          ) as student_name,
          (SELECT cp.dependent_id FROM class_participants cp WHERE cp.class_id = c.id LIMIT 1) as dependent_id,
          (SELECT d.name FROM class_participants cp 
           LEFT JOIN dependents d ON d.id = cp.dependent_id 
           WHERE cp.class_id = c.id AND cp.dependent_id IS NOT NULL LIMIT 1) as dependent_name,
          json_build_object(
            'cancellation_reason', c.cancellation_reason,
            'class_date', c.class_date,
            'cancelled_by', c.cancelled_by
          ) as metadata
        FROM classes c
        LEFT JOIN class_services cs ON cs.id = c.service_id
        WHERE c.teacher_id = p_teacher_id
          AND c.status = 'cancelada'
          AND c.charge_applied = true
          AND c.amnesty_granted = false
          AND c.cancelled_at >= NOW() - INTERVAL '30 days'
          AND c.is_experimental = false
          AND (c.is_template IS NULL OR c.is_template = false)
        ORDER BY c.cancelled_at DESC
        LIMIT p_limit OFFSET p_offset
      ) as item;

    -- =============================================
    -- FATURAS ATRASADAS
    -- =============================================
    WHEN 'overdue_invoices' THEN
      SELECT json_agg(item ORDER BY date ASC) INTO v_result
      FROM (
        SELECT 
          i.id,
          'overdue_invoices'::text as category,
          'Fatura R$ ' || to_char(i.amount, 'FM999G999D00') as title,
          'Venceu em ' || to_char(i.due_date, 'DD/MM') as subtitle,
          i.due_date::text as date,
          'high'::text as urgency,
          i.student_id,
          COALESCE(tsr.student_name, p.name, 'Aluno') as student_name,
          NULL::uuid as dependent_id,  -- invoices não tem dependent_id
          NULL::text as dependent_name,
          json_build_object(
            'amount', i.amount,
            'days_overdue', GREATEST(0, EXTRACT(DAY FROM NOW() - i.due_date)::INT),
            'invoice_type', i.invoice_type,
            'payment_method', i.payment_method
          ) as metadata
        FROM invoices i
        LEFT JOIN teacher_student_relationships tsr 
          ON tsr.teacher_id = i.teacher_id AND tsr.student_id = i.student_id
        LEFT JOIN profiles p ON p.id = i.student_id
        WHERE i.teacher_id = p_teacher_id
          AND i.status = 'overdue'  -- Status definido pelo edge function check-overdue-invoices
        ORDER BY i.due_date ASC
        LIMIT p_limit OFFSET p_offset
      ) as item;

    -- =============================================
    -- RELATÓRIOS PENDENTES
    -- Retorna dados completos para mapeamento CalendarClass
    -- =============================================
    WHEN 'pending_reports' THEN
      SELECT json_agg(item ORDER BY date DESC) INTO v_result
      FROM (
        SELECT DISTINCT ON (c.id)
          c.id,
          'pending_reports'::text as category,
          COALESCE(cs.name, 'Aula') as title,
          'Realizada em ' || to_char(c.class_date AT TIME ZONE 'America/Sao_Paulo', 'DD/MM') as subtitle,
          c.class_date::text as date,
          'low'::text as urgency,
          cp.student_id,
          COALESCE(tsr.student_name, p.name, 'Aluno') as student_name,
          cp.dependent_id,
          d.name as dependent_name,
          json_build_object(
            'service_id', c.service_id,
            'is_group_class', c.is_group_class,
            'duration_minutes', c.duration_minutes,
            'student_email', COALESCE(p.email, ''),
            'pending_participants', (
              SELECT json_agg(json_build_object(
                'id', cp2.id,
                'student_id', cp2.student_id,
                'student_name', COALESCE(tsr2.student_name, p2.name, 'Aluno'),
                'student_email', COALESCE(p2.email, ''),
                'dependent_id', cp2.dependent_id,
                'dependent_name', d2.name,
                'status', cp2.status
              ))
              FROM class_participants cp2
              LEFT JOIN teacher_student_relationships tsr2 
                ON tsr2.teacher_id = c.teacher_id AND tsr2.student_id = cp2.student_id
              LEFT JOIN profiles p2 ON p2.id = cp2.student_id
              LEFT JOIN dependents d2 ON d2.id = cp2.dependent_id
              WHERE cp2.class_id = c.id
            )
          ) as metadata
        FROM classes c
        LEFT JOIN class_reports cr ON cr.class_id = c.id
        INNER JOIN class_participants cp ON cp.class_id = c.id
        LEFT JOIN teacher_student_relationships tsr 
          ON tsr.teacher_id = c.teacher_id AND tsr.student_id = cp.student_id
        LEFT JOIN profiles p ON p.id = cp.student_id
        LEFT JOIN dependents d ON d.id = cp.dependent_id
        LEFT JOIN class_services cs ON cs.id = c.service_id
        WHERE c.teacher_id = p_teacher_id
          AND c.status = 'concluida'
          AND cr.id IS NULL
          AND c.class_date >= NOW() - INTERVAL '30 days'
          AND c.is_experimental = false
          AND (c.is_template IS NULL OR c.is_template = false)
        ORDER BY c.id, c.class_date DESC
        LIMIT p_limit OFFSET p_offset
      ) as item;

    ELSE
      v_result := '[]'::json;
  END CASE;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;
```

#### Tarefa 1.2: Índices de Banco de Dados

```sql
-- ============================================
-- Índices para otimização das queries do inbox
-- ============================================

-- Índice para aulas por professor/status/data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_classes_teacher_status_date 
ON classes(teacher_id, status, class_date);

-- Índice para aulas canceladas (anistia)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_classes_teacher_cancelled 
ON classes(teacher_id, status, charge_applied, amnesty_granted, cancelled_at)
WHERE status = 'cancelada';

-- Índice para faturas por professor/status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_teacher_status 
ON invoices(teacher_id, status);

-- Índice para relatórios por aula
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_reports_class_id 
ON class_reports(class_id);

-- Índice para participantes por aula/status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_participants_class_status 
ON class_participants(class_id, status);

-- Índice para relacionamentos teacher-student
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tsr_teacher_student 
ON teacher_student_relationships(teacher_id, student_id);
```

#### Tarefa 1.3: Hook useInboxCounts

**Arquivo:** `src/hooks/useInboxCounts.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import type { InboxCounts, UseInboxCountsReturn } from '@/types/inbox';

export function useInboxCounts(): UseInboxCountsReturn {
  const { profile, isProfessor } = useProfile();
  // Nota: queryClient removido pois não é usado neste hook

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inbox-counts', profile?.id],
    queryFn: async () => {
      if (!profile?.id) throw new Error('No profile');
      
      const { data, error } = await supabase
        .rpc('get_teacher_inbox_counts', { p_teacher_id: profile.id });
      
      if (error) throw error;
      return data as InboxCounts;
    },
    enabled: !!profile?.id && isProfessor,
    staleTime: 5 * 60 * 1000, // 5 minutos
    refetchInterval: 60 * 1000, // Polling a cada 1 minuto
    refetchIntervalInBackground: false, // Só quando tab ativa
  });

  return {
    counts: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// Export query key para invalidação externa
export const INBOX_COUNTS_QUERY_KEY = ['inbox-counts'];
```

#### Tarefa 1.4: Hook useInboxItems

**Arquivo:** `src/hooks/useInboxItems.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import type { InboxCategory, InboxItem, UseInboxItemsReturn } from '@/types/inbox';

export function useInboxItems(
  category: InboxCategory,
  options?: { limit?: number; offset?: number; enabled?: boolean }
): UseInboxItemsReturn {
  const { profile, isProfessor } = useProfile();
  // Nota: queryClient removido pois não é usado neste hook
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const enabled = options?.enabled ?? true;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inbox-items', category, profile?.id, limit, offset],
    queryFn: async () => {
      if (!profile?.id) throw new Error('No profile');
      
      const { data, error } = await supabase
        .rpc('get_teacher_inbox_items', {
          p_teacher_id: profile.id,
          p_category: category,
          p_limit: limit,
          p_offset: offset,
        });
      
      if (error) throw error;
      return (data as InboxItem[]) ?? [];
    },
    enabled: !!profile?.id && isProfessor && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutos
  });

  return {
    items: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
    hasMore: (data?.length ?? 0) === limit,
    fetchMore: () => {
      // Para paginação infinita, incrementar offset e refetch
      // Implementação futura se necessário
    },
  };
}

// Export query key prefix para invalidação
export const INBOX_ITEMS_QUERY_KEY_PREFIX = 'inbox-items';
```

#### Tarefa 1.5: Utilitário de Invalidação de Cache

**Arquivo:** `src/utils/inbox-cache.ts`

```typescript
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

type InboxAction = 
  | 'confirmClass' 
  | 'grantAmnesty' 
  | 'payInvoice' 
  | 'createReport' 
  | 'registerPayment'
  | 'sendReminder';

const INVALIDATION_MAP: Record<InboxAction, string[]> = {
  confirmClass: ['inbox-counts', 'inbox-items', 'classes', 'class-participants'],
  grantAmnesty: ['inbox-counts', 'inbox-items', 'classes', 'invoices'],
  payInvoice: ['inbox-counts', 'inbox-items', 'invoices'],
  createReport: ['inbox-counts', 'inbox-items', 'class-reports'],
  registerPayment: ['inbox-counts', 'inbox-items', 'invoices'],
  sendReminder: [], // Não altera contagens
};

export function useInboxCacheInvalidation() {
  const queryClient = useQueryClient();

  const invalidateAfterAction = useCallback((action: InboxAction) => {
    const keys = INVALIDATION_MAP[action] ?? [];
    keys.forEach(key => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
  }, [queryClient]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['inbox-counts'] });
    queryClient.invalidateQueries({ queryKey: ['inbox-items'] });
  }, [queryClient]);

  return { invalidateAfterAction, invalidateAll };
}
```

#### Tarefa 1.6: Componente NotificationBell com Popover

**Arquivo:** `src/components/NotificationBell.tsx`

```tsx
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useInboxCounts } from "@/hooks/useInboxCounts";
import { useIsMobile } from "@/hooks/use-mobile";
import { INBOX_CATEGORY_CONFIG } from "@/types/inbox";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { t } = useTranslation('inbox');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { counts, isLoading } = useInboxCounts();

  const handleClick = () => {
    if (isMobile) {
      navigate('/inbox');
    }
  };

  const handleViewAll = () => {
    navigate('/inbox');
  };

  const total = counts?.total ?? 0;

  // Ordenar categorias por contagem (maior primeiro)
  const sortedCategories = Object.entries(INBOX_CATEGORY_CONFIG)
    .map(([key, config]) => ({
      key: key as keyof typeof INBOX_CATEGORY_CONFIG,
      config,
      count: counts?.[key as keyof typeof counts] ?? 0,
    }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3); // Máximo 3 no preview

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={handleClick}
          aria-label={t('badge.ariaLabel', { count: total })}
        >
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <Badge 
              className={cn(
                "absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs",
                "animate-count-change"
              )}
              variant="destructive"
              role="status"
              aria-label={t('badge.pending', { count: total })}
            >
              {total > 99 ? '99+' : total}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      {!isMobile && (
        <PopoverContent className="w-72 p-3" align="end">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-6 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : total === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('noItems')}
            </p>
          ) : (
            <div className="space-y-2">
              {sortedCategories.map(({ key, config, count }) => (
                <div 
                  key={key}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-md",
                    config.bgClass
                  )}
                >
                  <span className={cn("text-sm font-medium", config.colorClass)}>
                    {t(config.labelKey)}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {count}
                  </Badge>
                </div>
              ))}
              
              <Button 
                variant="link" 
                className="w-full mt-2 text-sm"
                onClick={handleViewAll}
              >
                {t('viewAll', { count: total })} →
              </Button>
            </div>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}
```

#### Tarefa 1.7: Integração no Header (Layout.tsx)

**Arquivo:** `src/components/Layout.tsx`

> ⚠️ **ATENÇÃO:** O código atual em Layout.tsx tem um bug na linha 71 onde apenas `{isAluno}` está renderizado sem condição.

**Modificações necessárias:**

1. **Adicionar import** no topo (após linha 8):
```typescript
import { NotificationBell } from "@/components/NotificationBell";
```

2. **Modificar a desestruturação** do `useAuth()` (linha 17-21) para incluir `isProfessor`:
```typescript
const {
  loading,
  isAuthenticated,
  isAluno,
  isProfessor,  // ADICIONAR
} = useAuth();
```

**Nota:** `useAuth()` já exporta `isProfessor` no `AuthContext.tsx` (linha 481-482), então basta desestruturar.

3. **Corrigir o código bugado** (substituir linhas 69-72):

**Código atual (bugado):**
```tsx
<div className="ml-auto flex items-center gap-4">
  {/* Teacher context switcher for students */}
  {isAluno}
</div>
```

**Código corrigido:**
```tsx
<div className="ml-auto flex items-center gap-4">
  {isProfessor && <NotificationBell />}
  {isAluno && <TeacherContextSwitcher />}
</div>
```

**Código completo do header modificado:**
```tsx
<header className="flex h-16 items-center border-b bg-card px-4">
  <Button variant="ghost" size="sm" onClick={toggle} className="mr-2 hover:bg-accent hover:text-accent-foreground rounded-md p-2 transition-colors">
    <Menu className="h-5 w-5" />
  </Button>
  <span className="font-semibold">TutorFlow</span>
  
  <div className="ml-auto flex items-center gap-4">
    {isProfessor && <NotificationBell />}
    {isAluno && <TeacherContextSwitcher />}
  </div>
</header>
```

#### Tarefa 1.8: Página Inbox

**Arquivo:** `src/pages/Inbox.tsx`

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/contexts/ProfileContext";
import { useInboxCounts } from "@/hooks/useInboxCounts";
import { InboxSummaryCards } from "@/components/Inbox/InboxSummaryCards";
import { InboxActionList } from "@/components/Inbox/InboxActionList";
import { InboxEmptyState } from "@/components/Inbox/InboxEmptyState";

export default function Inbox() {
  const { t } = useTranslation('inbox');
  const { isProfessor } = useProfile();
  const navigate = useNavigate();
  const { counts, isLoading, refetch } = useInboxCounts();

  // Proteção de rota: redirecionar se não for professor
  useEffect(() => {
    if (!isProfessor) {
      navigate('/dashboard');
    }
  }, [isProfessor, navigate]);

  if (!isProfessor) {
    return null;
  }

  const total = counts?.total ?? 0;
  const isEmpty = total === 0 && !isLoading;

  return (
    <Layout requireAuth>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t('title')}
            </h1>
            <p className="text-muted-foreground">
              {total === 0 
                ? t('noItems')
                : total === 1 
                  ? t('subtitleSingular')
                  : t('subtitle', { count: total })
              }
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </Button>
        </div>

        {/* Summary Cards */}
        <InboxSummaryCards counts={counts} isLoading={isLoading} />

        {/* Content */}
        {isEmpty ? (
          <InboxEmptyState />
        ) : (
          <InboxActionList counts={counts} isLoading={isLoading} />
        )}
      </div>
    </Layout>
  );
}
```

#### Tarefa 1.9: Rota no App.tsx

**Arquivo:** `src/App.tsx`

**Modificações necessárias:**

1. Adicionar import (após linha ~41):
```typescript
import Inbox from "./pages/Inbox";
```

2. Adicionar rota antes do catch-all `"*"` (após linha ~157, antes de `<Route path="*" ...>`):
```tsx
<Route path="/inbox" element={<Inbox />} />
```

**Nota:** A proteção de rota é feita dentro do `Inbox.tsx` com redirecionamento, não via wrapper externo.

#### Tarefa 1.10: Componentes da Lista

**Arquivo:** `src/components/Inbox/InboxSummaryCards.tsx`

```tsx
import { useTranslation } from "react-i18next";
import { Clock, Gift, AlertCircle, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InboxCounts, INBOX_CATEGORY_CONFIG } from "@/types/inbox";
import { cn } from "@/lib/utils";

const ICONS = {
  Clock,
  Gift,
  AlertCircle,
  FileText,
};

interface InboxSummaryCardsProps {
  counts: InboxCounts | null;
  isLoading: boolean;
}

export function InboxSummaryCards({ counts, isLoading }: InboxSummaryCardsProps) {
  const { t } = useTranslation('inbox');

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-8 w-12" />
          </Card>
        ))}
      </div>
    );
  }

  const categories = Object.entries(INBOX_CATEGORY_CONFIG) as [
    keyof typeof INBOX_CATEGORY_CONFIG,
    typeof INBOX_CATEGORY_CONFIG[keyof typeof INBOX_CATEGORY_CONFIG]
  ][];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {categories.map(([key, config]) => {
        const Icon = ICONS[config.icon as keyof typeof ICONS];
        const count = counts?.[key] ?? 0;

        return (
          <Card 
            key={key} 
            className={cn(
              "transition-all hover:shadow-md",
              count > 0 && config.bgClass
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn("h-4 w-4", config.colorClass)} />
                <span className="text-sm text-muted-foreground truncate">
                  {t(config.labelKey)}
                </span>
              </div>
              <p className={cn(
                "text-2xl font-bold",
                count > 0 ? config.colorClass : "text-muted-foreground"
              )}>
                {count}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

**Arquivo:** `src/components/Inbox/InboxActionList.tsx`

```tsx
import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InboxCounts, InboxCategory, INBOX_CATEGORY_CONFIG } from "@/types/inbox";
import { useInboxItems } from "@/hooks/useInboxItems";
import { InboxActionItem } from "./InboxActionItem";
import { cn } from "@/lib/utils";

interface InboxActionListProps {
  counts: InboxCounts | null;
  isLoading: boolean;
}

export function InboxActionList({ counts, isLoading }: InboxActionListProps) {
  const { t } = useTranslation('inbox');

  // Ordenar categorias por urgência e contagem
  const sortedCategories = (Object.keys(INBOX_CATEGORY_CONFIG) as InboxCategory[])
    .filter(key => (counts?.[key] ?? 0) > 0)
    .sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2, info: 3 };
      const aUrgency = INBOX_CATEGORY_CONFIG[a].urgency;
      const bUrgency = INBOX_CATEGORY_CONFIG[b].urgency;
      if (urgencyOrder[aUrgency] !== urgencyOrder[bUrgency]) {
        return urgencyOrder[aUrgency] - urgencyOrder[bUrgency];
      }
      return (counts?.[b] ?? 0) - (counts?.[a] ?? 0);
    });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <Accordion 
      type="multiple" 
      defaultValue={sortedCategories.slice(0, 2)} // Abrir as 2 primeiras
      className="space-y-4"
    >
      {sortedCategories.map(category => (
        <CategorySection 
          key={category} 
          category={category} 
          count={counts?.[category] ?? 0} 
        />
      ))}
    </Accordion>
  );
}

interface CategorySectionProps {
  category: InboxCategory;
  count: number;
}

function CategorySection({ category, count }: CategorySectionProps) {
  const { t } = useTranslation('inbox');
  const config = INBOX_CATEGORY_CONFIG[category];
  const { items, isLoading } = useInboxItems(category, { limit: 10 });

  return (
    <AccordionItem value={category} className="border rounded-lg">
      <AccordionTrigger className={cn("px-4 hover:no-underline", config.bgClass)}>
        <div className="flex items-center gap-3">
          <span className={cn("font-medium", config.colorClass)}>
            {t(config.labelKey)}
          </span>
          <Badge variant="secondary">{count}</Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('noItems')}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <InboxActionItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
```

**Arquivo:** `src/components/Inbox/InboxActionItem.tsx`

> **NOTA:** Este componente integra o `ClassReportModal` existente para criar relatórios inline,
> em vez de navegar para outra página. Isso mantém o usuário no contexto do Inbox.

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Gift, Eye, FileText, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { InboxItem, URGENCY_STYLES } from "@/types/inbox";
import { useInboxCacheInvalidation } from "@/utils/inbox-cache";
import { ClassReportModal } from "@/components/ClassReportModal";
import { cn } from "@/lib/utils";

interface InboxActionItemProps {
  item: InboxItem;
}

export function InboxActionItem({ item }: InboxActionItemProps) {
  const { t } = useTranslation('inbox');
  const { toast } = useToast();
  const { profile } = useProfile();
  const { invalidateAfterAction } = useInboxCacheInvalidation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  
  // Estados para ação "Ignorar" com Undo
  const [ignoreTimeoutId, setIgnoreTimeoutId] = useState<number | null>(null);
  
  // Estados para integração com ClassReportModal
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [classDataForReport, setClassDataForReport] = useState<any>(null);

  const urgencyStyle = URGENCY_STYLES[item.urgency];

  const handleConfirmClass = async () => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('classes')
        .update({ status: 'concluida' })
        .eq('id', item.id);

      if (error) throw error;

      // Também atualizar participantes
      await supabase
        .from('class_participants')
        .update({ status: 'concluida', completed_at: new Date().toISOString() })
        .eq('class_id', item.id)
        .eq('status', 'pendente');

      setIsHidden(true);
      invalidateAfterAction('confirmClass');
      toast({
        description: t('toast.classCompleted'),
      });
    } catch (error: any) {
      if (error.code === 'PGRST116') {
        toast({ description: t('toast.alreadyResolved') });
        invalidateAfterAction('confirmClass');
      } else {
        toast({ variant: "destructive", description: t('toast.error') });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // NOTA: Lógica alinhada com AmnestyButton existente (src/components/AmnestyButton.tsx)
  const handleGrantAmnesty = async () => {
    setIsProcessing(true);
    try {
      // 1. Atualizar a aula com todos os campos necessários
      const { error: classError } = await supabase
        .from('classes')
        .update({ 
          amnesty_granted: true, 
          amnesty_granted_at: new Date().toISOString(),
          amnesty_granted_by: profile?.id,
          charge_applied: false  // CRÍTICO: Reverter cobrança aplicada
        })
        .eq('id', item.id);

      if (classError) throw classError;

      // 2. Cancelar fatura de cancelamento relacionada (se existir)
      await supabase
        .from('invoices')
        .update({
          status: 'cancelada',
          description: '[ANISTIADA] Concedida via Central de Ações'
        })
        .eq('class_id', item.id)
        .eq('invoice_type', 'cancellation');

      setIsHidden(true);
      invalidateAfterAction('grantAmnesty');
      toast({
        description: t('toast.amnestyGranted'),
      });
    } catch (error: any) {
      if (error.code === 'PGRST116') {
        toast({ description: t('toast.alreadyResolved') });
        invalidateAfterAction('grantAmnesty');
      } else {
        toast({ variant: "destructive", description: t('toast.error') });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleViewInvoice = () => {
    // Navegar para a fatura ou abrir sheet
    window.location.href = `/faturas?highlight=${item.id}`;
  };

  // Abre o ClassReportModal inline em vez de navegar
  // NOTA: Mapeamento completo para CalendarClass incluindo campos obrigatórios (title, student)
  const handleCreateReport = () => {
    // Calcular end time usando duration_minutes do metadata (ou 60min como fallback)
    const startDate = new Date(item.date);
    const durationMinutes = (item.metadata.duration_minutes as number) || 60;
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
    
    // Mapear participantes com todos os campos obrigatórios
    const participants = (item.metadata.pending_participants as any[])?.map(p => ({
      id: p.id,
      student_id: p.student_id,
      student_name: p.student_name,
      dependent_id: p.dependent_id || null,
      dependent_name: p.dependent_name || null,
      status: p.status || 'concluida',
    })) || [{
      id: '',
      student_id: item.student_id,
      student_name: item.student_name,
      dependent_id: item.dependent_id || null,
      dependent_name: item.dependent_name || null,
      status: 'concluida' as const,
    }];
    
    // Construir dados compatíveis com CalendarClass esperado pelo modal
    // Inclui campos obrigatórios: title, student (com email)
    const classData = {
      id: item.id,
      title: item.title,  // Nome do serviço
      start: startDate,
      end: endDate,
      status: 'concluida' as const,
      student_id: item.student_id,
      student: {
        name: item.student_name,
        email: (item.metadata.student_email as string) || '',
      },
      participants,
      service_id: item.metadata.service_id as string,
      is_group_class: item.metadata.is_group_class as boolean,
      notes: '',
      is_experimental: false,
    };
    
    setClassDataForReport(classData);
    setReportModalOpen(true);
  };
  // Handler para ação "Ignorar" com Undo
  const handleIgnore = () => {
    setIsHidden(true);
    
    // Agendar persistência após 8 segundos (permite undo)
    const timeoutId = window.setTimeout(() => {
      // Persistir no localStorage
      const ignored = JSON.parse(localStorage.getItem('inbox_ignored_items') || '[]');
      localStorage.setItem('inbox_ignored_items', JSON.stringify([...ignored, item.id]));
    }, 8000);
    
    setIgnoreTimeoutId(timeoutId);
    
    toast({
      description: t('toast.itemIgnored'),
      action: (
        <ToastAction 
          altText={t('common:undo')}
          onClick={() => {
            // Cancelar timeout e restaurar item
            if (ignoreTimeoutId) clearTimeout(ignoreTimeoutId);
            setIsHidden(false);
          }}
        >
          {t('common:undo')}
        </ToastAction>
      ),
      duration: 8000,
    });
  };
  
  const handleReportCreated = () => {
    setReportModalOpen(false);
    setClassDataForReport(null);
    setIsHidden(true);
    invalidateAfterAction('createReport');
    toast({
      description: t('toast.reportCreated'),
    });
  };

  if (isHidden) {
    return (
      <Card className={cn(
        "p-4 animate-slide-up-fade",
        urgencyStyle.border,
        urgencyStyle.background
      )}>
        <p className="text-sm text-muted-foreground text-center">
          ✓ {t('toast.classCompleted')}
        </p>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "p-4 transition-all",
      urgencyStyle.border,
      urgencyStyle.background,
      isProcessing && "opacity-70 pointer-events-none"
    )}>
      <div className="flex items-center gap-4">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">
            {item.dependent_name || item.student_name}
          </p>
          {item.dependent_name && (
            <p className="text-sm text-muted-foreground">
              {t('dependent.responsible', { name: item.student_name })}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {item.title} • {item.subtitle}
          </p>
        </div>

        {/* Primary Action */}
        <div className="flex items-center gap-2">
          {item.category === 'pending_past_classes' && (
            <Button 
              size="sm" 
              onClick={handleConfirmClass}
              disabled={isProcessing}
            >
              <Check className="h-4 w-4 mr-1" />
              {t('actions.markCompleted')}
            </Button>
          )}
          
          {item.category === 'amnesty_eligible' && (
            <Button 
              size="sm" 
              variant="secondary"
              onClick={handleGrantAmnesty}
              disabled={isProcessing}
            >
              <Gift className="h-4 w-4 mr-1" />
              {t('actions.grantAmnesty')}
            </Button>
          )}
          
          {item.category === 'overdue_invoices' && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={handleViewInvoice}
            >
              <Eye className="h-4 w-4 mr-1" />
              {t('actions.viewInvoice')}
            </Button>
          )}
          
          {item.category === 'pending_reports' && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={handleCreateReport}
            >
              <FileText className="h-4 w-4 mr-1" />
              {t('actions.createReport')}
            </Button>
          )}

          {/* More Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleIgnore}>
                {t('actions.ignore')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Handler para ação "Ignorar" - adicionar antes do return */}
      
      {/* Modal de Relatório (integração inline) */}
      {classDataForReport && (
        <ClassReportModal
          isOpen={reportModalOpen}
          onOpenChange={(open) => {
            setReportModalOpen(open);
            if (!open) setClassDataForReport(null);
          }}
          classData={classDataForReport}
          onReportCreated={handleReportCreated}
        />
      )}
    </Card>
  );
}
```

**Arquivo:** `src/components/Inbox/InboxEmptyState.tsx`

```tsx
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InboxEmptyState() {
  const { t } = useTranslation('inbox');

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {/* Ilustração */}
      <div className="text-6xl mb-6 flex items-center gap-2">
        <PartyPopper className="h-16 w-16 text-primary" />
      </div>
      
      {/* Título positivo */}
      <h3 className="text-xl font-semibold text-foreground mb-2">
        {t('emptyState.title')}
      </h3>
      
      {/* Subtítulo motivacional */}
      <p className="text-muted-foreground max-w-sm mb-6">
        {t('emptyState.description')}
      </p>
      
      {/* CTA contextual */}
      <Button variant="outline" asChild>
        <Link to="/agenda">
          <CalendarDays className="mr-2 h-4 w-4" />
          {t('emptyState.cta')}
        </Link>
      </Button>
    </div>
  );
}
```

#### Tarefa 1.11: Traduções i18n

**Arquivo:** `src/i18n/locales/pt/inbox.json`

```json
{
  "title": "Central de Ações",
  "subtitle": "{{count}} pendências",
  "subtitleSingular": "1 pendência",
  "noItems": "Nenhuma pendência",
  "refresh": "Atualizar",
  "viewAll": "Ver todas ({{count}})",
  "badge": {
    "ariaLabel": "{{count}} pendências",
    "pending": "{{count}} itens pendentes"
  },
  "categories": {
    "pendingPastClasses": "Aulas não confirmadas",
    "amnestyEligible": "Anistias pendentes",
    "overdueInvoices": "Faturas atrasadas",
    "pendingReports": "Relatórios pendentes"
  },
  "actions": {
    "markCompleted": "Concluída",
    "grantAmnesty": "Conceder Anistia",
    "viewInvoice": "Ver Fatura",
    "createReport": "Criar Relatório",
    "ignore": "Ignorar",
    "sendReminder": "Enviar Lembrete",
    "registerPayment": "Registrar Pagamento"
  },
  "emptyState": {
    "title": "Tudo em dia!",
    "description": "Você não tem nenhuma pendência no momento. Continue assim!",
    "cta": "Ver agenda",
    "lastChecked": "Última verificação: {{time}}"
  },
  "toast": {
    "classCompleted": "Aula confirmada ✓",
    "amnestyGranted": "Anistia concedida",
    "reportCreated": "Relatório criado",
    "itemIgnored": "Item ignorado",
    "reminderSent": "Lembrete enviado",
    "paymentRegistered": "Pagamento registrado",
    "error": "Erro ao processar ação",
    "alreadyResolved": "Este item já foi resolvido"
  },
  "dependent": {
    "responsible": "Responsável: {{name}}"
  }
}
```

**Arquivo:** `src/i18n/locales/en/inbox.json`

```json
{
  "title": "Action Center",
  "subtitle": "{{count}} pending items",
  "subtitleSingular": "1 pending item",
  "noItems": "No pending items",
  "refresh": "Refresh",
  "viewAll": "View all ({{count}})",
  "badge": {
    "ariaLabel": "{{count}} pending items",
    "pending": "{{count}} pending items"
  },
  "categories": {
    "pendingPastClasses": "Unconfirmed classes",
    "amnestyEligible": "Pending amnesty",
    "overdueInvoices": "Overdue invoices",
    "pendingReports": "Pending reports"
  },
  "actions": {
    "markCompleted": "Mark Completed",
    "grantAmnesty": "Grant Amnesty",
    "viewInvoice": "View Invoice",
    "createReport": "Create Report",
    "ignore": "Ignore",
    "sendReminder": "Send Reminder",
    "registerPayment": "Register Payment"
  },
  "emptyState": {
    "title": "All caught up!",
    "description": "You have no pending items at the moment. Keep up the great work!",
    "cta": "View schedule",
    "lastChecked": "Last checked: {{time}}"
  },
  "toast": {
    "classCompleted": "Class confirmed ✓",
    "amnestyGranted": "Amnesty granted",
    "reportCreated": "Report created",
    "itemIgnored": "Item ignored",
    "reminderSent": "Reminder sent",
    "paymentRegistered": "Payment registered",
    "error": "Error processing action",
    "alreadyResolved": "This item has already been resolved"
  },
  "dependent": {
    "responsible": "Responsible: {{name}}"
  }
}
```

#### Tarefa 1.12: Registrar Namespace no i18n

**Arquivo:** `src/i18n/index.ts`

**Modificações necessárias:**

1. Adicionar imports (após linha ~28):
```typescript
import ptInbox from './locales/pt/inbox.json';
```

2. Adicionar import EN (após linha ~52):
```typescript
import enInbox from './locales/en/inbox.json';
```

3. Adicionar ao objeto `resources.pt` (após linha ~78):
```typescript
inbox: ptInbox,
```

4. Adicionar ao objeto `resources.en` (após linha ~103):
```typescript
inbox: enInbox,
```

5. Adicionar ao array `ns` (linha ~126):
```typescript
ns: ['common', 'navigation', /* ... outros ... */, 'inbox'],
```

#### Tarefa 1.12b: Adicionar Traduções Faltantes

As seguintes traduções precisam ser adicionadas aos arquivos existentes:

**Arquivo:** `src/i18n/locales/pt/common.json`

Adicionar chave para suporte ao botão "Desfazer" no toast:

```json
{
  "undo": "Desfazer"
}
```

**Arquivo:** `src/i18n/locales/en/common.json`

```json
{
  "undo": "Undo"
}
```

**Arquivo:** `src/i18n/locales/pt/navigation.json`

Adicionar chave para o sidebar:

```json
{
  "sidebar": {
    "inbox": "Central de Ações"
  }
}
```

**Arquivo:** `src/i18n/locales/en/navigation.json`

```json
{
  "sidebar": {
    "inbox": "Action Center"
  }
}
```

#### Tarefa 1.13: Customizações de Tailwind

**Arquivo:** `tailwind.config.ts`

Adicionar ao `extend.keyframes` (após as keyframes existentes):

```javascript
keyframes: {
  'accordion-down': { /* existente */ },
  'accordion-up': { /* existente */ },
  'slide-up-fade': {
    '0%': { opacity: '1', transform: 'translateY(0)' },
    '100%': { opacity: '0', transform: 'translateY(-10px)' },
  },
  'count-change': {
    '0%': { transform: 'scale(1)' },
    '50%': { transform: 'scale(1.2)' },
    '100%': { transform: 'scale(1)' },
  },
},
```

Adicionar ao `extend.animation`:

```javascript
animation: {
  'accordion-down': '...', // existente
  'accordion-up': '...',   // existente
  'slide-up-fade': 'slide-up-fade 0.3s ease-out forwards',
  'count-change': 'count-change 0.3s ease-out',
},
```

**Nota sobre cores `warning`:** As variáveis CSS `--warning` já existem no `src/index.css` (linhas 43-45 no light mode e linhas 90-91 no dark mode). A configuração no Tailwind já referencia `hsl(var(--warning))`.

#### Tarefa 1.14: Link no AppSidebar (Opcional)

**Arquivo:** `src/components/AppSidebar.tsx`

Adicionar à lista de itens de navegação do professor um novo item para o Inbox:

```tsx
// No array getProfessorItems, adicionar:
{
  title: t('sidebar.inbox'),
  url: "/inbox",
  icon: Inbox, // Importar de lucide-react
}

// Ou, se preferir badge dinâmico, adicionar após o map dos itens:
{isProfessor && (
  <li>
    <Tooltip>
      <TooltipTrigger asChild>
        <div 
          onClick={() => handleNavigation("/inbox")} 
          className={cn(
            "flex items-center rounded-lg min-h-[44px] w-full transition-all duration-200 cursor-pointer",
            !isOpen ? 'justify-center w-12 h-10 px-3 py-2' : 'px-3 py-3',
            isActive("/inbox") 
              ? 'bg-primary/20 text-primary font-semibold border border-primary/30 shadow-md' 
              : 'text-sidebar-foreground hover:bg-sidebar-accent'
          )}
        >
          <Inbox className="h-4 w-4 flex-shrink-0 text-primary" />
          {isOpen && (
            <div className="flex items-center justify-between w-full ml-4">
              <span>{t('sidebar.inbox')}</span>
              {/* Badge com contagem - usar useInboxCounts se necessário */}
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>{t('sidebar.inbox')}</p>
      </TooltipContent>
    </Tooltip>
  </li>
)}
```

**Tradução a adicionar em `navigation.json`:**
```json
{
  "sidebar": {
    "inbox": "Central de Ações"
  }
}
```

---

### Fase 2: Ações e Refinamentos

#### Tarefa 2.1: Confirmar Aula em Lote

- Checkbox para seleção múltipla
- Botão "Confirmar Selecionadas"
- Progress durante processamento

#### Tarefa 2.2: Integrar AmnestyButton

- Reutilizar componente existente `AmnestyButton`
- Invalidar cache após sucesso
- Feedback visual de conclusão

#### Tarefa 2.3: Realtime Updates

- Supabase Realtime nas tabelas `classes` e `invoices`
- Atualizar badge automaticamente
- Toast opcional para novas pendências

#### Tarefa 2.4: Seção "Ignorados" Colapsável

> **Nota:** O handler básico de "Ignorar" com localStorage já está implementado na Fase 1 (`handleIgnore` em `InboxActionItem.tsx`).

- Adicionar seção colapsada "Mostrar itens ignorados" na página Inbox
- Carregar itens ignorados do `localStorage`
- Opção para restaurar itens ignorados
- Migração para tabela `inbox_dismissed` no banco (Fase 3)

#### Tarefa 2.5: Sheet/Drawer para Detalhes de Fatura

- Abre ao clicar em "Ver Fatura"
- Mostra: valor, vencimento, dias atrasados, itens
- Botões: "Enviar Lembrete", "Registrar Pagamento Manual", "Ver Recibo"
- Link: "Ver todas as faturas deste aluno"

#### Tarefa 2.6: Handlers de Ação para Faturas

> **Nota:** Esses handlers estão listados nas traduções mas NÃO são implementados na Fase 1.

**handleSendReminder:**
```typescript
const handleSendReminder = async () => {
  setIsProcessing(true);
  try {
    await supabase.functions.invoke('send-invoice-notification', {
      body: { 
        invoice_id: item.id, 
        notification_type: 'invoice_payment_reminder' 
      }
    });
    toast({ description: t('toast.reminderSent') });
    // Não esconde o item - apenas envia lembrete
  } catch (error) {
    toast({ variant: "destructive", description: t('toast.error') });
  } finally {
    setIsProcessing(false);
  }
};
```

**handleRegisterPayment:**
- Abre modal de registro de pagamento manual
- Integra com fluxo existente de faturas
- Atualiza status da fatura para 'pago'

---

### Fase 3: Extensões Futuras

- **Alunos Inativos**: Sem aulas nos últimos 30 dias
- **Mensalidades Vencendo**: Subscriptions próximas do fim
- **Perfil Incompleto**: Configurações faltando (Stripe, etc.)
- **Materiais Pendentes**: Aulas sem material compartilhado
- **dependent_id em Invoices**: Considerar adicionar para rastrear qual dependente gerou a cobrança

---

## Queries de Banco de Dados

> **Nota:** As queries individuais abaixo são para referência. Em produção, usar as RPCs `get_teacher_inbox_counts` e `get_teacher_inbox_items` para performance.

### Aulas Passadas Pendentes

```sql
-- Conta aulas distintas com participantes pendentes
-- NOTA: Inclui filtros de is_experimental e is_template
SELECT DISTINCT c.id, c.class_date, c.service_id, c.is_group_class
FROM classes c
INNER JOIN class_participants cp ON cp.class_id = c.id
WHERE c.teacher_id = $1
  AND c.class_date < NOW()
  AND c.status = 'pendente'
  AND cp.status = 'pendente'
  AND c.is_experimental = false
  AND (c.is_template IS NULL OR c.is_template = false)
ORDER BY c.class_date ASC;
```

### Cancelamentos Elegíveis para Anistia (30 dias)

```sql
-- NOTA: Inclui filtros de is_experimental e is_template
SELECT id, class_date, cancelled_at, cancellation_reason
FROM classes
WHERE teacher_id = $1
  AND status = 'cancelada'
  AND charge_applied = true
  AND amnesty_granted = false
  AND cancelled_at >= NOW() - INTERVAL '30 days'
  AND is_experimental = false
  AND (is_template IS NULL OR is_template = false)
ORDER BY cancelled_at DESC;
```

### Faturas Atrasadas

```sql
SELECT i.id, i.student_id, i.amount, i.due_date,
       COALESCE(tsr.student_name, p.name) as student_name
FROM invoices i
LEFT JOIN teacher_student_relationships tsr 
  ON tsr.teacher_id = i.teacher_id AND tsr.student_id = i.student_id
LEFT JOIN profiles p ON p.id = i.student_id
WHERE i.teacher_id = $1
  AND i.status = 'overdue'  -- Status definido pelo edge function check-overdue-invoices
ORDER BY i.due_date ASC;
```

### Aulas sem Relatório (30 dias)

```sql
-- NOTA: Inclui filtros de is_experimental e is_template
SELECT DISTINCT c.id, c.class_date, c.service_id
FROM classes c
LEFT JOIN class_reports cr ON cr.class_id = c.id
INNER JOIN class_participants cp ON cp.class_id = c.id
WHERE c.teacher_id = $1
  AND c.status = 'concluida'
  AND cr.id IS NULL
  AND c.class_date >= NOW() - INTERVAL '30 days'
  AND c.is_experimental = false
  AND (c.is_template IS NULL OR c.is_template = false)
ORDER BY c.class_date DESC
LIMIT 50;
```

---

## Estratégia de Invalidação de Cache

Após cada ação no inbox, os seguintes query keys devem ser invalidados:

| Ação | Query Keys a Invalidar |
|------|------------------------|
| Confirmar aula | `inbox-counts`, `inbox-items`, `classes`, `class-participants` |
| Conceder anistia | `inbox-counts`, `inbox-items`, `classes`, `invoices` |
| Ver/Pagar fatura | `inbox-counts`, `inbox-items`, `invoices` |
| Criar relatório | `inbox-counts`, `inbox-items`, `class-reports` |
| Enviar lembrete | Nenhum (ação não altera contagens) |
| Registrar pagamento | `inbox-counts`, `inbox-items`, `invoices` |

### Padrão de Query Keys

| Hook | Query Key Pattern |
|------|-------------------|
| useInboxCounts | `['inbox-counts', teacherId]` |
| useInboxItems | `['inbox-items', category, teacherId, limit, offset]` |

**Invalidação por prefixo:**
```typescript
// Invalida todas as queries de itens (todas as categorias)
queryClient.invalidateQueries({ queryKey: ['inbox-items'] });

// Invalida categoria específica
queryClient.invalidateQueries({ 
  queryKey: ['inbox-items', 'pending_past_classes'] 
});
```

---

## Fluxos de Ação Detalhados

### Marcar Aula como Concluída

1. Professor clica em "Concluída" no `InboxActionItem`
2. Botão mostra spinner inline
3. Chamada para atualizar `classes.status = 'concluida'`
4. **TAMBÉM atualizar** `class_participants.status = 'concluida'` para participantes pendentes
5. Em caso de sucesso:
   - Item desliza para cima com fade-out
   - Toast: "Aula confirmada ✓" com opção "Adicionar Relatório"
   - Cache invalidado
6. Em caso de erro:
   - Toast de erro com retry
   - Item retorna ao estado normal

### Conceder Anistia

1. Professor clica em "Conceder Anistia"
2. **Reutiliza componente `AmnestyButton` existente** (ou lógica similar)
3. Modal de confirmação (se houver)
4. Em caso de sucesso:
   - Item desliza para cima com fade-out
   - Toast: "Anistia concedida"
   - Cache invalidado

### Ver Fatura (Sheet/Drawer)

1. Professor clica em "Ver Fatura"
2. Abre um `Sheet` lateral com:
   - Detalhes da fatura (valor, vencimento, dias atrasados)
   - Botões de ação:
     - "Enviar Lembrete" → dispara email/notificação
     - "Registrar Pagamento Manual" → abre modal de registro
     - "Ver Recibo" → link para `/recibo/{invoiceId}`
3. Link "Ver todas as faturas deste aluno" → `/faturas?student={id}`

### Criar Relatório

1. Professor clica em "Criar Relatório"
2. Abre modal `ClassReportModal` existente
3. Após salvar:
   - Item desliza para cima com fade-out
   - Toast: "Relatório criado"
   - Cache invalidado

---

## Tratamento de Dependentes na UI

Quando um item do inbox envolve um dependente:

- **Título principal**: Nome do dependente (`dependent_name`)
- **Subtítulo**: "Responsável: [nome do responsável]" (`student_name`)

```tsx
// InboxActionItem.tsx
<div className="flex-1">
  <p className="font-medium">
    {item.dependent_name || item.student_name}
  </p>
  {item.dependent_name && (
    <p className="text-sm text-muted-foreground">
      {t('inbox.dependent.responsible', { name: item.student_name })}
    </p>
  )}
  <p className="text-sm text-muted-foreground">
    {item.subtitle}
  </p>
</div>
```

### Nota sobre Faturas e Dependentes

Atualmente, a tabela `invoices` **não possui** coluna `dependent_id`. Portanto:
- Faturas são sempre vinculadas ao **responsável** (`student_id` = profile do adulto)
- Mesmo quando a aula é para um dependente, a fatura vai para o responsável
- Na UI, exibir apenas o nome do responsável (sem indicador de dependente)

**Melhoria Futura (Fase 3):**
Considerar adicionar `dependent_id` em `invoices` para rastrear qual dependente gerou a cobrança.

---

## Tratamento de Erros de Concorrência

Quando o professor tenta agir em um item que já foi resolvido (por outra aba ou outro usuário):

```typescript
// InboxActionItem.tsx
const handleAction = async () => {
  try {
    await performAction();
    // Sucesso normal
  } catch (error) {
    if (error.code === 'PGRST116') { // Not found
      toast.info(t('inbox.toast.alreadyResolved'));
      refetchItems();
    } else {
      toast.error(t('inbox.toast.error'));
    }
  }
};
```

---

## Edge Cases e Tratamentos

### Aula sem Participantes

Classes antigas (pré-migração) podem não ter registros em `class_participants`. A RPC trata isso usando `INNER JOIN`:

```sql
-- Ignorar aulas sem participantes (dados inconsistentes)
INNER JOIN class_participants cp ON cp.class_id = c.id
```

Isso naturalmente exclui aulas órfãs.

### Aulas em Grupo com Status Misto

Uma aula em grupo pode ter participantes com status diferentes. O inbox deve:
1. Mostrar a aula como pendente se **qualquer** participante estiver pendente
2. Na action, listar quais participantes precisam confirmação (via `metadata.pending_participants`)
3. Permitir confirmar individualmente ou em lote

A RPC `get_teacher_inbox_items` retorna metadata com `pending_participants`:
```sql
json_build_object(
  'is_group_class', c.is_group_class,
  'pending_participants', (
    SELECT json_agg(...)
    FROM class_participants cp2
    WHERE cp2.class_id = c.id AND cp2.status = 'pendente'
  )
)
```

### Timezone

Todas as datas são formatadas usando `AT TIME ZONE 'America/Sao_Paulo'` nas RPCs para consistência com o resto do sistema.

---

## Considerações de UX

### Estados

- **Loading**: Skeleton nos cards e lista
- **Empty**: Componente `InboxEmptyState` com ilustração positiva
- **Error**: Toast com retry automático

### Responsividade

- **Desktop**: Grid 4 colunas, lista lateral
- **Tablet**: Grid 2x2, lista full-width
- **Mobile**: Cards empilhados, lista touch-friendly

### Acessibilidade

- ARIA labels em todos os elementos interativos
- Focus management ao navegar
- Suporte completo a teclado
- Badge com `role="status"` e `aria-label="X pendências"`

### Cores por Urgência

- 🔴 Vermelho (`destructive`): Alta urgência
- 🟡 Amarelo (`warning`): Média urgência
- 🔵 Azul (`primary`): Baixa urgência
- ⚫ Cinza (`muted`): Informativo

---

## Hierarquia Visual por Urgência

Para diferenciar visualmente os níveis de urgência, cada `InboxActionItem` aplica estilos distintos:

```tsx
// Configuração de estilos por urgência (definida em src/types/inbox.ts)
const URGENCY_STYLES: Record<UrgencyLevel, {
  border: string;
  background: string;
  iconAnimation?: string;
}> = {
  high: {
    border: 'border-l-4 border-l-destructive',
    background: 'bg-destructive/5',
    iconAnimation: 'animate-pulse',
  },
  medium: {
    border: 'border-l-4 border-l-warning',
    background: 'bg-warning/5',
  },
  low: {
    border: 'border-l-4 border-l-primary',
    background: 'bg-primary/5',
  },
  info: {
    border: 'border-l-4 border-l-muted',
    background: 'bg-muted/5',
  },
};
```

---

## Micro-interações e Feedback Visual

### Ações Concluídas

- **Animação de saída**: Item desliza para cima com fade-out (`animate-slide-up-fade`)
- **Toast contextual**: "Aula confirmada ✓" ou "Anistia concedida"
- **Atualização do contador**: Badge decrementa com transição suave (`animate-count-change`)

### Estados de Loading

- **Botão de ação**: Spinner inline substituindo texto
- **Card afetado**: Opacidade reduzida (`opacity-70`)
- **Outras ações**: Desabilitadas no mesmo item durante processamento

### Transições de Estado

- **Novas pendências**: Badge pisca sutilmente (`animate-pulse`) por 3s
- **Contadores**: Transição numérica suave nos Summary Cards
- **Categorias vazias**: Colapsam automaticamente com animação

---

## Comportamento do NotificationBell

### Desktop (>768px)

```
┌─────────────────────────────────────┐
│  Hover → Abre Popover               │
│  ┌─────────────────────────────┐    │
│  │ 🔴 2 Aulas não confirmadas  │    │
│  │ 🟡 1 Anistia pendente       │    │
│  │ 🔴 3 Faturas atrasadas      │    │
│  │ ───────────────────────     │    │
│  │ Ver todas (6) →             │    │
│  └─────────────────────────────┘    │
│  Click no link → Navega /inbox      │
└─────────────────────────────────────┘
```

- **Hover**: Abre Popover com preview (máx. 3 categorias)
- **Click no link "Ver todas"**: Navega para `/inbox`
- **Click fora**: Fecha Popover
- **Delay de fechamento**: 200ms para evitar fechamento acidental

### Mobile (≤768px)

```
┌───────────────────────────┐
│  Touch no 🔔 → Navega     │
│  diretamente para /inbox  │
└───────────────────────────┘
```

- **Touch**: Navegação direta para `/inbox` (sem Popover)
- **Justificativa**: Popover em mobile tem usabilidade ruim; navegação direta é mais eficiente

---

## Empty State Elaborado

O componente `InboxEmptyState` transmite uma sensação positiva de "missão cumprida":

```tsx
// InboxEmptyState.tsx
<div className="flex flex-col items-center justify-center py-16 px-4 text-center">
  {/* Ilustração vetorial ou emoji grande */}
  <PartyPopper className="h-16 w-16 text-primary mb-6" />
  
  {/* Título positivo */}
  <h3 className="text-xl font-semibold text-foreground mb-2">
    {t('inbox.emptyState.title')}
  </h3>
  
  {/* Subtítulo motivacional */}
  <p className="text-muted-foreground max-w-sm mb-6">
    {t('inbox.emptyState.description')}
  </p>
  
  {/* CTA contextual */}
  <Button variant="outline" asChild>
    <Link to="/agenda">
      <CalendarDays className="mr-2 h-4 w-4" />
      {t('inbox.emptyState.cta')}
    </Link>
  </Button>
</div>
```

---

## Skeleton Loading

### InboxSummaryCards Skeleton

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  {[...Array(4)].map((_, i) => (
    <Card key={i} className="p-4">
      <Skeleton className="h-4 w-20 mb-2" />
      <Skeleton className="h-8 w-12" />
    </Card>
  ))}
</div>
```

### InboxActionList Skeleton

```tsx
<div className="space-y-4">
  {[...Array(3)].map((_, i) => (
    <Card key={i} className="p-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
    </Card>
  ))}
</div>
```

---

## Ação "Ignorar" com Undo

### Fluxo

1. Professor clica em "Ignorar" no item
2. Item desaparece com animação
3. Toast aparece: "Item ignorado" + botão "Desfazer" (8 segundos)
4. Se "Desfazer" clicado: item reaparece
5. Se não: item vai para seção "Ignorados" (colapsada por padrão)

### Implementação

```tsx
// useIgnoreItem.ts
const { toast } = useToast();

const ignoreItem = (itemId: string) => {
  // Adiciona ao estado local de ignorados
  setIgnoredItems(prev => [...prev, itemId]);
  
  toast({
    description: t('inbox.toast.itemIgnored'),
    action: (
      <ToastAction 
        altText={t('common.undo')}
        onClick={() => undoIgnore(itemId)}
      >
        {t('common.undo')}
      </ToastAction>
    ),
    duration: 8000,
  });
  
  // Persiste após timeout (ou imediatamente se preferir)
  setTimeout(() => {
    persistIgnoredItem(itemId);
  }, 8000);
};
```

### Armazenamento

- **Fase 2 (MVP)**: `localStorage` com key `inbox_ignored_items`
- **Fase 3 (Avançado)**: Tabela `inbox_dismissed` no banco

---

## Verificação de Pré-Requisitos

Antes de implementar, verificar os seguintes itens:

### 1. Status de Fatura Atrasada ✅

O edge function `check-overdue-invoices` (linha 58) atualiza o status para `'overdue'`:

```typescript
// supabase/functions/check-overdue-invoices/index.ts linha 58
.update({ status: "overdue" })
```

**As RPCs neste documento já usam `status = 'overdue'`** para alinhar com a implementação real.

### 2. Traduções Existentes

Verificar se `common.undo` existe antes de implementar:

```bash
cat src/i18n/locales/pt/common.json | grep -i undo
```

Se não existir, adicionar conforme Tarefa 1.12b.

### 3. Componentes Reutilizáveis

Verificar que os seguintes componentes existem e estão funcionando:
- `src/components/AmnestyButton.tsx` - para lógica de anistia
- `src/components/ClassReportModal.tsx` - para criação de relatórios
- `src/hooks/use-mobile.tsx` - para detecção de dispositivo

### 4. Cron Jobs

Verificar no Supabase Dashboard > Scheduled Functions que o job `check-overdue-invoices` está ativo.

---

## Dependências de Backend

### Cron Jobs Necessários

Para que o inbox funcione corretamente, verificar que os seguintes cron jobs estão ativos:

| Job | Função | Verificação |
|-----|--------|-------------|
| `check-overdue-invoices` | Atualiza `status` de faturas para `overdue` | Verificar em Supabase Dashboard > Scheduled Functions |

Se o job não existir, faturas não serão marcadas como atrasadas automaticamente e não aparecerão no inbox.

---

## Critérios de Aceitação

### Fase 1 (MVP)

**Banco de Dados:**
- [ ] RPC `get_teacher_inbox_counts` criada e funcionando
- [ ] RPC `get_teacher_inbox_items` criada e funcionando
- [ ] Validação de segurança (`auth.uid()`) nas RPCs
- [ ] Filtros `is_experimental = false` e `is_template = false` nas queries
- [ ] Status de fatura usa `'overdue'` (alinhado com edge function `check-overdue-invoices`)
- [ ] Campo `duration_minutes` incluído no metadata de `pending_reports`
- [ ] Índices de banco de dados criados para otimização

**Hooks e Utilitários:**
- [ ] Hook `useInboxCounts` implementado (sem imports não utilizados)
- [ ] Hook `useInboxItems` implementado (sem imports não utilizados)
- [ ] Utilitário `useInboxCacheInvalidation` implementado

**Componente NotificationBell:**
- [ ] Sino aparece no header para professores
- [ ] Badge mostra contagem total correta com `role="status"`
- [ ] **Desktop**: Popover preview mostra categorias urgentes no hover
- [ ] **Mobile**: Touch no sino navega diretamente para `/inbox`
- [ ] Clique no link "Ver todas" navega para `/inbox`

**Página Inbox:**
- [ ] Rota `/inbox` criada no App.tsx
- [ ] Proteção de rota (redirect se não for professor)
- [ ] Link opcional no menu lateral com badge
- [ ] Página lista todas as categorias de pendências
- [ ] Hierarquia visual por urgência (bordas coloridas, backgrounds)

**Ações Inline:**
- [ ] Ações inline funcionam (confirmar, anistiar, etc.)
- [ ] Lógica de anistia alinhada com `AmnestyButton` (inclui `charge_applied: false` e cancela invoice)
- [ ] `ClassReportModal` integrado inline (não navegação para outra página)
- [ ] Mapeamento `InboxItem → CalendarClass` usa `duration_minutes` corretamente
- [ ] Handler `handleIgnore` implementado com localStorage e Toast Undo
- [ ] Micro-interações de feedback (animações, toasts)
- [ ] Invalidação de cache funcionando após cada ação
- [ ] Tratamento de erros de concorrência

**UI/UX:**
- [ ] Dependentes exibidos corretamente (nome + responsável)
- [ ] Empty State elaborado com ilustração e CTA
- [ ] Skeleton loading nos cards e lista
- [ ] Animações `slide-up-fade` e `count-change` configuradas no Tailwind

**Traduções:**
- [ ] Namespace `inbox` registrado no i18n
- [ ] Traduções PT/EN completas para inbox.json
- [ ] Tradução `common.undo` adicionada (PT/EN)
- [ ] Tradução `sidebar.inbox` adicionada em navigation.json (PT/EN)

### Fase 2

- [ ] Seleção múltipla funciona
- [ ] Atualizações em tempo real
- [ ] Seção "Ignorados" colapsável com opção "Mostrar ignorados"
- [ ] Handlers `handleSendReminder` e `handleRegisterPayment` implementados
- [ ] Sheet/Drawer para detalhes de fatura

---

## Dependências

- `lucide-react` (já instalado) - ícone Bell
- `@tanstack/react-query` (já instalado) - cache e fetch
- `shadcn/ui` (já instalado) - componentes UI
- Componente `AmnestyButton` existente para reutilização
- Hook `useIsMobile` existente para detecção de dispositivo (`src/hooks/use-mobile.tsx`)
- Componente `ClassReportModal` existente para criar relatórios

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Queries lentas com muitos dados | Média | Alto | RPC única, índices, cache agressivo |
| Conflito com outras features | Baixa | Médio | Componentes isolados, hooks independentes |
| UX confusa com muitas categorias | Média | Médio | Priorização visual, collapse de categorias |
| Notificações obsoletas | Baixa | Baixo | Polling + invalidação após ações |
| Popover ruim em mobile | Baixa | Médio | Navegação direta para /inbox no mobile |
| Erros de concorrência | Baixa | Baixo | Tratamento específico + refetch automático |
| Aulas em grupo não contadas corretamente | Média | Alto | Query considera class_participants |
| RPCs vulneráveis a acesso não autorizado | Média | Alto | Validação `auth.uid()` em todas as RPCs |
| Aulas antigas sem participantes | Baixa | Baixo | INNER JOIN exclui aulas órfãs |
