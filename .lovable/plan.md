

# Otimizacao: Agendamento de aulas pre-pagas lento

## Problema

O agendamento de aulas pre-pagas esta lento porque o fluxo faz operacoes sequenciais desnecessarias:

1. **Query duplicada**: `business_profiles` e consultado **duas vezes** - uma na linha 1440 para determinar o status inicial, e outra na linha 1547 para gerar faturas. A mesma informacao.
2. **Faturas sequenciais**: Para aulas em grupo, `create-invoice` e chamado **sequencialmente** em um `for` loop (linha 1563). Cada chamada a uma Edge Function leva ~1-3s (cold start, auth, Stripe). Com 3 alunos, sao 3-9 segundos extras.
3. **Bloqueio do modal**: O modal so fecha apos **todas** as faturas serem geradas, pois o `await` esta dentro do fluxo principal.

## Correcao

### `src/pages/Agenda.tsx` - funcao `handleClassSubmit`

3 otimizacoes:

**1. Eliminar query duplicada de `business_profiles`**

Reutilizar o resultado da primeira query (linha 1440) na segunda verificacao (linha 1547), evitando uma ida ao banco desnecessaria.

**2. Paralelizar chamadas de `create-invoice`**

Substituir o `for` sequencial por `Promise.allSettled()` para invocar todas as faturas simultaneamente:

```typescript
// ANTES (sequencial):
for (const participant of participantsToInsert) {
  const { data, error } = await supabase.functions.invoke('create-invoice', { ... });
}

// DEPOIS (paralelo):
const invoicePromises = participantsToInsert.map(participant =>
  supabase.functions.invoke('create-invoice', { body: { ... } })
);
const results = await Promise.allSettled(invoicePromises);
```

**3. Desbloquear o modal (fire-and-forget para faturas)**

Mover a geracao de faturas pre-pagas para depois do fechamento do modal. A aula ja foi criada com status `aguardando_pagamento` - a fatura pode ser gerada em background sem bloquear a UI. Se falhar, o toast de aviso aparece normalmente.

```text
Fluxo atual:
  Criar aula -> Inserir participantes -> [Gerar faturas sequenciais] -> Fechar modal

Fluxo otimizado:
  Criar aula -> Inserir participantes -> Fechar modal -> [Gerar faturas em paralelo, background]
```

## Impacto estimado

| Cenario | Antes | Depois |
|---------|-------|--------|
| 1 aluno, prepaid | ~3-4s | ~1s (modal fecha imediatamente) |
| 3 alunos, grupo prepaid | ~7-12s | ~1s (modal fecha, faturas em background) |
| Aula postpaid | sem mudanca | sem mudanca |

## Arquivo impactado

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Agenda.tsx` | Eliminar query duplicada, paralelizar faturas, fire-and-forget |

