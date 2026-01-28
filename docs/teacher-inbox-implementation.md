# Teacher Inbox - Sistema de Notificações

## Visão Geral

O Teacher Inbox é um sistema de notificações inspirado no GitHub Inbox, onde o professor gerencia alertas sobre pendências através de **triagem** (Done, Ignorar, Salvar), sem executar ações diretamente na tela do inbox.

### Modelo Conceitual

```
┌─────────────────────────────────────────────────────────────────┐
│  O Inbox NÃO resolve pendências - apenas ORGANIZA NOTIFICAÇÕES  │
│  As pendências originais continuam existindo no sistema         │
└─────────────────────────────────────────────────────────────────┘
```

### Problema que Resolve

- Aulas passadas ficam sem confirmação indefinidamente
- Cancelamentos elegíveis para anistia não têm visibilidade
- Professor precisa navegar por múltiplas telas para encontrar pendências
- Faturas atrasadas e relatórios pendentes passam despercebidos

### Solução

- Ícone de sino (🔔) no header com badge de contagem
- Página dedicada `/inbox` com **3 abas**: Inbox, Salvas, Done
- **Triagem** de notificações (não execução de ações)
- **Navegação** para tela de ação ao clicar na notificação
- Sistema de **lidas/não lidas** com feedback visual

---

## Princípios de UX - GitHub Inbox Style

### 1. Triagem, Não Execução

O Inbox é para **organizar notificações**, não para resolver pendências:

| Ação | Comportamento |
|------|---------------|
| ✅ Done | Move para aba Done (pendência continua existindo) |
| 🔖 Salvar | Move para aba Salvas (bookmark) |
| ❌ Ignorar | Move para Done (pendência continua existindo) |
| 🖱️ Click | Navega para tela de ação + marca como lida |

### 2. Três Abas

```
┌──────────────┬──────────────┬──────────────┐
│  Inbox (12)  │  Salvas (3)  │   Done (45)  │
└──────────────┴──────────────┴──────────────┘
```

- **Inbox**: Notificações novas/não processadas
- **Salvas**: Notificações que o professor quer voltar depois
- **Done**: Notificações já triadas (com opção de Undo)

### 3. Estados de Leitura

- **Não lida**: Card com fundo normal, fonte mais pesada
- **Lida**: Card com fundo apagado, fonte normal
- Uma notificação é marcada como **lida** quando o professor clica nela

### 4. Filtros por Aba

Cada aba possui filtros independentes:

- **Urgência**: Alta, Média, Baixa, Todas
- **Visualização**: Todas, Não lidas, Lidas

### 5. Undo na Aba Done

Na aba Done, onde antes havia o botão "Done", aparece o botão "Undo" que move a notificação de volta para Inbox.

---

## Regras de Negócio

### Aulas Experimentais

**REGRA CRÍTICA:** Aulas experimentais (`is_experimental = true`) **NUNCA** geram cobrança por cancelamento.

### Persistência de Pendências

Quando uma notificação é marcada como Done:
- A **notificação** muda de status
- A **pendência original** continua existindo no sistema
- Exemplo: Marcar "Aula não confirmada" como Done NÃO confirma a aula

### Geração de Notificações

Notificações são geradas automaticamente:
- Via **cron job diário** que varre pendências
- Via **triggers** quando uma nova pendência é criada

Notificações são **removidas automaticamente** quando:
- A pendência original é resolvida (aula confirmada, fatura paga, etc.)

---

## Arquitetura

### Estrutura de Componentes

```
Header (Layout.tsx)
    └── NotificationBell
            └── Badge com contagem total (apenas Inbox)
            └── Clique navega para /inbox
            
/inbox (InboxPage)
    └── InboxTabs (Inbox | Salvas | Done)
    └── InboxFilters (urgência + lidas)
    └── NotificationList
            └── NotificationItem
                    └── Ações de triagem (Done/Salvar/Undo)
    └── InboxEmptyState
```

### Estrutura de Arquivos

```
src/
├── components/
│   ├── NotificationBell.tsx
│   └── Inbox/
│       ├── InboxTabs.tsx
│       ├── InboxFilters.tsx
│       ├── NotificationList.tsx
│       ├── NotificationItem.tsx
│       └── InboxEmptyState.tsx
├── hooks/
│   ├── useTeacherNotifications.ts
│   └── useNotificationActions.ts
├── types/
│   └── inbox.ts
├── pages/
│   └── Inbox.tsx
└── i18n/locales/
    ├── pt/inbox.json
    └── en/inbox.json
```

---

## Schema de Banco de Dados

### Nova Tabela: `teacher_notifications`

```sql
-- ============================================
-- Tabela de notificações do professor
-- ============================================
CREATE TABLE teacher_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Referência ao item original
  -- NOTA: source_type 'class' é usado para pending_past_classes, amnesty_eligible e pending_reports
  --       source_type 'invoice' é usado para overdue_invoices
  --       Não usamos 'class_report' como source_type - relatórios são referenciados via classe
  source_type TEXT NOT NULL CHECK (source_type IN ('class', 'invoice')),
  source_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'pending_past_classes', 
    'amnesty_eligible', 
    'overdue_invoices', 
    'pending_reports'
  )),
  
  -- Estados de triagem (independentes do item original)
  status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'saved', 'done')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  status_changed_at TIMESTAMPTZ,
  
  -- Constraint de unicidade
  UNIQUE(teacher_id, source_type, source_id, category)
);

-- Índices para performance
CREATE INDEX idx_teacher_notifications_teacher_status 
ON teacher_notifications(teacher_id, status);

CREATE INDEX idx_teacher_notifications_teacher_read 
ON teacher_notifications(teacher_id, is_read);

CREATE INDEX idx_teacher_notifications_source 
ON teacher_notifications(source_type, source_id);

CREATE INDEX idx_teacher_notifications_created 
ON teacher_notifications(created_at DESC);

-- Índice composto para query principal (performance crítica)
CREATE INDEX idx_teacher_notifications_main_query
ON teacher_notifications(teacher_id, status, is_read, created_at DESC);
```

### RLS Policies

```sql
ALTER TABLE teacher_notifications ENABLE ROW LEVEL SECURITY;

-- Professores podem ver suas próprias notificações
CREATE POLICY "Teachers can view own notifications"
ON teacher_notifications FOR SELECT
USING (teacher_id = auth.uid());

-- Professores podem atualizar suas próprias notificações
CREATE POLICY "Teachers can update own notifications"
ON teacher_notifications FOR UPDATE
USING (teacher_id = auth.uid());

-- IMPORTANTE: NÃO usar policy permissiva para INSERT/DELETE
-- INSERT e DELETE devem ser feitos EXCLUSIVAMENTE via:
-- 1. Triggers com SECURITY DEFINER (auto-remoção quando pendência é resolvida)
-- 2. Edge Functions com service_role key (varredura diária)
-- 3. RPCs com SECURITY DEFINER (se necessário no futuro)
--
-- Isso garante que:
-- - Usuários não podem criar notificações falsas
-- - Usuários não podem deletar notificações indevidamente
-- - Sistema mantém integridade dos dados
```

### Tabelas de Referência

#### `classes`
- `id`, `teacher_id`, `class_date`, `status`, `is_group_class`
- `cancelled_at`, `cancellation_reason`, `charge_applied`, `amnesty_granted`
- `service_id`, `is_experimental`, `is_template`

#### `class_participants`
- `class_id`, `student_id`, `dependent_id`, `status`

#### `invoices`
- `id`, `teacher_id`, `student_id`, `amount`, `due_date`, `status`

#### `class_reports`
- `id`, `class_id`, `teacher_id`

---

## Tipos TypeScript

**Arquivo:** `src/types/inbox.ts`

```typescript
// Status de triagem da notificação
export type NotificationStatus = 'inbox' | 'saved' | 'done';

// Categorias de notificações
export type NotificationCategory = 
  | 'pending_past_classes'
  | 'amnesty_eligible'
  | 'overdue_invoices'
  | 'pending_reports';

// Níveis de urgência
export type UrgencyLevel = 'high' | 'medium' | 'low';

// Tipo de fonte da notificação
// CORREÇÃO: Removido 'class_report' - relatórios são referenciados via classe
export type NotificationSourceType = 'class' | 'invoice';

// Contagens por status
export interface NotificationCounts {
  inbox: number;
  saved: number;
  done: number;
}

// Filtros disponíveis
export interface NotificationFilters {
  urgency?: UrgencyLevel;
  isRead?: boolean;
}

// Notificação individual (retornada pela RPC)
export interface TeacherNotification {
  id: string;
  teacher_id: string;
  source_type: NotificationSourceType;
  source_id: string;
  category: NotificationCategory;
  status: NotificationStatus;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  status_changed_at: string | null;
  
  // Dados enriquecidos (JOIN com tabelas originais)
  title: string;
  subtitle: string;
  urgency: UrgencyLevel;
  student_name: string;
  dependent_name: string | null;
  navigation_url: string;
  
  // Metadata adicional para contexto
  metadata: NotificationMetadata;
}

// Metadata específico por categoria
export type NotificationMetadata = 
  | PendingClassMetadata
  | AmnestyMetadata
  | OverdueInvoiceMetadata
  | PendingReportMetadata;

export interface PendingClassMetadata {
  class_date: string;
  service_name: string;
  is_group_class: boolean;
  participant_count: number;
}

export interface AmnestyMetadata {
  class_date: string;
  cancellation_reason: string;
  charge_amount: number;
  cancelled_at: string;
}

export interface OverdueInvoiceMetadata {
  amount: number;
  due_date: string;
  days_overdue: number;
  invoice_type: string;
}

export interface PendingReportMetadata {
  class_date: string;
  service_name: string;
  completed_at: string;
}

// Configuração visual por categoria
export const CATEGORY_CONFIG: Record<NotificationCategory, {
  icon: string;
  urgency: UrgencyLevel;
  labelKey: string;
}> = {
  pending_past_classes: {
    icon: 'Clock',
    urgency: 'high',
    labelKey: 'inbox.categories.pendingPastClasses',
  },
  amnesty_eligible: {
    icon: 'Gift',
    urgency: 'medium',
    labelKey: 'inbox.categories.amnestyEligible',
  },
  overdue_invoices: {
    icon: 'AlertCircle',
    urgency: 'high',
    labelKey: 'inbox.categories.overdueInvoices',
  },
  pending_reports: {
    icon: 'FileText',
    urgency: 'low',
    labelKey: 'inbox.categories.pendingReports',
  },
};

// Estilos por urgência
export const URGENCY_STYLES: Record<UrgencyLevel, {
  border: string;
  background: string;
  text: string;
}> = {
  high: {
    border: 'border-l-4 border-l-destructive',
    background: 'bg-destructive/5',
    text: 'text-destructive',
  },
  medium: {
    border: 'border-l-4 border-l-warning',
    background: 'bg-warning/5',
    text: 'text-warning',
  },
  low: {
    border: 'border-l-4 border-l-primary',
    background: 'bg-primary/5',
    text: 'text-primary',
  },
};

// Estilos para lida/não lida
export const READ_STYLES = {
  unread: 'bg-card font-medium',
  read: 'bg-muted/30 text-muted-foreground',
};
```

---

## URLs de Navegação

Ao clicar em uma notificação, o professor é direcionado para:

| Categoria | URL de Navegação |
|-----------|------------------|
| `pending_past_classes` | `/agenda?date=${classDate}&classId=${classId}` |
| `amnesty_eligible` | `/agenda?date=${classDate}&classId=${classId}&action=amnesty` |
| `overdue_invoices` | `/faturas?highlight=${invoiceId}` |
| `pending_reports` | `/agenda?date=${classDate}&classId=${classId}&action=report` |

---

## Transições de Estado

```
                        ┌─────────┐
                        │  NOVA   │
                        │(gerada) │
                        └────┬────┘
                             │
                             ▼
    ┌─────────┐         ┌─────────┐         ┌─────────┐
    │  SAVED  │◄───────►│  INBOX  │────────►│  DONE   │
    │         │         │         │         │         │
    └────┬────┘         └─────────┘         └────┬────┘
         │                                       │
         │              (Undo)                   │
         └───────────────────────────────────────┘
```

### Ações por Aba

| Aba | Ações Disponíveis |
|-----|-------------------|
| Inbox | ✅ Done, 🔖 Salvar, 🖱️ Click (navega + marca lida) |
| Salvas | ✅ Done, 📤 Mover para Inbox, 🖱️ Click |
| Done | ↩️ Undo (volta para Inbox), 🖱️ Click |

