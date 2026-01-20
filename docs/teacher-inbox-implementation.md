# Central de Ações do Professor (Teacher Inbox)

## Visão Geral

A Central de Ações é uma funcionalidade que centraliza todas as tarefas pendentes do professor em um único lugar, com um ícone de sino no header mostrando um badge com a contagem total de ações requeridas.

### Problema que Resolve

- Aulas passadas ficam sem confirmação indefinidamente
- Cancelamentos elegíveis para anistia não têm visibilidade
- Professor precisa navegar por múltiplas telas para encontrar pendências
- Faturas atrasadas e relatórios pendentes passam despercebidos

### Solução

- Ícone de sino (🔔) no header com badge de contagem
- Página dedicada `/inbox` com lista agrupada de ações
- Ações inline para resolver pendências rapidamente

---

## Arquitetura

### Estrutura de Componentes

```
Header (Layout.tsx)
    └── NotificationBell
            └── Badge com contagem total
            └── Clique navega para /inbox
            
/inbox (InboxPage)
    └── InboxSummaryCards (grid de contadores)
    └── InboxActionList (lista agrupada por categoria)
            └── InboxActionItem (item com ações inline)
```

### Estrutura de Arquivos

```
src/
├── components/
│   ├── NotificationBell.tsx
│   └── Inbox/
│       ├── InboxSummaryCards.tsx
│       ├── InboxActionList.tsx
│       └── InboxActionItem.tsx
├── hooks/
│   └── useInboxCounts.ts
├── pages/
│   └── Inbox.tsx
└── i18n/locales/
    ├── pt/inbox.json
    └── en/inbox.json
```

---

## Categorias de Ações

| Categoria | Descrição | Urgência | Ação Principal |
|-----------|-----------|----------|----------------|
| Aulas Passadas | Aulas com status 'pendente' e data < hoje | 🔴 Alta | Marcar Concluída |
| Anistias Pendentes | Cancelamentos com cobrança aplicada sem anistia | 🟡 Média | Conceder Anistia |
| Faturas Atrasadas | Invoices com status 'atrasada' | 🔴 Alta | Ver Fatura |
| Relatórios Pendentes | Aulas concluídas sem class_report | 🔵 Baixa | Criar Relatório |

---

## Fases de Implementação

### Fase 1: MVP (Fundação)

#### Tarefa 1.1: Hook useInboxCounts

**Arquivo:** `src/hooks/useInboxCounts.ts`

```typescript
interface InboxCounts {
  pendingPastClasses: number;
  amnestyEligible: number;
  overdueInvoices: number;
  pendingReports: number;
  total: number;
  isLoading: boolean;
  refetch: () => void;
}
```

- Usar `react-query` com `staleTime: 5 * 60 * 1000` (5 minutos)
- Queries separadas por categoria para flexibilidade
- Retornar contagens + total calculado

#### Tarefa 1.2: Componente NotificationBell

**Arquivo:** `src/components/NotificationBell.tsx`

- Ícone `Bell` do Lucide React
- Badge circular vermelho posicionado no canto superior direito
- Mostrar "99+" quando total > 99
- Tooltip com breakdown por categoria
- Clique navega para `/inbox`

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
4. **Empty State**: Ilustração quando não há pendências

#### Tarefa 1.5: Componentes da Lista

**Arquivos:** `src/components/Inbox/*.tsx`

- `InboxSummaryCards`: Cards com ícone, contagem e cor por urgência
- `InboxActionList`: Lista com Accordion por categoria
- `InboxActionItem`: Card com dados + ações inline

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

#### Tarefa 2.3: Quick Actions no Dropdown

- Hover no sino mostra preview
- 3 ações mais urgentes
- Link "Ver todas →"

#### Tarefa 2.4: Realtime Updates

- Supabase Realtime nas tabelas `classes` e `invoices`
- Atualizar badge automaticamente
- Toast opcional para novas pendências

---

### Fase 3: Extensões Futuras

- **Alunos Inativos**: Sem aulas nos últimos 30 dias
- **Mensalidades Vencendo**: Subscriptions próximas do fim
- **Perfil Incompleto**: Configurações faltando (Stripe, etc.)
- **Materiais Pendentes**: Aulas sem material compartilhado

---

## Queries de Banco de Dados

### Aulas Passadas Pendentes

```sql
SELECT id, class_date, student_id, service_id
FROM classes
WHERE teacher_id = $1
  AND status = 'pendente'
  AND class_date < NOW()
ORDER BY class_date ASC;
```

### Cancelamentos Elegíveis para Anistia

```sql
SELECT id, class_date, student_id, cancelled_at, cancellation_reason
FROM classes
WHERE teacher_id = $1
  AND status = 'cancelada'
  AND charge_applied = true
  AND amnesty_granted = false
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

### Aulas sem Relatório

```sql
SELECT c.id, c.class_date, c.student_id
FROM classes c
LEFT JOIN class_reports cr ON cr.class_id = c.id
WHERE c.teacher_id = $1
  AND c.status = 'concluida'
  AND cr.id IS NULL
ORDER BY c.class_date DESC
LIMIT 50;
```

---

## Considerações de UX

### Estados

- **Loading**: Skeleton nos cards e lista
- **Empty**: Ilustração positiva "Tudo em dia! 🎉"
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

- [ ] Sino aparece no header para professores
- [ ] Badge mostra contagem total correta
- [ ] Clique no sino navega para /inbox
- [ ] Página lista todas as categorias de pendências
- [ ] Ações inline funcionam (confirmar, anistiar, etc.)
- [ ] Estado vazio exibido quando não há pendências
- [ ] Traduções PT/EN completas

### Fase 2

- [ ] Seleção múltipla funciona
- [ ] Dropdown preview no hover
- [ ] Atualizações em tempo real

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
| Queries lentas com muitos dados | Média | Alto | Paginação, índices, cache agressivo |
| Conflito com outras features | Baixa | Médio | Componentes isolados, hooks independentes |
| UX confusa com muitas categorias | Média | Médio | Priorização visual, collapse de categorias |
