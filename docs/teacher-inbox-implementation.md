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
- Badge com `role="status"` e `aria-label="X pendências"`

### Cores por Urgência

- 🔴 Vermelho (`destructive`): Alta urgência
- 🟡 Amarelo (`warning`): Média urgência
- 🔵 Azul (`primary`): Baixa urgência
- ⚫ Cinza (`muted`): Informativo

---

## Hierarquia Visual por Urgência

Para diferenciar visualmente os níveis de urgência, cada `InboxActionItem` deve aplicar estilos distintos:

```tsx
// Configuração de estilos por urgência
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
- **Atualização do contador**: Badge decrementa com transição suave

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

### Implementação

```tsx
// NotificationBell.tsx
const isMobile = useIsMobile();
const navigate = useNavigate();

const handleClick = () => {
  if (isMobile) {
    navigate('/inbox');
  }
  // Desktop: Popover abre via onOpenChange
};

return (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={handleClick}
        aria-label={`${counts?.total || 0} pendências`}
      >
        <Bell className="h-5 w-5" />
        {counts?.total > 0 && (
          <Badge 
            className="absolute -top-1 -right-1 h-5 min-w-5 px-1"
            role="status"
          >
            {counts.total > 99 ? '99+' : counts.total}
          </Badge>
        )}
      </Button>
    </PopoverTrigger>
    
    {!isMobile && (
      <PopoverContent>
        {/* Preview das categorias */}
      </PopoverContent>
    )}
  </Popover>
);
```

---

## Empty State Elaborado

O componente `InboxEmptyState` deve transmitir uma sensação positiva de "missão cumprida":

```tsx
// InboxEmptyState.tsx
<div className="flex flex-col items-center justify-center py-16 px-4 text-center">
  {/* Ilustração vetorial ou emoji grande */}
  <div className="text-6xl mb-6">🎉</div>
  
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
  
  {/* Timestamp opcional */}
  <p className="text-xs text-muted-foreground mt-8">
    {t('inbox.emptyState.lastChecked', { time: formatRelative(lastCheck) })}
  </p>
</div>
```

### Traduções

```json
// pt/inbox.json
{
  "emptyState": {
    "title": "Tudo em dia!",
    "description": "Você não tem nenhuma pendência no momento. Continue assim!",
    "cta": "Ver agenda",
    "lastChecked": "Última verificação: {{time}}"
  }
}
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
    description: t('inbox.itemIgnored'),
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

## Critérios de Aceitação

### Fase 1 (MVP)

- [ ] RPC `get_teacher_inbox_counts` criada e funcionando
- [ ] Sino aparece no header para professores
- [ ] Badge mostra contagem total correta com `role="status"`
- [ ] **Desktop**: Popover preview mostra categorias urgentes no hover
- [ ] **Mobile**: Touch no sino navega diretamente para `/inbox`
- [ ] Clique no link "Ver todas" navega para `/inbox`
- [ ] Página lista todas as categorias de pendências
- [ ] Hierarquia visual por urgência (bordas coloridas, backgrounds)
- [ ] Ações inline funcionam (confirmar, anistiar, etc.)
- [ ] Micro-interações de feedback (animações, toasts)
- [ ] Empty State elaborado com ilustração e CTA
- [ ] Skeleton loading nos cards e lista
- [ ] Traduções PT/EN completas

### Fase 2

- [ ] Seleção múltipla funciona
- [ ] Atualizações em tempo real
- [ ] Estado "Ignorar" com Undo implementado
- [ ] Seção "Ignorados" colapsável

---

## Dependências

- `lucide-react` (já instalado) - ícone Bell
- `@tanstack/react-query` (já instalado) - cache e fetch
- `shadcn/ui` (já instalado) - componentes UI
- Componente `AmnestyButton` existente para reutilização
- Hook `useIsMobile` existente para detecção de dispositivo

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Queries lentas com muitos dados | Média | Alto | RPC única, índices, cache agressivo |
| Conflito com outras features | Baixa | Médio | Componentes isolados, hooks independentes |
| UX confusa com muitas categorias | Média | Médio | Priorização visual, collapse de categorias |
| Notificações obsoletas | Baixa | Baixo | Polling + invalidação após ações |
| Popover ruim em mobile | Baixa | Médio | Navegação direta para /inbox no mobile |