---

## RPCs PostgreSQL

### RPC: Contagens por Status

```sql
CREATE OR REPLACE FUNCTION get_teacher_notification_counts(p_teacher_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inbox INT;
  v_saved INT;
  v_done INT;
BEGIN
  -- Validação de segurança
  IF auth.uid() IS DISTINCT FROM p_teacher_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT 
    COUNT(*) FILTER (WHERE status = 'inbox'),
    COUNT(*) FILTER (WHERE status = 'saved'),
    COUNT(*) FILTER (WHERE status = 'done')
  INTO v_inbox, v_saved, v_done
  FROM teacher_notifications
  WHERE teacher_id = p_teacher_id;

  RETURN json_build_object(
    'inbox', COALESCE(v_inbox, 0),
    'saved', COALESCE(v_saved, 0),
    'done', COALESCE(v_done, 0)
  );
END;
$$;
```

### RPC: Listar Notificações

```sql
CREATE OR REPLACE FUNCTION get_teacher_notifications(
  p_teacher_id UUID,
  p_status TEXT DEFAULT 'inbox',
  p_urgency TEXT DEFAULT NULL,
  p_is_read BOOLEAN DEFAULT NULL,
  p_limit INT DEFAULT 50,
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
  -- Validação de segurança
  IF auth.uid() IS DISTINCT FROM p_teacher_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  WITH enriched_notifications AS (
    SELECT 
      tn.id,
      tn.teacher_id,
      tn.source_type,
      tn.source_id,
      tn.category,
      tn.status,
      tn.is_read,
      tn.created_at,
      tn.read_at,
      tn.status_changed_at,
      
      -- Determinar urgência baseado na categoria
      CASE tn.category
        WHEN 'pending_past_classes' THEN 'high'
        WHEN 'amnesty_eligible' THEN 'medium'
        WHEN 'overdue_invoices' THEN 'high'
        WHEN 'pending_reports' THEN 'low'
      END as urgency,
      
      -- Dados enriquecidos baseado no tipo
      CASE tn.source_type
        WHEN 'class' THEN (
          SELECT json_build_object(
            'title', COALESCE(cs.name, 'Aula'),
            -- CORREÇÃO: Subtitle diferente para aulas em grupo
            'subtitle', 
              CASE 
                WHEN c.is_group_class THEN 
                  to_char(c.class_date AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || 
                  ' • Turma (' || (SELECT COUNT(*) FROM class_participants WHERE class_id = c.id) || ' alunos)'
                ELSE 
                  to_char(c.class_date AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
              END,
            -- CORREÇÃO: Fallback adicional para student_name NULL (registros legados)
            'student_name', 
              CASE 
                WHEN c.is_group_class THEN 'Aula em Grupo'
                ELSE COALESCE(tsr.student_name, p.name, 'Aluno não identificado')
              END,
            'dependent_name', 
              CASE WHEN c.is_group_class THEN NULL ELSE dep.name END,
            'navigation_url', 
              CASE tn.category
                WHEN 'pending_past_classes' THEN '/agenda?date=' || c.class_date::date || '&classId=' || c.id
                WHEN 'amnesty_eligible' THEN '/agenda?date=' || c.class_date::date || '&classId=' || c.id || '&action=amnesty'
                WHEN 'pending_reports' THEN '/agenda?date=' || c.class_date::date || '&classId=' || c.id || '&action=report'
              END,
            'metadata', json_build_object(
              'class_date', c.class_date,
              'service_name', cs.name,
              'is_group_class', c.is_group_class,
              'participant_count', (SELECT COUNT(*) FROM class_participants WHERE class_id = c.id),
              'cancellation_reason', c.cancellation_reason,
              'charge_amount', COALESCE(cs.price, 0)
            )
          )
          FROM classes c
          LEFT JOIN class_services cs ON cs.id = c.service_id
          LEFT JOIN class_participants cp ON cp.class_id = c.id
          LEFT JOIN profiles p ON p.id = cp.student_id
          LEFT JOIN teacher_student_relationships tsr 
            ON tsr.teacher_id = c.teacher_id AND tsr.student_id = cp.student_id
          LEFT JOIN dependents dep ON dep.id = cp.dependent_id
          WHERE c.id = tn.source_id
            AND c.is_experimental = false  -- IMPORTANTE: Filtrar aulas experimentais
          LIMIT 1
        )
        WHEN 'invoice' THEN (
          SELECT json_build_object(
            'title', 'Fatura atrasada',
            'subtitle', 'R$ ' || i.amount::text || ' - Vencida há ' || 
              EXTRACT(DAY FROM NOW() - i.due_date)::int || ' dias',
            -- CORREÇÃO: Fallback para student_name NULL (registros legados)
            'student_name', COALESCE(tsr.student_name, p.name, 'Aluno não identificado'),
            'dependent_name', NULL,
            'navigation_url', '/faturas?highlight=' || i.id,
            'metadata', json_build_object(
              'amount', i.amount,
              'due_date', i.due_date,
              'days_overdue', EXTRACT(DAY FROM NOW() - i.due_date)::int,
              'invoice_type', i.invoice_type
            )
          )
          FROM invoices i
          LEFT JOIN profiles p ON p.id = i.student_id
          LEFT JOIN teacher_student_relationships tsr 
            ON tsr.teacher_id = i.teacher_id AND tsr.student_id = i.student_id
          WHERE i.id = tn.source_id
        )
        -- NOTA: 'class_report' foi REMOVIDO como source_type
        -- A categoria 'pending_reports' usa source_type = 'class' 
        -- (já tratado no WHEN 'class' acima, via category = 'pending_reports')
      END as enriched_data
    FROM teacher_notifications tn
    WHERE tn.teacher_id = p_teacher_id
      AND tn.status = p_status
      AND (p_urgency IS NULL OR 
           CASE tn.category
             WHEN 'pending_past_classes' THEN 'high'
             WHEN 'amnesty_eligible' THEN 'medium'
             WHEN 'overdue_invoices' THEN 'high'
             WHEN 'pending_reports' THEN 'low'
           END = p_urgency)
      AND (p_is_read IS NULL OR tn.is_read = p_is_read)
    ORDER BY 
      CASE 
        WHEN tn.category IN ('pending_past_classes', 'overdue_invoices') THEN 1
        WHEN tn.category = 'amnesty_eligible' THEN 2
        ELSE 3
      END,
      tn.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT json_agg(
    json_build_object(
      'id', en.id,
      'teacher_id', en.teacher_id,
      'source_type', en.source_type,
      'source_id', en.source_id,
      'category', en.category,
      'status', en.status,
      'is_read', en.is_read,
      'created_at', en.created_at,
      'read_at', en.read_at,
      'status_changed_at', en.status_changed_at,
      'urgency', en.urgency,
      'title', en.enriched_data->>'title',
      'subtitle', en.enriched_data->>'subtitle',
      'student_name', en.enriched_data->>'student_name',
      'dependent_name', en.enriched_data->>'dependent_name',
      'navigation_url', en.enriched_data->>'navigation_url',
      'metadata', en.enriched_data->'metadata'
    )
  ) INTO v_result
  FROM enriched_notifications en;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;
```

### RPC: Atualizar Status da Notificação

```sql
CREATE OR REPLACE FUNCTION update_notification_status(
  p_notification_id UUID,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE teacher_notifications
  SET 
    status = p_new_status,
    status_changed_at = NOW()
  WHERE id = p_notification_id
    AND teacher_id = auth.uid();
  
  RETURN FOUND;
END;
$$;
```

### RPC: Marcar como Lida

```sql
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE teacher_notifications
  SET 
    is_read = true,
    read_at = NOW()
  WHERE id = p_notification_id
    AND teacher_id = auth.uid()
    AND is_read = false;
  
  RETURN FOUND;
END;
$$;
```

---

## Geração Automática de Notificações

### Edge Function: Varredura Diária

> **CORREÇÕES IMPLEMENTADAS:**
> 1. **Filtro temporal de 30 dias** - Evita processar pendências antigas/legadas
> 2. **Verificação de features do professor** - Só gera `pending_reports` se professor tiver feature `class_reports`
> 3. **Filtro `is_experimental = false`** - Aplicado em TODAS as queries
> 4. **Cleanup de Done antigos** - Remoção automática de notificações Done com mais de 30 dias

**Arquivo:** `supabase/functions/generate-teacher-notifications/index.ts`

Esta função roda via cron job 1x/dia (06:00 UTC) e:

