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
│   └── useInboxCounts.ts
├── types/
│   └── inbox.ts
├── pages/
│   └── Inbox.tsx
└── i18n/locales/
    ├── pt/inbox.json
    └── en/inbox.json
```

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

// Item individual do inbox
export interface InboxItem {
  id: string;
  category: InboxCategory;
  title: string;
  subtitle: string;
  date: string;
  urgency: UrgencyLevel;
  metadata: Record<string, unknown>;
}

// Props do hook
export interface UseInboxCountsReturn {
  counts: InboxCounts | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Mapeamento de categoria para configuração visual
export const INBOX_CATEGORY_CONFIG: Record<InboxCategory, {
  icon: string;
  urgency: UrgencyLevel;
  colorClass: string;
}> = {
  pending_past_classes: {
    icon: 'Clock',
    urgency: 'high',
    colorClass: 'text-destructive',
  },
  amnesty_eligible: {
    icon: 'Gift',
    urgency: 'medium',
    colorClass: 'text-warning',
  },
  overdue_invoices: {
    icon: 'AlertCircle',
    urgency: 'high',
    colorClass: 'text-destructive',
  },
  pending_reports: {
    icon: 'FileText',
    urgency: 'low',
    colorClass: 'text-primary',
  },
};
```

---

## Categorias de Ações

| Categoria | Descrição | Urgência | Ação Principal |
|-----------|-----------|----------|----------------|
| Aulas Passadas | Aulas com status 'pendente' e data < hoje | 🔴 Alta | Marcar Concluída |
| Anistias Pendentes | Cancelamentos com cobrança (últimos 30 dias) | 🟡 Média | Conceder Anistia |
| Faturas Atrasadas | Invoices com status 'atrasada' | 🔴 Alta | Ver Fatura |
| Relatórios Pendentes | Aulas concluídas sem class_report | 🔵 Baixa | Criar Relatório |

---

## Fases de Implementação

### Fase 1: MVP (Fundação)

#### Tarefa 1.0: Função RPC PostgreSQL

**Migração SQL:**

```sql
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
  -- Aulas passadas pendentes
  SELECT COUNT(*) INTO v_pending_past_classes
  FROM classes
  WHERE teacher_id = p_teacher_id
    AND status = 'pendente'
    AND class_date < NOW();

  -- Cancelamentos elegíveis para anistia (últimos 30 dias)
  SELECT COUNT(*) INTO v_amnesty_eligible
  FROM classes
  WHERE teacher_id = p_teacher_id
    AND status = 'cancelada'
    AND charge_applied = true
    AND amnesty_granted = false
    AND cancelled_at >= NOW() - INTERVAL '30 days';

  -- Faturas atrasadas
  SELECT COUNT(*) INTO v_overdue_invoices
  FROM invoices
  WHERE teacher_id = p_teacher_id
    AND status = 'atrasada';

  -- Aulas concluídas sem relatório (últimas 50)
  SELECT COUNT(*) INTO v_pending_reports
  FROM classes c
  LEFT JOIN class_reports cr ON cr.class_id = c.id
  WHERE c.teacher_id = p_teacher_id
    AND c.status = 'concluida'
    AND cr.id IS NULL
    AND c.class_date >= NOW() - INTERVAL '30 days';

  RETURN json_build_object(
    'pending_past_classes', v_pending_past_classes,
    'amnesty_eligible', v_amnesty_eligible,
    'overdue_invoices', v_overdue_invoices,
    'pending_reports', v_pending_reports,
    'total', v_pending_past_classes + v_amnesty_eligible + v_overdue_invoices + v_pending_reports
  );
END;
$$;
```

#### Tarefa 1.1: Hook useInboxCounts

**Arquivo:** `src/hooks/useInboxCounts.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import type { InboxCounts, UseInboxCountsReturn } from '@/types/inbox';

export function useInboxCounts(): UseInboxCountsReturn {
  const { profile } = useProfile();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inbox-counts', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_teacher_inbox_counts', { p_teacher_id: profile?.id });
      
      if (error) throw error;
      return data as InboxCounts;
    },
    enabled: !!profile?.id,
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
```

#### Tarefa 1.2: Componente NotificationBell com Popover

**Arquivo:** `src/components/NotificationBell.tsx`

- Ícone `Bell` do Lucide React
- Badge circular vermelho posicionado no canto superior direito
- Mostrar "99+" quando total > 99
- **Popover** no hover/click com:
  - Preview das 3 categorias mais urgentes
  - Contagem por categoria
  - Link "Ver todas →" para `/inbox`
- Clique no link navega para `/inbox`

#### Tarefa 1.3: Integração no Header

**Arquivo:** `src/components/Layout.tsx`

- Adicionar `NotificationBell` à direita do header
- Renderizar apenas para professores (`isProfessor`)
- Posicionar antes do menu de usuário/logout

#### Tarefa 1.4: Página Inbox

**Arquivo:** `src/pages/Inbox.tsx`

Estrutura:

