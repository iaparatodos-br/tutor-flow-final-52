
# Correção: Calendário não Atualiza após Confirmação de Aula

## Causa Raiz Identificada

O problema tem **duas causas encadeadas**:

### Causa 1 — Side effect dentro de `useMemo` (violação do React)
No arquivo `src/components/Calendar/SimpleCalendar.tsx`, dentro do `useMemo` que calcula os dias do calendário (linha 203), há uma chamada direta a `onVisibleRangeChange(startDate, endDate)`:

```typescript
// ❌ ERRADO: Side effect dentro de useMemo
const calendarData = useMemo(() => {
  // ...
  if (onVisibleRangeChange) {
    onVisibleRangeChange(startDate, endDate); // ← PROBLEMA: chama setState do pai durante render
  }
  // ...
}, [currentDate, classes, availabilityBlocks]);
```

O `useMemo` executa durante a fase de renderização do React. Chamar uma função que dispara `setState` no componente pai (`Agenda.tsx`) durante o render de um filho é uma violação das regras do React — daí o warning no console: *"Cannot update a component (Agenda) while rendering a different component (SimpleCalendar)"*.

### Causa 2 — Loop de atualização após confirmação
O efeito cascata quando o professor confirma uma aula:

```text
handleConfirmClass() → loadClasses() → setClasses() → [novo render com classes atualizado]
  → SimpleCalendar re-renderiza → useMemo roda → onVisibleRangeChange() chamado
  → setVisibleRange() no Agenda.tsx → debouncedLoadClasses() é agendado
  → Uma nova busca no banco sobrescreve o estado (às vezes com dados desatualizados)
```

Isso explica por que o toast "Aula confirmada!" aparece corretamente (a operação no banco funcionou), mas o calendário não reflete a mudança — uma segunda busca ao banco pode ser retornando os dados antes da atualização se houver qualquer latência, ou o ciclo de re-render impede a UI de se estabilizar.

---

## Solução

Mover o `onVisibleRangeChange` do `useMemo` para um `useEffect` dedicado no `SimpleCalendar.tsx`. Assim, a notificação ao pai ocorre **após** o render, não durante, seguindo as regras do React.

### Arquivo: `src/components/Calendar/SimpleCalendar.tsx`

**Passo 1** — Remover a chamada de `onVisibleRangeChange` de dentro do `useMemo`:

```typescript
// ANTES (com o bug):
const calendarData = useMemo(() => {
  // ...
  if (onVisibleRangeChange) {
    onVisibleRangeChange(startDate, endDate); // ← REMOVER
  }
  const days = [];
  // ...
  return days;
}, [currentDate, classes, availabilityBlocks]);
```

```typescript
// DEPOIS (correto):
const calendarData = useMemo(() => {
  // ...
  const days = [];
  // ...
  return days;
  // Sem nenhum side effect aqui
}, [currentDate, classes, availabilityBlocks]);
```

**Passo 2** — Criar um `useEffect` dedicado para calcular e notificar o range visível, que roda **após** o render:

```typescript
// useEffect separado e correto para notificar o range visível
useEffect(() => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const startDate = new Date(firstDayOfMonth);
  startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay());
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 41);

  if (onVisibleRangeChange) {
    onVisibleRangeChange(startDate, endDate);
  }
}, [currentDate, onVisibleRangeChange]);
```

Isso resolve ambos os problemas:
- O side effect agora ocorre no lugar correto (pós-render)
- Não haverá mais loops quando `classes` mudar (o effect só roda quando `currentDate` muda, não quando `classes` muda)

---

## Arquivos Afetados

| Arquivo | Alteração |
|---|---|
| `src/components/Calendar/SimpleCalendar.tsx` | Mover `onVisibleRangeChange` do `useMemo` para um `useEffect` dedicado |

## Impacto

- Correção do warning do React no console
- O calendário passará a refletir imediatamente o novo status após a confirmação
- Nenhuma mudança no comportamento de navegação entre meses (o `useEffect` com `currentDate` garante que o pai ainda é notificado quando o mês muda)