1. Varre aulas pendentes passadas → cria notificações `pending_past_classes`
2. Varre cancelamentos com cobrança → cria notificações `amnesty_eligible`
3. Varre faturas atrasadas → cria notificações `overdue_invoices`
4. Varre aulas concluídas sem relatório → cria notificações `pending_reports`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date().toISOString();
    // CORREÇÃO: Filtro temporal de 30 dias para evitar processar pendências antigas
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    let created = 0;
    let cleaned = 0;
    let errors: string[] = [];

    // ===========================================
    // CLEANUP: Remover notificações Done antigas (mais de 30 dias)
    // ===========================================
    const { data: deletedDone, error: deleteError } = await supabase
      .from("teacher_notifications")
      .delete()
      .eq("status", "done")
      .lt("status_changed_at", thirtyDaysAgo)
      .select("id");
    
    if (deleteError) {
      errors.push(`cleanup: ${deleteError.message}`);
    } else {
      cleaned = deletedDone?.length || 0;
    }

    // ===========================================
    // 1. Aulas pendentes passadas (não experimentais, não templates)
    // FILTRO: Apenas últimos 30 dias
    // ===========================================
    const { data: pendingClasses, error: pendingError } = await supabase
      .from("classes")
      .select("id, teacher_id")
      .eq("status", "pendente")
      .eq("is_experimental", false)
      .eq("is_template", false)
      .lt("class_date", now)
      .gte("class_date", thirtyDaysAgo); // Filtro temporal

    if (pendingError) {
      errors.push(`pendingClasses: ${pendingError.message}`);
    } else {
      for (const cls of pendingClasses || []) {
        const { error } = await supabase
          .from("teacher_notifications")
          .upsert({
            teacher_id: cls.teacher_id,
            source_type: "class",
            source_id: cls.id,
            category: "pending_past_classes",
          }, { onConflict: "teacher_id,source_type,source_id,category" });
        
        if (!error) created++;
      }
    }

    // ===========================================
    // 2. Cancelamentos com cobrança (elegíveis para anistia)
    // FILTRO: Apenas últimos 30 dias
    // ===========================================
    const { data: chargedCancellations, error: chargedError } = await supabase
      .from("classes")
      .select("id, teacher_id, cancelled_at")
      .eq("status", "cancelada")
      .eq("charge_applied", true)
      .eq("amnesty_granted", false)
      .eq("is_experimental", false)
      .gte("cancelled_at", thirtyDaysAgo); // Filtro temporal

    if (chargedError) {
      errors.push(`chargedCancellations: ${chargedError.message}`);
    } else {
      for (const cls of chargedCancellations || []) {
        const { error } = await supabase
          .from("teacher_notifications")
          .upsert({
            teacher_id: cls.teacher_id,
            source_type: "class",
            source_id: cls.id,
            category: "amnesty_eligible",
          }, { onConflict: "teacher_id,source_type,source_id,category" });
        
        if (!error) created++;
      }
    }

    // ===========================================
    // 3. Faturas atrasadas
    // NOTA: Status 'pendente' + due_date < now = overdue (calculado)
    // FILTRO: Apenas últimos 30 dias
    // CORREÇÃO: Apenas faturas de professores com business_profile configurado
    // ===========================================
    
    // Primeiro, buscar professores que têm business_profile ativo
    const { data: teachersWithBP, error: bpError } = await supabase
      .from("business_profiles")
      .select("user_id")
      .not("stripe_connect_id", "is", null);
    
    if (bpError) {
      errors.push(`businessProfiles: ${bpError.message}`);
    }
    
    const teacherIdsWithBP = new Set(teachersWithBP?.map(bp => bp.user_id) || []);
    
    // Buscar faturas atrasadas COM validação de business_profile
    const { data: overdueInvoices, error: overdueError } = await supabase
      .from("invoices")
      .select("id, teacher_id, business_profile_id")
      .eq("status", "pendente")
      .lt("due_date", now)
      .gte("due_date", thirtyDaysAgo)
      .not("business_profile_id", "is", null); // Apenas faturas com business_profile

    if (overdueError) {
      errors.push(`overdueInvoices: ${overdueError.message}`);
    } else {
      for (const inv of overdueInvoices || []) {
        // CORREÇÃO: Verificar se professor tem business_profile ativo
        if (!teacherIdsWithBP.has(inv.teacher_id)) {
          continue; // Pular faturas de professores sem BP ativo
        }
        
        const { error } = await supabase
          .from("teacher_notifications")
          .upsert({
            teacher_id: inv.teacher_id,
            source_type: "invoice",
            source_id: inv.id,
            category: "overdue_invoices",
          }, { onConflict: "teacher_id,source_type,source_id,category" });
        
        if (!error) created++;
      }
    }

    // ===========================================
    // 4. Aulas concluídas sem relatório
    // CORREÇÃO: Verificar se professor tem feature class_reports
    // FILTRO: Apenas últimos 30 dias
    // ===========================================
    
    // CORREÇÃO CRÍTICA: Buscar professores com assinatura ATIVA que inclui class_reports
    // A query anterior usava profiles.current_plan_id, mas o correto é verificar
    // via user_subscriptions (tabela que rastreia status de assinatura ativa)
    // 
    // NOTA: Se a tabela user_subscriptions não existir, usar profiles.subscription_status
    // como fallback para verificar se o professor tem plano ativo
    const { data: teachersWithReports, error: teacherFeatError } = await supabase
      .from("profiles")
      .select(`
        id,
        current_plan_id,
        subscription_status,
        subscription_plans!profiles_current_plan_id_fkey(features)
      `)
      .eq("role", "professor")
      .not("current_plan_id", "is", null)
      .eq("subscription_status", "active"); // Verificar status ativo

    if (teacherFeatError) {
      errors.push(`teacherFeatures: ${teacherFeatError.message}`);
    }

    // Filtrar apenas professores com class_reports habilitado E assinatura ativa
    const teachersWithClassReports = new Set<string>();
    if (teachersWithReports) {
      for (const teacher of teachersWithReports) {
        const plan = teacher.subscription_plans as any;
        // Verificar se o plano tem a feature class_reports
        if (plan?.features?.class_reports === true) {
          teachersWithClassReports.add(teacher.id);
        }
      }
    }

    // Buscar aulas concluídas que NÃO têm relatório associado
    const { data: completedClasses, error: completedError } = await supabase
      .from("classes")
      .select(`
        id, 
        teacher_id,
        class_date,
        class_reports!left(id)
      `)
      .eq("status", "concluida")
      .eq("is_experimental", false)
      .eq("is_template", false)
      .is("class_reports.id", null)
      .gte("class_date", thirtyDaysAgo); // Filtro temporal

    if (completedError) {
      errors.push(`completedClasses: ${completedError.message}`);
    } else {
      for (const cls of completedClasses || []) {
        // CORREÇÃO: Verificar se professor tem feature class_reports
        if (!teachersWithClassReports.has(cls.teacher_id)) {
          continue; // Pular professor sem a feature
        }
        
        // Verificar se realmente não tem relatório
        if (!cls.class_reports || cls.class_reports.length === 0) {
          const { error } = await supabase
            .from("teacher_notifications")
            .upsert({
              teacher_id: cls.teacher_id,
              source_type: "class",
              source_id: cls.id,
              category: "pending_reports",
            }, { onConflict: "teacher_id,source_type,source_id,category" });
          
          if (!error) created++;
        }
      }
    }

    console.log(`Generated ${created} notifications, cleaned ${cleaned} old Done items`);
    if (errors.length > 0) {
      console.error("Errors:", errors);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        notifications_created: created,
        done_items_cleaned: cleaned,
        errors: errors.length > 0 ? errors : undefined 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );
  } catch (error) {
    console.error("Error generating notifications:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
```

### Configuração do Cron Job

> **IMPORTANTE:** O `config.toml` NÃO suporta a propriedade `schedule` para cron jobs.
> Cron jobs devem ser configurados via **pg_cron** no SQL Editor do Supabase.

**Executar no SQL Editor do Supabase:**

```sql
-- Habilitar extensões necessárias (se ainda não habilitadas)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover job existente (se houver)
SELECT cron.unschedule('generate-teacher-notifications-daily');

-- Criar cron job para rodar às 06:00 UTC (03:00 BRT)
SELECT cron.schedule(
  'generate-teacher-notifications-daily',
  '0 6 * * *',  -- Cron expression: todo dia às 06:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/generate-teacher-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Verificar se o job foi criado
SELECT jobid, jobname, schedule, command 
FROM cron.job 
WHERE jobname = 'generate-teacher-notifications-daily';
```

**Configurar em `supabase/config.toml`** (apenas para desabilitar JWT verification):

```toml
[functions.generate-teacher-notifications]
verify_jwt = false
```

### Trigger: Auto-remoção quando Pendência é Resolvida

```sql
-- Remove notificação quando aula é confirmada/cancelada/concluída
CREATE OR REPLACE FUNCTION remove_notification_on_class_resolution()
RETURNS TRIGGER AS $$
BEGIN
  -- Se status mudou para resolvido, remove notificações
  IF NEW.status IN ('confirmada', 'cancelada', 'concluida') 
     AND OLD.status = 'pendente' THEN
    DELETE FROM teacher_notifications 
    WHERE source_id = NEW.id 
      AND source_type = 'class'
      AND category = 'pending_past_classes';
  END IF;
  
  -- Se anistia foi concedida, remove notificação
  IF NEW.amnesty_granted = true AND OLD.amnesty_granted = false THEN
    DELETE FROM teacher_notifications 
    WHERE source_id = NEW.id 
      AND source_type = 'class'
      AND category = 'amnesty_eligible';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_remove_notification_on_class_resolution
AFTER UPDATE ON classes
FOR EACH ROW
EXECUTE FUNCTION remove_notification_on_class_resolution();

-- Remove notificação quando fatura é paga ou cancelada
-- NOTA: Status de faturas no banco são 'pendente', 'pago', 'cancelado'
-- 'overdue' NÃO é um status real - é calculado quando due_date < now()
CREATE OR REPLACE FUNCTION remove_notification_on_invoice_paid()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando status muda de 'pendente' para 'pago' ou 'cancelado'
  IF NEW.status IN ('pago', 'cancelado') 
     AND OLD.status = 'pendente' THEN
    DELETE FROM teacher_notifications 
    WHERE source_id = NEW.id 
      AND source_type = 'invoice';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_remove_notification_on_invoice_paid
AFTER UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION remove_notification_on_invoice_paid();

-- Remove notificação quando relatório é criado
CREATE OR REPLACE FUNCTION remove_notification_on_report_created()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM teacher_notifications 
  WHERE source_id = NEW.class_id 
    AND source_type = 'class'
    AND category = 'pending_reports';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_remove_notification_on_report_created
AFTER INSERT ON class_reports
FOR EACH ROW
EXECUTE FUNCTION remove_notification_on_report_created();
```

---

## Fase 4 (Opcional): Triggers de Criação em Tempo Real

> **NOTA:** Esta seção documenta uma melhoria opcional para criar notificações em TEMPO REAL, 
> além do cron job diário. Não é obrigatória para o MVP.

### Problema Identificado

O documento principal descreve apenas triggers de **REMOÇÃO** de notificações. 
Não há triggers para **CRIAÇÃO** em tempo real quando:
- Uma aula passa da data sem ser confirmada
- Uma fatura vence sem ser paga

### Solução Atual (MVP)

O cron job diário (06:00 UTC) varre todas as pendências e cria notificações.
Isso significa que uma aula que passa das 23:00 só gerará notificação no dia seguinte às 06:00.

### Melhoria Opcional: Trigger para Aulas

```sql
-- OPCIONAL: Trigger para criar notificação quando aula passa da data
-- ATENÇÃO: Este trigger rodaria em EVERY update na tabela classes
-- Pode ter impacto de performance em sistemas com muitas aulas

CREATE OR REPLACE FUNCTION create_notification_on_class_overdue()
RETURNS TRIGGER AS $$
BEGIN
  -- Se status ainda é 'pendente' e class_date passou
  IF NEW.status = 'pendente' 
     AND NEW.class_date < NOW() 
     AND NEW.is_experimental = false 
     AND NEW.is_template = false THEN
    
    INSERT INTO teacher_notifications (teacher_id, source_type, source_id, category)
    VALUES (NEW.teacher_id, 'class', NEW.id, 'pending_past_classes')
    ON CONFLICT (teacher_id, source_type, source_id, category) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CUIDADO: Avaliar impacto de performance antes de ativar
-- CREATE TRIGGER trg_create_notification_on_class_overdue
-- AFTER UPDATE ON classes
-- FOR EACH ROW
-- EXECUTE FUNCTION create_notification_on_class_overdue();
```

### Trade-offs

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **Cron Job (atual)** | Simples, previsível, baixo overhead | Delay de até 24h para novas notificações |
| **Trigger em tempo real** | Notificação imediata | Overhead em cada UPDATE, complexidade |

### Recomendação

Para o MVP, usar apenas o **cron job diário**. 
A melhoria com triggers pode ser implementada posteriormente se houver demanda por notificações em tempo real.

---

## Hooks React

### Hook: useTeacherNotifications

**Arquivo:** `src/hooks/useTeacherNotifications.ts`

> **IMPORTANTE:** O `TeacherContext` exporta `selectedTeacherId` (string | null), NÃO `selectedTeacher.id`.

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTeacherContext } from '@/contexts/TeacherContext';
import { useAuth } from '@/contexts/AuthContext';
import type { 
  TeacherNotification, 
  NotificationStatus, 
  NotificationFilters,
  NotificationCounts 
} from '@/types/inbox';

interface UseTeacherNotificationsOptions {
  status: NotificationStatus;
  filters?: NotificationFilters;
  limit?: number;
}

export function useTeacherNotifications(options: UseTeacherNotificationsOptions) {
  // CORREÇÃO: usar selectedTeacherId diretamente (para alunos) ou userId (para professores)
  const { selectedTeacherId } = useTeacherContext();
  const { user, isProfessor } = useAuth();
  
  // Professores usam seu próprio ID, alunos usam o ID do professor selecionado
  const teacherId = isProfessor ? user?.id : selectedTeacherId;
  
  return useQuery({
    queryKey: ['teacher-notifications', teacherId, options.status, options.filters],
    queryFn: async () => {
      if (!teacherId) return [];
      
      const { data, error } = await supabase.rpc('get_teacher_notifications', {
        p_teacher_id: teacherId,
        p_status: options.status,
        p_urgency: options.filters?.urgency ?? null,
        p_is_read: options.filters?.isRead ?? null,
        p_limit: options.limit ?? 50,
        p_offset: 0,
      });
      
      if (error) throw error;
      return (data ?? []) as TeacherNotification[];
    },
    enabled: !!teacherId,
  });
}

export function useNotificationCounts() {
  // CORREÇÃO: usar selectedTeacherId diretamente (para alunos) ou userId (para professores)
  const { selectedTeacherId } = useTeacherContext();
  const { user, isProfessor } = useAuth();
  
  // Professores usam seu próprio ID, alunos usam o ID do professor selecionado
  const teacherId = isProfessor ? user?.id : selectedTeacherId;
  
  return useQuery({
    queryKey: ['notification-counts', teacherId],
    queryFn: async () => {
      if (!teacherId) return { inbox: 0, saved: 0, done: 0 };
      
      const { data, error } = await supabase.rpc('get_teacher_notification_counts', {
        p_teacher_id: teacherId,
      });
      
      if (error) throw error;
      return data as NotificationCounts;
    },
    enabled: !!teacherId,
    refetchInterval: 60000, // Atualiza a cada 1 minuto
  });
}
```

### Hook: useNotificationActions

**Arquivo:** `src/hooks/useNotificationActions.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function useNotificationActions() {
  const { t } = useTranslation('inbox');
  const queryClient = useQueryClient();
  // Não precisa de TeacherContext aqui - as mutations usam o ID da notificação

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['teacher-notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notification-counts'] });
  };

  const updateStatus = useMutation({
    mutationFn: async ({ 
      notificationId, 
      newStatus 
    }: { 
      notificationId: string; 
      newStatus: 'inbox' | 'saved' | 'done';
    }) => {
      const { error } = await supabase.rpc('update_notification_status', {
        p_notification_id: notificationId,
        p_new_status: newStatus,
      });
      
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      invalidateQueries();
      
      const messages = {
        done: t('actions.markedDone'),
        saved: t('actions.saved'),
        inbox: t('actions.movedToInbox'),
      };
      
      toast.success(messages[newStatus]);
    },
    onError: () => {
      toast.error(t('errors.updateFailed'));
    },
  });

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc('mark_notification_read', {
        p_notification_id: notificationId,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateQueries();
    },
  });

  return {
    markAsDone: (id: string) => updateStatus.mutate({ notificationId: id, newStatus: 'done' }),
    save: (id: string) => updateStatus.mutate({ notificationId: id, newStatus: 'saved' }),
    moveToInbox: (id: string) => updateStatus.mutate({ notificationId: id, newStatus: 'inbox' }),
    markAsRead: (id: string) => markAsRead.mutate(id),
    isLoading: updateStatus.isPending || markAsRead.isPending,
  };
}
```

---

## Componentes React

### NotificationBell

**Arquivo:** `src/components/NotificationBell.tsx`

```tsx
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotificationCounts } from '@/hooks/useTeacherNotifications';
import { useNavigate } from 'react-router-dom';

export function NotificationBell() {
  const navigate = useNavigate();
  const { data: counts } = useNotificationCounts();
  
  const inboxCount = counts?.inbox ?? 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => navigate('/inbox')}
      aria-label={`Notificações (${inboxCount} novas)`}
    >
      <Bell className="h-5 w-5" />
      {inboxCount > 0 && (
        <Badge 
          variant="destructive" 
          className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs"
        >
          {inboxCount > 99 ? '99+' : inboxCount}
        </Badge>
      )}
    </Button>
  );
}
```

### InboxTabs

**Arquivo:** `src/components/Inbox/InboxTabs.tsx`

```tsx
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import type { NotificationStatus, NotificationCounts } from '@/types/inbox';

interface InboxTabsProps {
  activeTab: NotificationStatus;
  onTabChange: (tab: NotificationStatus) => void;
  counts: NotificationCounts;
}

export function InboxTabs({ activeTab, onTabChange, counts }: InboxTabsProps) {
  const { t } = useTranslation('inbox');

  return (
    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as NotificationStatus)}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="inbox" className="gap-2">
          {t('tabs.inbox')}
          {counts.inbox > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium">
              {counts.inbox}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="saved" className="gap-2">
          {t('tabs.saved')}
          {counts.saved > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {counts.saved}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="done" className="gap-2">
          {t('tabs.done')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
```

### InboxFilters

**Arquivo:** `src/components/Inbox/InboxFilters.tsx`

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTranslation } from 'react-i18next';
import type { NotificationFilters, UrgencyLevel } from '@/types/inbox';

interface InboxFiltersProps {
  filters: NotificationFilters;
  onFiltersChange: (filters: NotificationFilters) => void;
}

export function InboxFilters({ filters, onFiltersChange }: InboxFiltersProps) {
  const { t } = useTranslation('inbox');

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Filtro de Urgência */}
      <Select
        value={filters.urgency ?? 'all'}
        onValueChange={(v) => onFiltersChange({ 
          ...filters, 
          urgency: v === 'all' ? undefined : v as UrgencyLevel 
        })}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder={t('filters.urgency.label')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.urgency.all')}</SelectItem>
          <SelectItem value="high">{t('filters.urgency.high')}</SelectItem>
          <SelectItem value="medium">{t('filters.urgency.medium')}</SelectItem>
          <SelectItem value="low">{t('filters.urgency.low')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Filtro de Lidas */}
      <ToggleGroup
        type="single"
        value={filters.isRead === undefined ? 'all' : filters.isRead ? 'read' : 'unread'}
        onValueChange={(v) => onFiltersChange({
          ...filters,
          isRead: v === 'all' ? undefined : v === 'read',
        })}
      >
        <ToggleGroupItem value="all">{t('filters.read.all')}</ToggleGroupItem>
        <ToggleGroupItem value="unread">{t('filters.read.unread')}</ToggleGroupItem>
        <ToggleGroupItem value="read">{t('filters.read.read')}</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
```

### NotificationItem

**Arquivo:** `src/components/Inbox/NotificationItem.tsx`

```tsx
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Bookmark, Undo2, Clock, Gift, AlertCircle, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotificationActions } from '@/hooks/useNotificationActions';
import { cn } from '@/lib/utils';
import type { TeacherNotification, NotificationStatus } from '@/types/inbox';
import { URGENCY_STYLES, READ_STYLES, CATEGORY_CONFIG } from '@/types/inbox';

const ICONS = {
  Clock,
  Gift,
  AlertCircle,
  FileText,
};

interface NotificationItemProps {
  notification: TeacherNotification;
  currentTab: NotificationStatus;
}

export function NotificationItem({ notification, currentTab }: NotificationItemProps) {
  const navigate = useNavigate();
  const { markAsDone, save, moveToInbox, markAsRead, isLoading } = useNotificationActions();
  
  const config = CATEGORY_CONFIG[notification.category];
  const Icon = ICONS[config.icon as keyof typeof ICONS];
  const urgencyStyle = URGENCY_STYLES[notification.urgency];
  const readStyle = notification.is_read ? READ_STYLES.read : READ_STYLES.unread;

  const handleClick = () => {
    markAsRead(notification.id);
    navigate(notification.navigation_url);
  };

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <Card
      className={cn(
        'flex items-center gap-4 p-4 cursor-pointer transition-colors hover:bg-accent/50',
        urgencyStyle.border,
        readStyle
      )}
      onClick={handleClick}
    >
      {/* Ícone da Categoria */}
      <div className={cn('p-2 rounded-full', urgencyStyle.background)}>
        <Icon className={cn('h-4 w-4', urgencyStyle.text)} />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{notification.title}</span>
          {notification.dependent_name && (
            <span className="text-xs text-muted-foreground">
              ({notification.dependent_name})
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground truncate">
          {notification.student_name} • {notification.subtitle}
        </div>
      </div>

      {/* Ações de Triagem */}
      <div className="flex items-center gap-1">
        {currentTab === 'inbox' && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => handleAction(e, () => save(notification.id))}
              disabled={isLoading}
              title="Salvar"
            >
              <Bookmark className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => handleAction(e, () => markAsDone(notification.id))}
              disabled={isLoading}
              title="Marcar como Done"
            >
              <Check className="h-4 w-4" />
            </Button>
          </>
        )}
        
        {currentTab === 'saved' && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => handleAction(e, () => moveToInbox(notification.id))}
              disabled={isLoading}
              title="Mover para Inbox"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => handleAction(e, () => markAsDone(notification.id))}
              disabled={isLoading}
              title="Marcar como Done"
            >
              <Check className="h-4 w-4" />
            </Button>
          </>
        )}
        
        {currentTab === 'done' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => handleAction(e, () => moveToInbox(notification.id))}
            disabled={isLoading}
            title="Desfazer (voltar para Inbox)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  );
}
```

### InboxEmptyState

**Arquivo:** `src/components/Inbox/InboxEmptyState.tsx`

```tsx
import { Inbox, Bookmark, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NotificationStatus } from '@/types/inbox';