1. **Header**: Título + subtítulo com total + botão refresh
2. **Summary Cards**: Grid 2x2 (mobile) ou 4 colunas (desktop)
3. **Action List**: Seções colapsáveis por categoria
4. **Empty State**: Componente dedicado `InboxEmptyState`

#### Tarefa 1.5: Componentes da Lista

**Arquivos:** `src/components/Inbox/*.tsx`

- `InboxSummaryCards`: Cards com ícone, contagem e cor por urgência
- `InboxActionList`: Lista com Accordion por categoria
- `InboxActionItem`: Card com dados + ações inline
- `InboxEmptyState`: Ilustração positiva "Tudo em dia! 🎉"

#### Tarefa 1.6: Rota no App.tsx

```tsx
<Route path="/inbox" element={<Inbox />} />
```

#### Tarefa 1.7: Traduções i18n

**Arquivos:** `src/i18n/locales/{pt,en}/inbox.json`

---

### Fase 2: Ações e Refinamentos

#### Tarefa 2.1: Confirmar Aula em Lote

- Checkbox para seleção múltipla
- Botão "Confirmar Selecionadas"
- Progress durante processamento

#### Tarefa 2.2: Integrar AmnestyButton

- Reutilizar componente existente
- Invalidar cache após sucesso
- Feedback visual de conclusão

#### Tarefa 2.3: Realtime Updates

- Supabase Realtime nas tabelas `classes` e `invoices`
- Atualizar badge automaticamente
- Toast opcional para novas pendências

#### Tarefa 2.4: Estado "Ignorar"

- Permitir professor dispensar item sem resolver
- Armazenar em `localStorage` ou tabela `inbox_dismissed`
- Opção para "Mostrar ignorados"

---

### Fase 3: Extensões Futuras

- **Alunos Inativos**: Sem aulas nos últimos 30 dias
- **Mensalidades Vencendo**: Subscriptions próximas do fim
- **Perfil Incompleto**: Configurações faltando (Stripe, etc.)
- **Materiais Pendentes**: Aulas sem material compartilhado
- **Aulas em Grupo**: Aulas com alunos faltando confirmação

---

## Queries de Banco de Dados

> **Nota:** As queries individuais abaixo são para referência. Em produção, usar a RPC `get_teacher_inbox_counts` para performance.

### Aulas Passadas Pendentes

```sql
SELECT id, class_date, student_id, service_id
FROM classes
WHERE teacher_id = $1
  AND status = 'pendente'
  AND class_date < NOW()
ORDER BY class_date ASC;
```

### Cancelamentos Elegíveis para Anistia (30 dias)

```sql
SELECT id, class_date, student_id, cancelled_at, cancellation_reason
FROM classes
WHERE teacher_id = $1
  AND status = 'cancelada'
  AND charge_applied = true
  AND amnesty_granted = false
  AND cancelled_at >= NOW() - INTERVAL '30 days'
ORDER BY cancelled_at DESC;
```

### Faturas Atrasadas

```sql
SELECT id, student_id, amount, due_date
FROM invoices
WHERE teacher_id = $1
  AND status = 'atrasada'
ORDER BY due_date ASC;
```

### Aulas sem Relatório (30 dias)

```sql
SELECT c.id, c.class_date, c.student_id
FROM classes c
LEFT JOIN class_reports cr ON cr.class_id = c.id
WHERE c.teacher_id = $1
  AND c.status = 'concluida'
  AND cr.id IS NULL
  AND c.class_date >= NOW() - INTERVAL '30 days'
ORDER BY c.class_date DESC
LIMIT 50;
```

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

### Cores por Urgência

- 🔴 Vermelho (`destructive`): Alta urgência
- 🟡 Amarelo (`warning`): Média urgência
- 🔵 Azul (`primary`): Baixa urgência
- ⚫ Cinza (`muted`): Informativo

---

## Critérios de Aceitação

### Fase 1 (MVP)

- [ ] RPC `get_teacher_inbox_counts` criada e funcionando
- [ ] Sino aparece no header para professores
- [ ] Badge mostra contagem total correta
- [ ] Popover preview mostra categorias urgentes
- [ ] Clique no sino navega para /inbox
- [ ] Página lista todas as categorias de pendências
- [ ] Ações inline funcionam (confirmar, anistiar, etc.)
- [ ] Estado vazio exibido quando não há pendências
- [ ] Traduções PT/EN completas

### Fase 2

- [ ] Seleção múltipla funciona
- [ ] Atualizações em tempo real
- [ ] Estado "Ignorar" implementado

---

## Dependências

- `lucide-react` (já instalado) - ícone Bell
- `@tanstack/react-query` (já instalado) - cache e fetch
- `shadcn/ui` (já instalado) - componentes UI
- Componente `AmnestyButton` existente para reutilização

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Queries lentas com muitos dados | Média | Alto | RPC única, índices, cache agressivo |
| Conflito com outras features | Baixa | Médio | Componentes isolados, hooks independentes |
| UX confusa com muitas categorias | Média | Médio | Priorização visual, collapse de categorias |
| Notificações obsoletas | Baixa | Baixo | Polling + invalidação após ações |
