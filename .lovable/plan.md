

# Corrigir Ordenação das Faturas na Lista Financeira

## Problema

A query de faturas em `src/pages/Financeiro.tsx` (linha 274) ordena por `due_date` (data de vencimento) de forma decrescente. Isso faz com que faturas recém-criadas pelo automated-billing apareçam misturadas ou abaixo de faturas pre-pagas mais antigas que têm datas de vencimento posteriores.

## Solução

Alterar a ordenação para `created_at` decrescente, garantindo que faturas mais recentes sempre apareçam no topo da lista.

### Arquivo: `src/pages/Financeiro.tsx`

**Linha 274 — Trocar:**
```
.order('due_date', { ascending: false })
```

**Por:**
```
.order('created_at', { ascending: false })
```

## Impacto

- Faturas recém-geradas sempre aparecem no topo
- Comportamento mais intuitivo para o professor
- Nenhum outro arquivo ou migration necessário