const ICONS = {
  inbox: Inbox,
  saved: Bookmark,
  done: CheckCircle,
};

interface InboxEmptyStateProps {
  tab: NotificationStatus;
}

export function InboxEmptyState({ tab }: InboxEmptyStateProps) {
  const { t } = useTranslation('inbox');
  const Icon = ICONS[tab];

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">
        {t(`empty.${tab}.title`)}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        {t(`empty.${tab}.description`)}
      </p>
    </div>
  );
}
```

### InboxPage

**Arquivo:** `src/pages/Inbox.tsx`

```tsx
import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { InboxTabs } from '@/components/Inbox/InboxTabs';
import { InboxFilters } from '@/components/Inbox/InboxFilters';
import { NotificationItem } from '@/components/Inbox/NotificationItem';
import { InboxEmptyState } from '@/components/Inbox/InboxEmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  useTeacherNotifications, 
  useNotificationCounts 
} from '@/hooks/useTeacherNotifications';
import { useTranslation } from 'react-i18next';
import type { NotificationStatus, NotificationFilters } from '@/types/inbox';

export default function Inbox() {
  const { t } = useTranslation('inbox');
  const [activeTab, setActiveTab] = useState<NotificationStatus>('inbox');
  const [filters, setFilters] = useState<NotificationFilters>({});

  const { data: counts, isLoading: countsLoading } = useNotificationCounts();
  const { data: notifications, isLoading: notificationsLoading } = useTeacherNotifications({
    status: activeTab,
    filters,
  });

  const isLoading = countsLoading || notificationsLoading;

  return (
    <Layout>
      <div className="container max-w-4xl py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>

        {/* Tabs */}
        {counts && (
          <InboxTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            counts={counts}
          />
        )}

        {/* Filtros */}
        <InboxFilters filters={filters} onFiltersChange={setFilters} />

        {/* Lista de Notificações */}
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))
          ) : notifications && notifications.length > 0 ? (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                currentTab={activeTab}
              />
            ))
          ) : (
            <InboxEmptyState tab={activeTab} />
          )}
        </div>
      </div>
    </Layout>
  );
}
```

---

## Paginação e Performance

### Hook com Paginação

Para listas grandes, implementar "Carregar Mais" (Load More) pattern:

**Arquivo:** `src/hooks/useTeacherNotifications.ts` (versão com paginação)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTeacherContext } from '@/contexts/TeacherContext';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useCallback } from 'react';
import type { 
  TeacherNotification, 
  NotificationStatus, 
  NotificationFilters,
  NotificationCounts 
} from '@/types/inbox';

interface UseTeacherNotificationsOptions {
  status: NotificationStatus;
  filters?: NotificationFilters;
  limit?: number;
}

export function useTeacherNotifications(options: UseTeacherNotificationsOptions) {
  const { status, filters, limit = 50 } = options;
  const [offset, setOffset] = useState(0);
  
  // CORREÇÃO: usar selectedTeacherId diretamente (para alunos) ou userId (para professores)
  const { selectedTeacherId } = useTeacherContext();
  const { user, isProfessor } = useAuth();
  
  // Professores usam seu próprio ID, alunos usam o ID do professor selecionado
  const teacherId = isProfessor ? user?.id : selectedTeacherId;
  
  const query = useQuery({
    queryKey: ['teacher-notifications', teacherId, status, filters, offset],
    queryFn: async () => {
      if (!teacherId) return [];
      
      const { data, error } = await supabase.rpc('get_teacher_notifications', {
        p_teacher_id: teacherId,
        p_status: status,
        p_urgency: filters?.urgency ?? null,
        p_is_read: filters?.isRead ?? null,
        p_limit: limit,
        p_offset: offset,
      });
      
      if (error) throw error;
      return (data ?? []) as TeacherNotification[];
    },
    enabled: !!teacherId,
  });

  // Função para carregar mais
  const loadMore = useCallback(() => {
    setOffset(prev => prev + limit);
  }, [limit]);
  
  // Verificar se há mais itens para carregar
  const hasMore = (query.data?.length ?? 0) === limit;
  
  // Reset offset quando filtros mudam
  const resetPagination = useCallback(() => {
    setOffset(0);
  }, []);

  return { 
    ...query, 
    loadMore, 
    hasMore,
    resetPagination,
    currentOffset: offset 
  };
}
```

### UI com "Carregar Mais"

**Adicionar no final da `InboxPage`:**

```tsx
// Dentro do componente Inbox, após a lista de notificações:
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

// Na query:
const { 
  data: notifications, 
  isLoading: notificationsLoading,
  isFetching,
  loadMore,
  hasMore 
} = useTeacherNotifications({
  status: activeTab,
  filters,
});

// No JSX, após a lista:
{hasMore && !isLoading && (
  <div className="flex justify-center pt-4">
    <Button 
      variant="outline" 
      onClick={loadMore} 
      disabled={isFetching}
      className="gap-2"
    >
      {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
      {t('pagination.loadMore')}
    </Button>
  </div>
)}
```

### Traduções para Paginação

**`src/i18n/locales/pt/inbox.json`:**
```json
{
  "pagination": {
    "loadMore": "Carregar mais"
  }
}
```

**`src/i18n/locales/en/inbox.json`:**
```json
{
  "pagination": {
    "loadMore": "Load more"
  }
}
```

### Fallback no Frontend para student_name NULL

**No componente `NotificationItem.tsx`:**

```tsx
// Garantir fallback na renderização
<div className="text-sm text-muted-foreground truncate">
  {notification.student_name || 'Aluno'} • {notification.subtitle}
</div>
```

---

## i18n

### Português

**Arquivo:** `src/i18n/locales/pt/inbox.json`

