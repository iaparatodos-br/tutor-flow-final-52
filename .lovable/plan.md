
# Diagnóstico Completo: Status "Aguardando Pagamento" não aparece para o Professor

## O Que Foi Encontrado

A análise cobriu 3 camadas: banco de dados (RPC), lógica de negócio (Agenda.tsx) e componente visual (SimpleCalendar.tsx).

### Para o Professor — Problema único e isolado

A RPC `get_classes_with_participants` retorna o campo `status` diretamente de `c.status` da tabela `classes`. Isso significa que os dados chegam corretos do banco de dados. O professor **não tem** nenhum filtro de status como o aluno tem. O problema está 100% no componente `SimpleCalendar.tsx`.

**Causa raiz (linha 202-205 do SimpleCalendar.tsx):**

```typescript
// ❌ ERRO: Side effect dentro de useMemo — violação das regras do React
const calendarData = useMemo(() => {
  // ...
  if (onVisibleRangeChange) {
    onVisibleRangeChange(startDate, endDate);  // ← chama setState no pai durante render
  }
  // ...
}, [currentDate, classes, availabilityBlocks]);  // ← classes está na dep!
```

O `useMemo` tem `classes` como dependência. Isso cria o loop:

```text
1. Professor confirma aula → status muda para 'aguardando_pagamento'
2. loadClasses() busca dados → setClasses(dadosNovos) atualiza o estado
3. SimpleCalendar re-renderiza com novo 'classes' 
4. useMemo executa (porque 'classes' mudou) → onVisibleRangeChange() chamado
5. Agenda.tsx executa setVisibleRange() → debouncedLoadClasses() agendado
6. Nova busca ao banco começa assincronamente
7. UI pode "piscar" entre o estado correto e um re-fetch
```

O resultado é que a UI nunca se estabiliza no estado correto após uma confirmação, pois qualquer mudança em `classes` reativa o `useMemo` que dispara outra busca ao banco.

### Para o Aluno — 3 problemas em camadas

**Problema A - Filtro de status em Agenda.tsx (linha 1021):**
```typescript
// ❌ 'aguardando_pagamento' não está incluído
return ['pendente', 'confirmada', 'concluida', 'cancelada'].includes(myStatus);
```
Aulas com status `aguardando_pagamento` são descartadas do array antes mesmo de chegar ao calendário.

**Problema B - Mesma omissão na linha 1025 (fallback):**
```typescript
return myParticipation && ['pendente', 'confirmada', 'concluida', 'cancelada'].includes(myParticipation.status || cls.status);
```

**Problema C - RLS Policy no banco:**
A policy `alunos_veem_participacoes_ativas` na tabela `class_participants` não inclui `aguardando_pagamento`, tornando essas linhas invisíveis para o aluno no nível do banco de dados.

---

## Solução Completa

### Fix 1 — SimpleCalendar.tsx: Mover onVisibleRangeChange para useEffect

**Arquivo:** `src/components/Calendar/SimpleCalendar.tsx`

Remover as linhas 202-205 do `useMemo` e adicionar um `useEffect` dedicado logo após:

```typescript
// REMOVER do useMemo (linhas 202-205):
// Notify parent about visible range change
if (onVisibleRangeChange) {
  onVisibleRangeChange(startDate, endDate);
}

// ADICIONAR: useEffect separado após o bloco do useMemo
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

**Por que isso resolve para o professor:** O `useEffect` com `[currentDate, onVisibleRangeChange]` como dependências só dispara quando o usuário navega de mês. Não é mais acionado quando `classes` muda, quebrando o loop de re-fetch que impedia a UI de refletir o novo status.

### Fix 2 — Agenda.tsx: Adicionar status ao filtro de alunos

**Arquivo:** `src/pages/Agenda.tsx`

Linha 1021 e linha 1025 — adicionar `'aguardando_pagamento'` aos arrays de filtro:

```typescript
// Linha 1021 - ANTES:
return ['pendente', 'confirmada', 'concluida', 'cancelada'].includes(myStatus);

// Linha 1021 - DEPOIS:
return ['pendente', 'confirmada', 'concluida', 'cancelada', 'aguardando_pagamento'].includes(myStatus);

// Linha 1025 - ANTES:
return myParticipation && ['pendente', 'confirmada', 'concluida', 'cancelada'].includes(myParticipation.status || cls.status);

// Linha 1025 - DEPOIS:
return myParticipation && ['pendente', 'confirmada', 'concluida', 'cancelada', 'aguardando_pagamento'].includes(myParticipation.status || cls.status);
```

### Fix 3 — Migration SQL: Atualizar RLS Policy para alunos

A policy `alunos_veem_participacoes_ativas` precisa incluir `aguardando_pagamento` para que o aluno consiga buscar essas participações do banco. Sem isso, mesmo com o Fix 2, os dados nunca chegam do servidor.

```sql
DROP POLICY IF EXISTS "alunos_veem_participacoes_ativas" ON public.class_participants;

CREATE POLICY "alunos_veem_participacoes_ativas"
ON public.class_participants
FOR SELECT
USING (
  student_id = auth.uid()
  AND status = ANY (ARRAY[
    'pendente'::text,
    'confirmada'::text,
    'concluida'::text,
    'cancelada'::text,
    'aguardando_pagamento'::text
  ])
);
```

---

## Resumo de Impacto por Perfil

| Fix | Beneficia Professor | Beneficia Aluno |
|---|---|---|
| Fix 1 — SimpleCalendar.tsx useEffect | Sim — resolve o loop de re-fetch | Sim — comportamento mais estável |
| Fix 2 — Filtro Agenda.tsx | Não — professor não tem esse filtro | Sim — aulas não são mais descartadas |
| Fix 3 — RLS Policy SQL | Não — professor usa RPC com SECURITY DEFINER | Sim — dados chegam do banco |

## Arquivos a Modificar

| Arquivo | Tipo | Linhas Afetadas |
|---|---|---|
| `src/components/Calendar/SimpleCalendar.tsx` | Frontend | 202-205 (remover do useMemo) + novo useEffect |
| `src/pages/Agenda.tsx` | Frontend | 1021 e 1025 |
| Migration SQL | Banco de dados | Policy `alunos_veem_participacoes_ativas` |
