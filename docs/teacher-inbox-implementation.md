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
  source_type TEXT NOT NULL CHECK (source_type IN ('class', 'invoice', 'class_report')),
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

-- Insert/Delete será feito via triggers ou RPCs com SECURITY DEFINER
CREATE POLICY "System can manage notifications"
ON teacher_notifications FOR ALL
USING (true)
WITH CHECK (true);
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
export type NotificationSourceType = 'class' | 'invoice' | 'class_report';

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
            'subtitle', to_char(c.class_date AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
            'student_name', COALESCE(tsr.student_name, p.name, 'Aluno'),
            'dependent_name', dep.name,
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
              'cancellation_reason', c.cancellation_reason,
              'charge_amount', COALESCE(cs.cancellation_fee, 0)
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
          LIMIT 1
        )
        WHEN 'invoice' THEN (
          SELECT json_build_object(
            'title', 'Fatura atrasada',
            'subtitle', 'R$ ' || i.amount::text || ' - Vencida há ' || 
              EXTRACT(DAY FROM NOW() - i.due_date)::int || ' dias',
            'student_name', COALESCE(tsr.student_name, p.name, 'Aluno'),
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

**Arquivo:** `supabase/functions/generate-teacher-notifications/index.ts`

Esta função roda via cron job 1x/dia e:

1. Varre aulas pendentes passadas → cria notificações `pending_past_classes`
2. Varre cancelamentos com cobrança → cria notificações `amnesty_eligible`
3. Varre faturas atrasadas → cria notificações `overdue_invoices`
4. Varre aulas concluídas sem relatório → cria notificações `pending_reports`

```typescript
// Pseudocódigo
async function generateNotifications() {
  // 1. Aulas pendentes passadas
  const pendingClasses = await supabase
    .from('classes')
    .select('id, teacher_id')
    .eq('status', 'pendente')
    .lt('class_date', new Date().toISOString())
    .eq('is_experimental', false);
  
  for (const cls of pendingClasses) {
    await supabase
      .from('teacher_notifications')
      .upsert({
        teacher_id: cls.teacher_id,
        source_type: 'class',
        source_id: cls.id,
        category: 'pending_past_classes',
      }, { onConflict: 'teacher_id,source_type,source_id,category' });
  }
  
  // ... similar para outras categorias
}
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

-- Remove notificação quando fatura é paga
CREATE OR REPLACE FUNCTION remove_notification_on_invoice_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('pago', 'cancelado') 
     AND OLD.status IN ('pendente', 'overdue') THEN
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

## Hooks React

### Hook: useTeacherNotifications

**Arquivo:** `src/hooks/useTeacherNotifications.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTeacherContext } from '@/contexts/TeacherContext';
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
  const { selectedTeacher } = useTeacherContext();
  const teacherId = selectedTeacher?.id;
  
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
  const { selectedTeacher } = useTeacherContext();
  const teacherId = selectedTeacher?.id;
  
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
import { useTeacherContext } from '@/contexts/TeacherContext';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function useNotificationActions() {
  const { t } = useTranslation('inbox');
  const { selectedTeacher } = useTeacherContext();
  const queryClient = useQueryClient();

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

```tsx
// Em Layout.tsx, adicionar no header (ao lado do ThemeToggle):
import { NotificationBell } from '@/components/NotificationBell';
import { useAuth } from '@/hooks/useAuth';

// Dentro do header, para professores:
const { isProfessor } = useAuth();

{isProfessor && <NotificationBell />}
```

### App.tsx - Rota /inbox

```tsx
// Adicionar rota:
import Inbox from '@/pages/Inbox';

<Route path="/inbox" element={<Inbox />} />
```

### AppSidebar.tsx - Link (Opcional)

```tsx
// Adicionar item no menu:
{
  title: t('navigation.inbox'),
  url: '/inbox',
  icon: Bell,
}
```

---

## Pré-requisitos

### Páginas de Destino

As páginas que recebem navegação do Inbox devem suportar query params:

#### /agenda
- `?date=YYYY-MM-DD` - Data a ser exibida
- `?classId=UUID` - Aula a ser destacada/aberta
- `?action=report` - Abrir modal de relatório
- `?action=amnesty` - Abrir modal de anistia

#### /faturas
- `?highlight=UUID` - Fatura a ser destacada

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
| Queries lentas com muitos dados | Índices + LIMIT + paginação |
| Notificações órfãs (item excluído) | Triggers de auto-remoção |
| Concorrência (2 abas) | React Query invalidation |
| Confusão UX (Done ≠ Resolvido) | Messaging claro na UI |