```json
{
  "title": "Notificações",
  "subtitle": "Gerencie suas pendências e alertas",
  
  "tabs": {
    "inbox": "Inbox",
    "saved": "Salvas",
    "done": "Done"
  },
  
  "filters": {
    "urgency": {
      "label": "Urgência",
      "all": "Todas",
      "high": "Alta",
      "medium": "Média",
      "low": "Baixa"
    },
    "read": {
      "all": "Todas",
      "unread": "Não lidas",
      "read": "Lidas"
    }
  },
  
  "categories": {
    "pendingPastClasses": "Aula não confirmada",
    "amnestyEligible": "Anistia disponível",
    "overdueInvoices": "Fatura atrasada",
    "pendingReports": "Relatório pendente"
  },
  
  "actions": {
    "markedDone": "Marcado como concluído",
    "saved": "Salvo para depois",
    "movedToInbox": "Movido para Inbox"
  },
  
  "empty": {
    "inbox": {
      "title": "Inbox vazio",
      "description": "Você não tem notificações pendentes. Bom trabalho!"
    },
    "saved": {
      "title": "Nenhum item salvo",
      "description": "Salve notificações importantes para acessar depois."
    },
    "done": {
      "title": "Nenhum item concluído",
      "description": "Itens marcados como Done aparecerão aqui."
    }
  },
  
  "errors": {
    "updateFailed": "Erro ao atualizar notificação"
  }
}
```

### English

**Arquivo:** `src/i18n/locales/en/inbox.json`

```json
{
  "title": "Notifications",
  "subtitle": "Manage your pending tasks and alerts",
  
  "tabs": {
    "inbox": "Inbox",
    "saved": "Saved",
    "done": "Done"
  },
  
  "filters": {
    "urgency": {
      "label": "Urgency",
      "all": "All",
      "high": "High",
      "medium": "Medium",
      "low": "Low"
    },
    "read": {
      "all": "All",
      "unread": "Unread",
      "read": "Read"
    }
  },
  
  "categories": {
    "pendingPastClasses": "Unconfirmed class",
    "amnestyEligible": "Amnesty available",
    "overdueInvoices": "Overdue invoice",
    "pendingReports": "Pending report"
  },
  
  "actions": {
    "markedDone": "Marked as done",
    "saved": "Saved for later",
    "movedToInbox": "Moved to Inbox"
  },
  
  "empty": {
    "inbox": {
      "title": "Inbox empty",
      "description": "You have no pending notifications. Great job!"
    },
    "saved": {
      "title": "No saved items",
      "description": "Save important notifications to access later."
    },
    "done": {
      "title": "No completed items",
      "description": "Items marked as Done will appear here."
    }
  },
  
  "errors": {
    "updateFailed": "Failed to update notification"
  }
}
```

---

## Integração

### Layout.tsx - NotificationBell no Header

**IMPORTANTE:** Existe um bug atual no Layout.tsx (linha ~71) onde `{isAluno}` é renderizado como boolean em vez de componente. Isso deve ser corrigido durante a integração.

```tsx
// Em Layout.tsx, adicionar no header:
import { NotificationBell } from '@/components/NotificationBell';
import { useAuth } from '@/hooks/useAuth';

// Dentro do header:
const { isProfessor, isAluno } = useAuth();

<div className="ml-auto flex items-center gap-4">
  {/* CORRIGIR BUG: isAluno era renderizado como boolean */}
  {isAluno && <TeacherContextSwitcher />}
  {isProfessor && <NotificationBell />}
</div>
```

### App.tsx - Rota /inbox

**OBRIGATÓRIO:** A rota `/inbox` deve ser adicionada ao App.tsx para que a página seja acessível.

```tsx
// Adicionar import:
import Inbox from '@/pages/Inbox';

// Adicionar rota ANTES do catch-all "*":
<Route path="/inbox" element={<Inbox />} />
```

### AppSidebar.tsx - Link no Menu

**OBRIGATÓRIO:** Adicionar item no menu de navegação para professores:

```tsx
// Adicionar import:
import { Bell } from 'lucide-react';

// Adicionar item no menuItems (apenas para professores):
{
  title: t('navigation:sidebar.inbox'),
  url: '/inbox',
  icon: Bell,
  showFor: 'professor', // ou usar lógica condicional existente
}
```

### navigation.json - Traduções da Sidebar

**OBRIGATÓRIO:** Adicionar chave de tradução nos arquivos de navegação:

**`src/i18n/locales/pt/navigation.json`:**
```json
{
  "sidebar": {
    // ... outras chaves existentes ...
    "inbox": "Notificações"
  }
}
```

**`src/i18n/locales/en/navigation.json`:**
```json
{
  "sidebar": {
    // ... outras chaves existentes ...
    "inbox": "Notifications"
  }
}
```

---

## Implementação das Páginas de Destino

### /agenda - Query Params Handler

As páginas de destino precisam processar os query params enviados pelas notificações:

**Arquivo:** `src/pages/Agenda.tsx` - Adicionar lógica de processamento:

```tsx
import { useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';

// Dentro do componente Agenda:
const [searchParams, setSearchParams] = useSearchParams();

// Processar query params vindos do Inbox
useEffect(() => {
  const classId = searchParams.get('classId');
  const action = searchParams.get('action');
  const dateParam = searchParams.get('date');
  
  // Se nenhum param relevante, não fazer nada
  if (!classId && !action && !dateParam) return;
  
  // 1. Navegar para a data especificada
  if (dateParam) {
    const targetDate = new Date(dateParam);
    // Atualizar o range visível do calendário para incluir a data
    setVisibleRange(prev => {
      const newStart = startOfWeek(targetDate, { weekStartsOn: 0 });
      const newEnd = endOfWeek(targetDate, { weekStartsOn: 0 });
      return { start: newStart, end: newEnd };
    });
    // Ou usar a data diretamente se for um calendário mensal
    setSelectedDate(targetDate);
  }
  
  // 2. Buscar e processar a aula específica
  if (classId && calendarClasses.length > 0) {
    const targetClass = calendarClasses.find(c => c.id === classId);
    
    if (targetClass) {
      // Dependendo da action, abrir o modal correspondente
      if (action === 'report') {
        // Abrir modal de relatório
        setReportModal({
          isOpen: true,
          classData: {
            id: targetClass.id,
            class_date: targetClass.class_date,
            participants: targetClass.participants,
            service_name: targetClass.service?.name,
            // ... outros dados necessários
          }
        });
      } else if (action === 'amnesty') {
        // NOTA IMPORTANTE: AmnestyButton usa Dialog interno, não um modal global
        // Para action=amnesty, devemos:
        // 1. Selecionar a aula no calendário
        // 2. O usuário clicará no AmnestyButton dentro do card da aula
        // 
        // Alternativa futura: criar um modal global de anistia que pode ser
        // acionado programaticamente via context ou URL params
        setSelectedClass(targetClass);
        // Toast informativo para guiar o usuário
        toast.info('Selecione "Conceder Anistia" no menu da aula destacada');
      } else {
        // Apenas destacar/selecionar a aula
        setSelectedClass(targetClass);
      }
    }
  }
  
  // 3. Limpar params após processar (evita reprocessamento)
  if (classId || action || dateParam) {
    setSearchParams({}, { replace: true });
  }
}, [calendarClasses, searchParams, setSearchParams]);
```

### /faturas - Highlight Handler

**Arquivo:** `src/pages/Faturas.tsx` - Adicionar lógica de highlight:

```tsx
import { useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// Dentro do componente Faturas:
const [searchParams, setSearchParams] = useSearchParams();
const highlightRef = useRef<HTMLTableRowElement>(null);

// ID da fatura a ser destacada
const highlightId = searchParams.get('highlight');

// Scroll para a fatura destacada quando os dados carregarem
useEffect(() => {
  if (highlightId && highlightRef.current && invoices && invoices.length > 0) {
    // Verificar se a fatura existe na lista
    const invoiceExists = invoices.some(inv => inv.id === highlightId);
    
    if (invoiceExists) {
      // Scroll suave para a fatura
      highlightRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
      
      // Limpar param após scroll (com delay para animação)
      setTimeout(() => {
        setSearchParams({}, { replace: true });
      }, 2000); // 2 segundos para o usuário ver o highlight
    }
  }
}, [highlightId, invoices, setSearchParams]);

// Na renderização da TableRow:
{invoices.map((invoice) => (
  <TableRow 
    key={invoice.id}
    ref={invoice.id === highlightId ? highlightRef : undefined}
    className={cn(
      // Highlight visual: borda e animação de pulse
      invoice.id === highlightId && [
        'ring-2 ring-primary ring-offset-2',
        'animate-pulse',
        'bg-primary/5'
      ]
    )}
  >
    {/* ... conteúdo da row ... */}
  </TableRow>
))}
```

---

## Pré-requisitos

### Query Params Suportados

As páginas de destino devem suportar os seguintes query params:

#### /agenda
| Param | Tipo | Descrição |
|-------|------|-----------|
| `date` | YYYY-MM-DD | Data a ser exibida no calendário |
| `classId` | UUID | ID da aula a ser destacada/aberta |
| `action` | string | Ação a ser executada: `report`, `amnesty` |

#### /faturas
| Param | Tipo | Descrição |
|-------|------|-----------|
| `highlight` | UUID | ID da fatura a ser destacada |

---

## Fases de Implementação

### Fase 1: Infraestrutura (Backend)
1. ✅ Criar tabela `teacher_notifications`
2. ✅ Criar RLS policies
3. ✅ Criar RPCs (counts, list, update, mark read)
4. ✅ Criar triggers de auto-remoção
5. ⬜ Criar edge function de varredura diária
6. ⬜ Configurar cron job

### Fase 2: UI Base (Frontend)
1. ⬜ Criar types em `src/types/inbox.ts`
2. ⬜ Criar hooks `useTeacherNotifications` e `useNotificationActions`
3. ⬜ Criar componente `NotificationBell`
4. ⬜ Criar componentes Inbox (Tabs, Filters, Item, EmptyState)
5. ⬜ Criar página `/inbox`
6. ⬜ Adicionar traduções i18n

### Fase 3: Integração
1. ⬜ Integrar NotificationBell no Layout
2. ⬜ Adicionar rota no App.tsx
3. ⬜ Preparar páginas de destino (/agenda, /faturas)
4. ⬜ Testar fluxos completos

### Fase 4: Refinamentos
1. ⬜ Realtime updates (opcional)
2. ⬜ Animações de transição
3. ⬜ Skeleton loading
4. ⬜ Tratamento de erros

---

## Resumo das Mudanças vs. Plano Anterior

| Antes (Central de Ações) | Depois (Sistema de Notificações) |
|--------------------------|----------------------------------|
| Ações executadas inline | Navegação para tela de ação |
| Uma lista única | 3 abas (Inbox/Salvas/Done) |
| Sem tracking de leitura | is_read + visual diferenciado |
| localStorage para ignorar | Tabela persistente |
| Resolve pendências | Triagem de notificações |
| Contagens por categoria | Contagens por status |

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Queries lentas com muitos dados | Índices compostos + LIMIT + paginação |
| Notificações órfãs (item excluído) | Triggers de auto-remoção com SECURITY DEFINER |
| Concorrência (2 abas) | React Query invalidation automática |
| Confusão UX (Done ≠ Resolvido) | Messaging claro na UI + tooltip explicativo |
| Aulas experimentais gerando notificações | Filtro `is_experimental = false` em todas queries |
| RLS bypass para INSERT/DELETE | Triggers e Edge Functions com service_role apenas |
| Pendências antigas poluindo inbox | Filtro temporal de 30 dias na varredura |
| Acúmulo de Done antigos | Cleanup automático de Done > 30 dias |

---

## Notas Técnicas

### Múltiplas Categorias por Aula

Uma mesma aula pode gerar múltiplas notificações (ex: `pending_past_classes` + `pending_reports`). 

A constraint UNIQUE inclui `category`, permitindo isso:
```sql
UNIQUE(teacher_id, source_type, source_id, category)
```

Quando uma ação resolve a pendência (ex: aula confirmada), o trigger remove **APENAS** a notificação daquela categoria específica.

### Contagem do Badge

O badge no `NotificationBell` mostra o total de notificações na aba **Inbox** (não lidas + lidas).

Para mostrar apenas não lidas, alterar a query em `useNotificationCounts`:
```sql
SELECT COUNT(*) FILTER (WHERE status = 'inbox' AND is_read = false)
```

### Performance

Para garantir performance com muitos professores:
- Índice composto `idx_teacher_notifications_main_query` cobre a query principal
- LIMIT de 50 por página com paginação
- Edge function roda às 06:00 UTC (horário de baixo tráfego)
- Triggers são leves (apenas DELETE simples)

