
# Plano: Corrigir Deep-linking de Faturas para Professores

## Problema Identificado
Quando um professor clica em uma notificação de fatura vencida no Inbox, ele é redirecionado para `/faturas` (página de alunos) em vez de `/financeiro` (página de professores). A página `/faturas` exibe "Selecione um professor para visualizar suas faturas" porque usa o `TeacherContext` que é específico para alunos.

## Solução

### 1. Corrigir a função `buildNotificationDeepLink`
**Arquivo:** `src/types/inbox.ts`

Alterar o deep-link de faturas de `/faturas` para `/financeiro`:

```typescript
if (source_type === 'invoice') {
  return `/financeiro?highlight=${source_id}`;
}
```

### 2. Adicionar suporte a deep-linking na página Financeiro
**Arquivo:** `src/pages/Financeiro.tsx`

Implementar a mesma lógica de highlight que já existe em `Faturas.tsx`:

- Adicionar import de `useSearchParams` e `useRef`
- Criar estado `highlightedInvoiceId`
- Criar ref `highlightedRowRef` para scroll
- Adicionar `useEffect` para processar parâmetro `highlight` da URL
- Adicionar `useEffect` para scroll automático quando invoice é destacada
- Aplicar classes de highlight na `TableRow` (ring-2, animate-pulse, bg-primary/5)

### 3. Adicionar utilitário `cn` para classes condicionais
**Arquivo:** `src/pages/Financeiro.tsx`

Importar `cn` de `@/lib/utils` para aplicar classes CSS condicionais.

## Resumo Técnico

| Mudança | Arquivo | Descrição |
|---------|---------|-----------|
| Deep-link | `src/types/inbox.ts` | Alterar rota de `/faturas` para `/financeiro` |
| URL params | `src/pages/Financeiro.tsx` | Adicionar `useSearchParams` |
| Highlight state | `src/pages/Financeiro.tsx` | Estado e ref para controlar destaque |
| Scroll + Animação | `src/pages/Financeiro.tsx` | useEffect para scroll e pulse animation |
| Styling | `src/pages/Financeiro.tsx` | Aplicar `ring-2 ring-primary animate-pulse bg-primary/5` na row |

## Resultado Esperado
Ao clicar em uma notificação de fatura vencida no Inbox, o professor será redirecionado para `/financeiro?highlight=<invoice_id>` e a fatura correspondente será destacada com scroll automático e animação visual.