### Política de Cleanup

**Notificações Done antigas são removidas automaticamente:**

- A Edge Function `generate-teacher-notifications` remove notificações Done com mais de 30 dias
- Isso previne acúmulo infinito de dados históricos
- O cleanup roda junto com a varredura diária (06:00 UTC)

**Pendências antigas não são processadas:**

- A varredura ignora pendências com mais de 30 dias
- Isso evita que dados legados poluam o inbox de professores
- Se necessário, o período pode ser ajustado na Edge Function

### AmnestyButton - Comportamento Atual

O `AmnestyButton` (em `src/components/AmnestyButton.tsx`) usa um `Dialog` interno, não um modal global controlado por context.

**Implicação para `action=amnesty`:**
- Não é possível abrir o dialog de anistia programaticamente via URL
- A navegação `/agenda?action=amnesty&classId=...` deve:
  1. Navegar para a data e selecionar/destacar a aula
  2. Mostrar um toast guiando o usuário a clicar no botão de anistia

**Alternativa futura:**
- Refatorar `AmnestyButton` para usar um context global
- Ou criar um modal de anistia separado que pode ser acionado via URL

---

## Checklist Pré-Implementação

### Backend
- [ ] Criar tabela `teacher_notifications` com constraints (source_type: 'class' | 'invoice')
- [ ] Criar RLS policies (SELECT e UPDATE apenas)
- [ ] Criar RPCs com SECURITY DEFINER (com fallback 'Aluno não identificado' para student_name)
- [ ] Criar triggers de auto-remoção
- [ ] **CRIAR PASTA E ARQUIVO:** `supabase/functions/generate-teacher-notifications/index.ts`
- [ ] Criar edge function `generate-teacher-notifications` (com filtro temporal, cleanup e validação de business_profile)
- [ ] Adicionar config em `supabase/config.toml`: `[functions.generate-teacher-notifications] verify_jwt = false`
- [ ] Configurar cron job via pg_cron (06:00 UTC)
- [ ] Adicionar índices de performance

### Frontend
- [ ] Corrigir bug no Layout.tsx (`{isAluno}` → `{isAluno && <...>}`) ✅ JÁ CORRIGIDO
- [ ] Criar types em `src/types/inbox.ts` (NotificationSourceType: 'class' | 'invoice')
- [ ] Criar hooks `useTeacherNotifications` (com suporte a paginação) e `useNotificationActions`
- [ ] Criar componente `NotificationBell` (restrito a `isProfessor` no Layout)
- [ ] Criar componentes Inbox (Tabs, Filters, Item, EmptyState)
- [ ] Criar página `/inbox` (com botão "Carregar Mais")
- [ ] Garantir fallback `|| 'Aluno'` na renderização de `student_name` em NotificationItem
- [ ] Adicionar traduções i18n (pt e en) - inbox.json e navigation.json (incluir `pagination.loadMore`)
- [ ] Integrar NotificationBell no Layout (verificar `isProfessor` antes de renderizar)
- [ ] Adicionar rota `/inbox` no App.tsx (protegida para professores)
- [ ] Adicionar item "Notificações" no AppSidebar.tsx (apenas para professores)
- [ ] **NOVA IMPLEMENTAÇÃO:** Adicionar `useSearchParams` em `/agenda` (não existe atualmente)
- [ ] **NOVA IMPLEMENTAÇÃO:** Adicionar `useSearchParams` em `/faturas` (não existe atualmente)
- [ ] Implementar lógica de processamento de query params vindos do Inbox
- [ ] Testar fluxos completos

### Fase 4 (Opcional)
- [ ] Implementar triggers de criação de notificações em tempo real (ver seção "Triggers de Criação em Tempo Real")

---

## Validação Final do Documento

### Correções Aplicadas (22 itens):

1. ✅ **TeacherContext alignment** - Hooks usam `selectedTeacherId` + `isProfessor ? user.id : selectedTeacherId`
2. ✅ **Invoice status normalization** - Status real é 'pendente', 'overdue' é calculado
3. ✅ **Cron job via pg_cron** - SQL completo com pg_cron e pg_net
4. ✅ **Layout.tsx bug fix** - Documentado e já corrigido no código
5. ✅ **source_type simplificado** - Removido 'class_report', usa apenas 'class' | 'invoice'
6. ✅ **Rota /inbox obrigatória** - Adicionada na seção de integração
7. ✅ **AppSidebar obrigatório** - Item de menu com traduções
8. ✅ **navigation.json traduções** - Chaves pt e en documentadas
9. ✅ **Filtro temporal 30 dias** - Edge Function filtra pendências antigas
10. ✅ **Cleanup de Done antigos** - Remoção automática após 30 dias
11. ✅ **Amnesty handling documentado** - Explicação sobre Dialog interno vs modal global
12. ✅ **CASE 'class_report' REMOVIDO da RPC** - A RPC get_teacher_notifications não contém mais o case para 'class_report'
13. ✅ **Query de features CORRIGIDA** - Usa subscription_status = 'active' ao invés de apenas current_plan_id
14. ✅ **Criação da pasta edge function** - Checklist inclui criação de `supabase/functions/generate-teacher-notifications/index.ts`
15. ✅ **useSearchParams clarificado** - Marcado como NOVA IMPLEMENTAÇÃO (não existe em Agenda.tsx nem Faturas.tsx)
16. ✅ **NotificationBell restrito** - Documentado que deve verificar `isProfessor` antes de renderizar
17. ✅ **Config.toml documentado** - Checklist inclui adicionar entry para a edge function
18. ✅ **student_name NULL fallback** - RPC usa COALESCE com 'Aluno não identificado' como fallback final
19. ✅ **Triggers de criação em tempo real** - Documentado como melhoria OPCIONAL para Fase 4
20. ✅ **Paginação e Performance** - Seção completa com hook, UI "Carregar Mais" e traduções
21. ✅ **business_profile_id validação** - Edge Function valida BP antes de criar alertas de faturas
22. ✅ **Frontend fallback student_name** - Componente NotificationItem usa `|| 'Aluno'` como fallback

---

## Lacunas Identificadas na Revisão (15 itens)

### CRÍTICO: Issues que impedem funcionamento correto

| # | Lacuna | Impacto | Solução | Status |
|---|--------|---------|---------|--------|
| 1 | **Feature `class_reports` não existe em `subscription_plans`** | Edge Function falhará ao verificar features do professor para `pending_reports` | Adicionar coluna `class_reports: boolean` na tabela `subscription_plans.features` OU usar proxy via plano name ('professional'/'premium') | ⬜ PENDENTE |
| 2 | **Filtro `is_template = false` ausente na RPC** | Aulas template (recorrentes) podem aparecer no inbox como pendentes | Adicionar `AND c.is_template = false` na query `get_teacher_notifications` ao buscar classes | ⬜ PENDENTE |
| 3 | **Tabela `teacher_notifications` não existe** | Toda a funcionalidade depende desta tabela | Executar migration para criar tabela com RLS | ⬜ PENDENTE |
| 4 | **Edge Function `generate-teacher-notifications` não existe** | Notificações não serão geradas automaticamente | Criar pasta e arquivo conforme documentado | ⬜ PENDENTE |

### IMPORTANTE: Issues que afetam UX/completude

| # | Lacuna | Impacto | Solução | Status |
|---|--------|---------|---------|--------|
| 5 | **`Agenda.tsx` não usa `useSearchParams`** | Deep-linking do inbox não funcionará (scroll, highlight, action) | Implementar lógica de processamento de query params conforme seção 2082-2159 | ⬜ PENDENTE |
| 6 | **`Faturas.tsx` não usa `useSearchParams`** | Highlight de fatura vinda do inbox não funcionará | Implementar lógica de highlight conforme seção 2165-2214 | ⬜ PENDENTE |
| 7 | **Rota `/inbox` não existe em `App.tsx`** | Página não será acessível | Adicionar `<Route path="/inbox" element={<Inbox />} />` | ⬜ PENDENTE |
| 8 | **`NotificationBell` não existe** | Ícone de sino não aparecerá no header | Criar componente conforme seção 1324-1361 | ⬜ PENDENTE |
| 9 | **Índice para `category` ausente** | Queries filtradas por categoria serão lentas | Adicionar `CREATE INDEX idx_teacher_notifications_category ON teacher_notifications(category);` | ⬜ PENDENTE |

### MENOR: Issues de edge cases e manutenção

| # | Lacuna | Impacto | Solução | Status |
|---|--------|---------|---------|--------|
| 10 | **Notificações órfãs (item excluído)** | Se uma aula/fatura for deletada, a notificação permanece | Adicionar lógica de cleanup na Edge Function ou trigger ON DELETE CASCADE | ⬜ PENDENTE |
| 11 | **Professores inativos recebem varredura** | Edge Function processa professores com `subscription_status != 'active'` | Adicionar filtro `subscription_status = 'active'` na varredura de faturas/relatórios | ⬜ PENDENTE |
| 12 | **Duplicação em aulas em grupo (`pending_reports`)** | Uma aula em grupo pode gerar múltiplas notificações (uma por participante) | A lógica já usa DISTINCT na query, mas verificar constraint UNIQUE funciona | ⚠️ VERIFICAR |
| 13 | **`AmnestyButton` não suporta abertura via URL** | `action=amnesty` não abre modal automaticamente | Refatorar para usar context global OU mostrar toast guiando usuário | ⚠️ DOCUMENTADO |
| 14 | **Traduções `inbox.json` não existem** | i18n falhará ao carregar página | Criar arquivos `src/i18n/locales/pt/inbox.json` e `en/inbox.json` | ⬜ PENDENTE |
| 15 | **cron job `pg_cron` não está ativo** | Edge Function não será executada diariamente | Executar SQL de configuração do pg_cron no Supabase SQL Editor | ⬜ MANUAL |

---

## Correções Específicas para Lacunas Críticas

### 1. Feature `class_reports` - Solução Alternativa

**Problema:** A tabela `subscription_plans` não possui `features.class_reports`.

**Solução A (Recomendada):** Usar o nome do plano como proxy:

```typescript
// Na Edge Function generate-teacher-notifications:
// Substituir a query que busca teachersWithClassReports por:

const { data: teachersWithReports, error: teacherFeatError } = await supabase
  .from("profiles")
  .select(`
    id,
    current_plan_id,
    subscription_status,
    subscription_plans!profiles_current_plan_id_fkey(name)
  `)
  .eq("role", "professor")
  .not("current_plan_id", "is", null)
  .eq("subscription_status", "active");

// Filtrar por nome do plano (professional ou premium têm relatórios)
const teachersWithClassReports = new Set<string>();
if (teachersWithReports) {
  for (const teacher of teachersWithReports) {
    const plan = teacher.subscription_plans as any;
    const planName = plan?.name?.toLowerCase() || '';
    // Planos professional e premium incluem relatórios
    if (planName.includes('professional') || planName.includes('premium')) {
      teachersWithClassReports.add(teacher.id);
    }
  }
}
```

**Solução B (Ideal, requer migration):** Adicionar campo `class_reports` em subscription_plans:

```sql
-- Adicionar campo features.class_reports (se a coluna features for JSONB)
UPDATE subscription_plans
SET features = features || '{"class_reports": true}'::jsonb
WHERE name ILIKE '%professional%' OR name ILIKE '%premium%';

UPDATE subscription_plans
SET features = features || '{"class_reports": false}'::jsonb
WHERE name ILIKE '%free%' OR name ILIKE '%basic%';
```

### 2. Filtro `is_template = false` na RPC

**Adicionar à RPC `get_teacher_notifications`:**

Na CTE `enriched_notifications`, dentro do CASE `WHEN 'class' THEN`, antes do `LIMIT 1`:

```sql
-- ANTES (linha 569-571):
WHERE c.id = tn.source_id
  AND c.is_experimental = false  -- IMPORTANTE: Filtrar aulas experimentais
LIMIT 1

-- DEPOIS:
WHERE c.id = tn.source_id
  AND c.is_experimental = false  -- IMPORTANTE: Filtrar aulas experimentais
  AND c.is_template = false      -- CRÍTICO: Excluir templates de aulas recorrentes
LIMIT 1
```

### 3. Índice para `category`

**Adicionar após criar a tabela:**

```sql
-- Índice para queries filtradas por categoria
CREATE INDEX idx_teacher_notifications_category 
ON teacher_notifications(category);

-- Índice composto para varredura de limpeza
CREATE INDEX idx_teacher_notifications_cleanup
ON teacher_notifications(status, status_changed_at)
WHERE status = 'done';
```

### 4. Tratamento de Registros Órfãos

**Opção A - Cleanup na Edge Function:**

Adicionar no início da Edge Function, após o cleanup de Done antigos:

```typescript
// Cleanup de notificações órfãs (aulas deletadas)
const { data: orphanClassNotifs } = await supabase
  .from("teacher_notifications")
  .select("id, source_id")
  .eq("source_type", "class");

if (orphanClassNotifs) {
  for (const notif of orphanClassNotifs) {
    const { data: classExists } = await supabase
      .from("classes")
      .select("id")
      .eq("id", notif.source_id)
      .single();
    
    if (!classExists) {
      await supabase
        .from("teacher_notifications")
        .delete()
        .eq("id", notif.id);
      cleaned++;
    }
  }
}

// Repetir para invoices...
```

**Opção B - Trigger ON DELETE (mais eficiente):**

```sql
-- Trigger para remover notificações quando aula é deletada
CREATE OR REPLACE FUNCTION remove_notifications_on_class_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM teacher_notifications
  WHERE source_type = 'class'
    AND source_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_class_delete_notifications
BEFORE DELETE ON classes
FOR EACH ROW
EXECUTE FUNCTION remove_notifications_on_class_delete();

-- Trigger para faturas
CREATE OR REPLACE FUNCTION remove_notifications_on_invoice_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM teacher_notifications
  WHERE source_type = 'invoice'
    AND source_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_invoice_delete_notifications
BEFORE DELETE ON invoices
FOR EACH ROW
EXECUTE FUNCTION remove_notifications_on_invoice_delete();
```

---

## Checklist Atualizado com Lacunas

### Fase 1: Infraestrutura (Backend) - ATUALIZADO

1. ⬜ Criar tabela `teacher_notifications` com constraints (source_type: 'class' | 'invoice')
2. ⬜ **NOVO:** Adicionar índice `idx_teacher_notifications_category`
3. ⬜ **NOVO:** Adicionar índice `idx_teacher_notifications_cleanup`
4. ⬜ Criar RLS policies (SELECT e UPDATE apenas)
5. ⬜ Criar RPCs com SECURITY DEFINER (com fallback 'Aluno não identificado' para student_name)
6. ⬜ **CRÍTICO:** Adicionar filtro `c.is_template = false` na RPC `get_teacher_notifications`
7. ⬜ Criar triggers de auto-remoção (classes e invoices)
8. ⬜ **NOVO:** Criar triggers de remoção de órfãos (ON DELETE)
9. ⬜ **CRIAR PASTA E ARQUIVO:** `supabase/functions/generate-teacher-notifications/index.ts`
10. ⬜ Criar edge function `generate-teacher-notifications` (com filtro temporal, cleanup e validação de business_profile)
11. ⬜ **CRÍTICO:** Usar proxy de nome do plano para `class_reports` (não existe em features)
12. ⬜ **NOVO:** Filtrar professores com `subscription_status = 'active'` na varredura
13. ⬜ Adicionar config em `supabase/config.toml`: `[functions.generate-teacher-notifications] verify_jwt = false`
14. ⬜ Configurar cron job via pg_cron (06:00 UTC) - **REQUER EXECUÇÃO MANUAL NO SQL EDITOR**

### Fase 2: UI Base (Frontend) - ATUALIZADO

1. ⬜ Criar types em `src/types/inbox.ts` (NotificationSourceType: 'class' | 'invoice')
2. ⬜ Criar hooks `useTeacherNotifications` (com suporte a paginação) e `useNotificationActions`
3. ⬜ Criar componente `NotificationBell` (restrito a `isProfessor` no Layout)
4. ⬜ Criar componentes Inbox (Tabs, Filters, Item, EmptyState)
5. ⬜ Criar página `/inbox` (com botão "Carregar Mais")
6. ⬜ Garantir fallback `|| 'Aluno'` na renderização de `student_name` em NotificationItem
7. ⬜ **CRIAR:** `src/i18n/locales/pt/inbox.json` conforme seção i18n
8. ⬜ **CRIAR:** `src/i18n/locales/en/inbox.json` conforme seção i18n
9. ⬜ **ATUALIZAR:** `src/i18n/locales/pt/navigation.json` com chave `sidebar.inbox`
10. ⬜ **ATUALIZAR:** `src/i18n/locales/en/navigation.json` com chave `sidebar.inbox`

### Fase 3: Integração - ATUALIZADO

1. ⬜ Integrar NotificationBell no Layout (verificar `isProfessor` antes de renderizar)
2. ⬜ **CRÍTICO:** Adicionar rota `/inbox` no App.tsx (protegida para professores)
3. ⬜ Adicionar item "Notificações" no AppSidebar.tsx (apenas para professores)
4. ⬜ **NOVA IMPLEMENTAÇÃO CRÍTICA:** Adicionar `useSearchParams` em `Agenda.tsx`
5. ⬜ **NOVA IMPLEMENTAÇÃO CRÍTICA:** Adicionar `useSearchParams` em `Faturas.tsx`
6. ⬜ Implementar lógica de processamento de query params vindos do Inbox
7. ⬜ **DOCUMENTADO:** `action=amnesty` mostra toast guiando usuário (AmnestyButton usa Dialog interno)
8. ⬜ Testar fluxos completos

### Fase 4: Refinamentos (Opcional)

1. ⬜ Realtime updates (Supabase Realtime)
2. ⬜ Animações de transição
3. ⬜ Skeleton loading
4. ⬜ Tratamento de erros
5. ⬜ **FUTURO:** Refatorar AmnestyButton para context global (permitir abertura via URL)
6. ⬜ **FUTURO:** Triggers de criação de notificações em tempo real

---

## Fluxo Completo Validado

```
[Cron 06:00 UTC]
    ↓
[Edge Function: varredura + cleanup]
    ↓ (filtra últimos 30 dias, verifica features via nome do plano, valida business_profile)
    ↓ (filtra is_experimental = false, is_template = false)
    ↓ (apenas professores com subscription_status = 'active')
[teacher_notifications: INSERT via upsert]
    ↓
[NotificationBell: badge com contagem]
    ↓ (clique)
[/inbox: triagem Inbox/Saved/Done + paginação]
    ↓ (clique na notificação)
[mark_notification_read + navigate]
    ↓
[/agenda ou /faturas com query params]
    ↓ (useSearchParams processa params)
[Resolução da pendência (confirmar, pagar, etc)]
    ↓ (trigger AFTER UPDATE)
[teacher_notifications: DELETE automático]
    ↓ (se item for deletado)
[trigger BEFORE DELETE: remove órfãos]
```

---

## Opções Documentadas para Fases Futuras

- **Fase 4 (Opcional)**: Triggers de criação em tempo real (trade-offs documentados)
- **Paginação**: Hook com offset + "Carregar Mais" pattern implementado
- **Infinite Scroll**: Pode substituir "Carregar Mais" futuramente
- **AmnestyButton Refactor**: Migrar para context global para suportar abertura via URL

---

## Lacunas Adicionais Identificadas (Revisão 2)

### Lacuna 16: Validação de `subscription_status` na Edge Function

**Problema:** O código da Edge Function não valida explicitamente o `subscription_status` do professor.

**Solução:** Adicionar filtro `.in('subscription_status', ['active', 'trialing'])` na query de professores.

```typescript
// Na varredura de professores
const { data: teachers } = await supabase
  .from("profiles")
  .select("id, current_plan_id, subscription_status")
  .eq("role", "professor")
  .in("subscription_status", ["active", "trialing"]); // CRÍTICO
```

### Lacuna 17: Inconsistência de Status de Cancelamento

**Problema:** O documento usa `status = 'cancelado'` em alguns trechos, mas o banco usa `'cancelada'` (feminino).

**Solução:** Padronizar para `'cancelada'` conforme schema real.

```sql
-- INCORRETO
AND cp.status != 'cancelado'

-- CORRETO
AND cp.status != 'cancelada'
```

**Arquivos afetados:**
- Triggers de auto-remoção
- RPCs de notificações
- Edge Function de varredura

### Lacuna 18: Exception Handling nas RPCs

**Problema:** As RPCs não possuem `EXCEPTION` handling para dados corrompidos.

**Solução:** Adicionar bloco de tratamento de exceções.

```sql
CREATE OR REPLACE FUNCTION get_teacher_notifications(
  p_teacher_id UUID,
  p_status TEXT DEFAULT 'inbox',
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS SETOF teacher_notification_view
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT /* ... query existente ... */;
  
EXCEPTION
  WHEN others THEN
    -- Log do erro (opcional)
    RAISE WARNING 'Erro em get_teacher_notifications: %', SQLERRM;
    -- Retorna conjunto vazio em caso de erro
    RETURN;
END;
$$;
```

### Lacuna 19: Componente InboxSkeleton

**Problema:** Não há componente de skeleton loading dedicado para o Inbox.

**Solução:** Criar `InboxSkeleton.tsx` para loading state.

```tsx
// src/components/Inbox/InboxSkeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";

export function InboxSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-4 border rounded-lg">
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Atualizar estrutura de arquivos:**

```
src/components/Inbox/
├── InboxTabs.tsx
├── InboxFilters.tsx
├── NotificationList.tsx
├── NotificationItem.tsx
├── InboxEmptyState.tsx
└── InboxSkeleton.tsx     # NOVO
```

### Lacuna 20: Deep-Linking não implementado em Agenda/Faturas

**Problema:** Confirmado que `Agenda.tsx` e `Faturas.tsx` não utilizam `useSearchParams`.

**Solução:** Implementar lógica de processamento de query params.

```tsx
// Em Agenda.tsx
import { useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';

export default function Agenda() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  useEffect(() => {
    const date = searchParams.get('date');
    const classId = searchParams.get('classId');
    const action = searchParams.get('action');
    
    if (date) {
      // Navegar para a data especificada
      setSelectedDate(new Date(date));
    }
    
    if (classId) {
      // Destacar ou abrir modal da aula
      setHighlightedClassId(classId);
      
      if (action === 'confirm') {
        // Abrir modal de confirmação
        openConfirmModal(classId);
      } else if (action === 'amnesty') {
        // Mostrar toast guiando para o botão de anistia
        toast({
          title: t('inbox.amnestyGuide'),
          description: t('inbox.amnestyGuideDescription'),
        });
      }
    }
    
    // Limpar params após processar
    if (date || classId || action) {
      setSearchParams({});
    }
  }, [searchParams]);
  
  // ... resto do componente
}
```

```tsx
// Em Faturas.tsx (similar)
import { useSearchParams } from 'react-router-dom';

export default function Faturas() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  useEffect(() => {
    const invoiceId = searchParams.get('invoiceId');
    const highlight = searchParams.get('highlight');
    
    if (invoiceId && highlight === 'true') {
      // Scroll para a fatura e destacar
      const element = document.getElementById(`invoice-${invoiceId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
        
        // Remover destaque após 3 segundos
        setTimeout(() => {
          element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        }, 3000);
      }
    }
    
    // Limpar params
    if (invoiceId || highlight) {
      setSearchParams({});
    }
  }, [searchParams]);
}
```

---

## Checklist Atualizado com Lacunas (Revisão 2)

### Fase 1: Infraestrutura (Backend) - ATUALIZADO

1. ⬜ Criar tabela `teacher_notifications` com constraints (source_type: 'class' | 'invoice')
2. ⬜ **NOVO:** Adicionar índice `idx_teacher_notifications_category`
3. ⬜ **NOVO:** Adicionar índice `idx_teacher_notifications_cleanup`
4. ⬜ Criar RLS policies (SELECT e UPDATE apenas)
5. ⬜ Criar RPCs com SECURITY DEFINER (com fallback 'Aluno não identificado' para student_name)
6. ⬜ **CRÍTICO:** Adicionar filtro `c.is_template = false` na RPC `get_teacher_notifications`
7. ⬜ **NOVO (Lacuna 18):** Adicionar EXCEPTION handling nas RPCs
8. ⬜ Criar triggers de auto-remoção (classes e invoices)
9. ⬜ **NOVO:** Criar triggers de remoção de órfãos (ON DELETE)
10. ⬜ **CRIAR PASTA E ARQUIVO:** `supabase/functions/generate-teacher-notifications/index.ts`
11. ⬜ Criar edge function `generate-teacher-notifications` (com filtro temporal, cleanup e validação de business_profile)
12. ⬜ **CRÍTICO:** Usar proxy de nome do plano para `class_reports` (não existe em features)
13. ⬜ **NOVO (Lacuna 16):** Filtrar professores com `subscription_status IN ('active', 'trialing')` na varredura
14. ⬜ **NOVO (Lacuna 17):** Usar `'cancelada'` (não `'cancelado'`) nos status de cancelamento
15. ⬜ Adicionar config em `supabase/config.toml`: `[functions.generate-teacher-notifications] verify_jwt = false`
16. ⬜ Configurar cron job via pg_cron (06:00 UTC) - **REQUER EXECUÇÃO MANUAL NO SQL EDITOR**

### Fase 2: UI Base (Frontend) - ATUALIZADO

1. ⬜ Criar types em `src/types/inbox.ts` (NotificationSourceType: 'class' | 'invoice')
2. ⬜ Criar hooks `useTeacherNotifications` (com suporte a paginação) e `useNotificationActions`
3. ⬜ Criar componente `NotificationBell` (restrito a `isProfessor` no Layout)
4. ⬜ Criar componentes Inbox (Tabs, Filters, Item, EmptyState)
5. ⬜ **NOVO (Lacuna 19):** Criar componente `InboxSkeleton.tsx`
6. ⬜ Criar página `/inbox` (com botão "Carregar Mais")
7. ⬜ Garantir fallback `|| 'Aluno'` na renderização de `student_name` em NotificationItem
8. ⬜ **CRIAR:** `src/i18n/locales/pt/inbox.json` conforme seção i18n
9. ⬜ **CRIAR:** `src/i18n/locales/en/inbox.json` conforme seção i18n
10. ⬜ **ATUALIZAR:** `src/i18n/locales/pt/navigation.json` com chave `sidebar.inbox`
11. ⬜ **ATUALIZAR:** `src/i18n/locales/en/navigation.json` com chave `sidebar.inbox`

### Fase 3: Integração - ATUALIZADO

1. ⬜ Integrar NotificationBell no Layout (verificar `isProfessor` antes de renderizar)
2. ⬜ **CRÍTICO:** Adicionar rota `/inbox` no App.tsx (protegida para professores)
3. ⬜ Adicionar item "Notificações" no AppSidebar.tsx (apenas para professores)
4. ⬜ **CRÍTICO (Lacuna 20):** Implementar `useSearchParams` em `Agenda.tsx`
5. ⬜ **CRÍTICO (Lacuna 20):** Implementar `useSearchParams` em `Faturas.tsx`
6. ⬜ Implementar lógica de processamento de query params vindos do Inbox
7. ⬜ **DOCUMENTADO:** `action=amnesty` mostra toast guiando usuário (AmnestyButton usa Dialog interno)
8. ⬜ Testar fluxos completos

### Fase 4: Refinamentos (Opcional)

1. ⬜ Realtime updates (Supabase Realtime)
2. ⬜ Animações de transição
3. ⬜ ~~Skeleton loading~~ → Movido para Fase 2 (Lacuna 19)
4. ⬜ Tratamento de erros
5. ⬜ **FUTURO:** Refatorar AmnestyButton para context global (permitir abertura via URL)
6. ⬜ **FUTURO:** Triggers de criação de notificações em tempo real

---

## Fluxo Completo Validado (Atualizado)

```
[Cron 06:00 UTC]
    ↓
[Edge Function: varredura + cleanup]
    ↓ (filtra últimos 30 dias, verifica features via nome do plano, valida business_profile)
    ↓ (filtra is_experimental = false, is_template = false)
    ↓ (apenas professores com subscription_status IN ('active', 'trialing'))
    ↓ (usa status 'cancelada' não 'cancelado')
[teacher_notifications: INSERT via upsert]
    ↓
[NotificationBell: badge com contagem]
    ↓ (clique)
[/inbox: triagem Inbox/Saved/Done + paginação + InboxSkeleton]
    ↓ (clique na notificação)
[mark_notification_read + navigate]
    ↓
[/agenda ou /faturas com query params]
    ↓ (useSearchParams processa params)
[Resolução da pendência (confirmar, pagar, etc)]
    ↓ (trigger AFTER UPDATE)
[teacher_notifications: DELETE automático]
    ↓ (se item for deletado)
[trigger BEFORE DELETE: remove órfãos]
```

---

## Lacunas Adicionais Identificadas (Revisão 3)

### Lacuna 21: Coluna `class_reports` ausente em `subscription_plans.features`

**Problema:** O campo `features` da tabela `subscription_plans` não possui a chave `class_reports`, impossibilitando verificação direta via feature flag.

**Status:** Verificação via query no banco confirmou ausência da coluna.

**Solução já documentada:** Usar proxy baseado no nome do plano ('professional', 'premium') conforme Lacuna 12.

```typescript
// Edge Function - verificação via proxy
const hasReportsFeature = planSlug === 'professional' || planSlug === 'premium';
```

### Lacuna 22: Tabela `teacher_notifications` não existe

**Problema:** A tabela principal do sistema de notificações ainda não foi criada no banco de dados.

**Verificação:**
```sql
SELECT * FROM information_schema.tables 
WHERE table_name = 'teacher_notifications';
-- Resultado: 0 linhas
```

**Itens pendentes:**
- Criar tabela conforme schema documentado
- Criar todos os 5 índices de performance
- Criar RLS policies (SELECT e UPDATE)
- Criar RPCs (get_teacher_notification_counts, get_teacher_notifications, etc.)
- Criar triggers de auto-remoção

### Lacuna 23: Edge Function `generate-teacher-notifications` não existe

**Problema:** A função de varredura diária não foi criada no sistema de arquivos.

**Verificação:**
```
supabase/functions/generate-teacher-notifications/ → NÃO EXISTE
```

**Itens pendentes:**
- Criar diretório `supabase/functions/generate-teacher-notifications/`
- Criar arquivo `index.ts` com lógica de varredura
- Implementar todas as validações documentadas (is_template, is_experimental, etc.)

### Lacuna 24: Configuração ausente em `supabase/config.toml`

**Problema:** A Edge Function não está registrada no arquivo de configuração.

**Verificação:** Arquivo `supabase/config.toml` não contém seção `[functions.generate-teacher-notifications]`.

**Solução:**
```toml
# Adicionar ao supabase/config.toml
[functions.generate-teacher-notifications]
verify_jwt = false
```

### Lacuna 25: Rota `/inbox` não registrada em App.tsx

**Problema:** A rota da página de Inbox não existe no roteador da aplicação.

**Verificação:** `App.tsx` não contém referência a `/inbox` ou componente `Inbox`.

**Solução:**
```tsx
// Em App.tsx, adicionar:
import Inbox from './pages/Inbox';

// Na definição de rotas:
<Route path="/inbox" element={<Inbox />} />
```

### Lacuna 26: Diretório `src/components/Inbox/` vazio/inexistente

**Problema:** Nenhum dos componentes UI planejados foi criado.

**Verificação:**
```
src/components/Inbox/ → NÃO EXISTE
src/components/NotificationBell.tsx → NÃO EXISTE
src/pages/Inbox.tsx → NÃO EXISTE
src/hooks/useTeacherNotifications.ts → NÃO EXISTE
src/types/inbox.ts → NÃO EXISTE
src/i18n/locales/pt/inbox.json → NÃO EXISTE
src/i18n/locales/en/inbox.json → NÃO EXISTE
```

**Componentes pendentes:**
- `NotificationBell.tsx`
- `Inbox/InboxTabs.tsx`
- `Inbox/InboxFilters.tsx`
- `Inbox/NotificationList.tsx`
- `Inbox/NotificationItem.tsx`
- `Inbox/InboxEmptyState.tsx`
- `Inbox/InboxSkeleton.tsx`

---

## Status Atual da Implementação

### Progresso Geral

| Fase | Status | Progresso |
|------|--------|-----------|
| Fase 1: Infraestrutura (Backend) | ❌ Não iniciada | 0% |
| Fase 2: UI Base (Frontend) | ❌ Não iniciada | 0% |
| Fase 3: Integração | ❌ Não iniciada | 0% |
| Fase 4: Refinamentos | ❌ Não iniciada | 0% |
| **TOTAL** | **❌ Não iniciada** | **0%** |

### Itens Criados vs Pendentes

| Componente | Status |
|------------|--------|
| Tabela `teacher_notifications` | ❌ Não criada |
| RLS Policies | ❌ Não criadas |
| RPCs PostgreSQL | ❌ Não criadas |
| Triggers de auto-remoção | ❌ Não criados |
| Edge Function `generate-teacher-notifications` | ❌ Não criada |
| Configuração cron job (pg_cron) | ❌ Não configurado |
| `src/types/inbox.ts` | ❌ Não criado |
| `src/hooks/useTeacherNotifications.ts` | ❌ Não criado |
| `src/hooks/useNotificationActions.ts` | ❌ Não criado |
| `src/components/NotificationBell.tsx` | ❌ Não criado |
| `src/components/Inbox/*` (7 componentes) | ❌ Não criados |
| `src/pages/Inbox.tsx` | ❌ Não criada |
| Rota `/inbox` em `App.tsx` | ❌ Não adicionada |
| `src/i18n/locales/*/inbox.json` | ❌ Não criados |
| Deep-linking em `Agenda.tsx` | ❌ Não implementado |
| Deep-linking em `Faturas.tsx` | ❌ Não implementado |

### Bloqueadores

1. **Migração de banco de dados necessária** - Tabela e triggers precisam ser criados via migration
2. **Documentação completa** - Este documento está 100% pronto para guiar a implementação

---

## Resumo da Revisão

| Categoria | Quantidade | Status |
|-----------|------------|--------|
| Correções já aplicadas | 22 | ✅ Documentadas |
| Lacunas críticas (Revisão 1) | 4 | ⬜ Requer implementação |
| Lacunas importantes (Revisão 1) | 5 | ⬜ Requer implementação |
| Lacunas menores (Revisão 1) | 6 | ⬜/⚠️ Parcialmente documentadas |
| Lacunas adicionais (Revisão 2) | 5 | ⬜ Requer implementação |
| **Lacunas adicionais (Revisão 3)** | **6** | ⬜ Requer implementação |
| **TOTAL** | **48 itens** | **Pronto para implementação** |

### Detalhamento das Lacunas (Revisões 2 e 3)

| # | Lacuna | Severidade | Solução |
|---|--------|------------|---------|
| 16 | Validação `subscription_status` na Edge Function | Alta | Filtrar `IN ('active', 'trialing')` |
| 17 | Inconsistência status `'cancelado'` vs `'cancelada'` | Média | Padronizar para `'cancelada'` |
| 18 | Exception handling nas RPCs | Média | Adicionar bloco `EXCEPTION` |
| 19 | Componente InboxSkeleton | Baixa | Criar `InboxSkeleton.tsx` |
| 20 | Deep-linking não implementado | Alta | Implementar `useSearchParams` |
| **21** | **Coluna `class_reports` ausente em features** | **Média** | **Usar proxy via nome do plano** |
| **22** | **Tabela `teacher_notifications` não existe** | **Crítica** | **Criar via migration** |
| **23** | **Edge Function não existe no filesystem** | **Crítica** | **Criar `index.ts`** |
| **24** | **Config ausente em `config.toml`** | **Alta** | **Adicionar seção da função** |
| **25** | **Rota `/inbox` não registrada** | **Alta** | **Adicionar em `App.tsx`** |
| **26** | **Diretório `Inbox/` e componentes ausentes** | **Crítica** | **Criar todos os arquivos** |

---

## Próximos Passos Recomendados

### Ordem de Implementação

1. **Fase 1A - Banco de Dados (Migration)**
   - Criar tabela `teacher_notifications`
   - Criar índices de performance
   - Criar RLS policies
   - Criar RPCs
   - Criar triggers

2. **Fase 1B - Edge Function**
   - Criar diretório e arquivo `index.ts`
   - Adicionar configuração em `config.toml`
   - Testar varredura localmente

3. **Fase 2 - UI Frontend**
   - Criar types em `src/types/inbox.ts`
   - Criar hooks
   - Criar componentes
   - Criar página

4. **Fase 3 - Integração**
   - Adicionar rota em `App.tsx`
   - Integrar `NotificationBell` no Layout
   - Implementar deep-linking em `Agenda.tsx` e `Faturas.tsx`

5. **Fase 4 - Testes e Refinamentos**
   - Testar fluxos completos
   - Adicionar realtime (opcional)
   - Animações e polish

---

**Documento atualizado com 26 lacunas identificadas (Revisões 1, 2 e 3), status atual de implementação (0%) e próximos passos recomendados.**

**Última atualização:** Revisão 3 - Validação completa de implementação
