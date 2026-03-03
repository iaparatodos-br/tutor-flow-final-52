
# Auditoria Final v3.0: 2 Gaps de Logica de Comparacao de Datas

## Resumo

Cruzamento completo do plano v3.0 com toda a base de codigo. Encontrei **2 gaps de logica** em comparacoes de `due_date` (campo `date`) que nao estao documentados no plano. Nao sao bugs de formatacao visual -- sao bugs de **logica de negocio** que afetam se uma fatura e marcada como "vencida" ou nao.

---

## Gap 1: `src/pages/Financeiro.tsx` -- `isOverdue()` compara `due_date` com data local sem timezone do perfil

**Linhas 150-162**:

```typescript
const isOverdue = (dueDate: string, status: string): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
};
```

**Problema**: `new Date('2026-02-15')` cria um objeto Date em UTC midnight. `setHours(0,0,0,0)` ajusta para meia-noite LOCAL. Para um professor em UTC-5 (Americas), `new Date('2026-02-15')` = Feb 14 19:00 local. Apos `setHours(0,0,0,0)`, `due` = Feb 14 00:00 local. A fatura com `due_date = '2026-02-15'` seria marcada como vencida no dia 14, um dia antes.

**Criticidade**: Media -- afeta a indicacao visual de "vencida" na lista de faturas. Pode causar confusao no professor.

**Nota**: `Financeiro.tsx` ja esta listado no plano para formatacao visual e `currentMonth`, mas este bug de **logica `isOverdue`** nao esta coberto.

**Acao**: Adicionar nota ao item existente de `Financeiro.tsx` na tabela do Passo 8.

---

## Gap 2: `src/components/PaymentOptionsCard.tsx` -- `isOverdue` compara `due_date` com `new Date()` sem timezone

**Linha 179**:

```typescript
const isOverdue = new Date(invoice.due_date) < new Date();
```

**Problema**: Identico ao Gap 1. `new Date(invoice.due_date)` cria UTC midnight. `new Date()` e a hora local atual. Para um professor em UTC-5 as 20:00 local do dia 14, `new Date('2026-02-15')` = Feb 14 19:00 local < Feb 14 20:00 local = **true**. A fatura seria marcada como vencida um dia antes do esperado.

**Criticidade**: Media -- afeta a indicacao visual de "vencida" no card de pagamento do aluno, incluindo o bloco de alerta vermelho "Fatura vencida".

**Nota**: `PaymentOptionsCard.tsx` ja esta listado no plano para "1x `format()` sem timezone", mas este bug de **logica `isOverdue`** nao esta coberto.

**Acao**: Adicionar nota ao item existente na tabela do Passo 8.

---

## Verificacoes Realizadas (Sem Novos Gaps Adicionais)

- Todos os 34 componentes frontend: cobertos
- Todas as 17 edge functions: cobertas (incluindo `automated-billing` com 4x `toLocaleDateString` + `toISOString().split`)
- Todas as 7 RPCs: cobertas
- `auto-verify-pending-invoices`: sem logica de data sensivel (confirmado)
- `setup-billing-automation`: sem logica de data sensivel (confirmado)
- `new Date().getFullYear()` em emails: apenas para copyright footer (sem impacto)
- `DevValidation.tsx`, `SecurityMonitoringDashboard.tsx`: corretamente excluidos

---

## Alteracoes Propostas ao Documento

### 1. Tabela do Passo 8 -- Atualizar 2 itens existentes

**Atualizar `src/pages/Financeiro.tsx`**:
De: "`formatDate` local sem timezone + calculo de `currentMonth` com `new Date().toISOString()` sem timezone..."
Para: "`formatDate` local sem timezone + calculo de `currentMonth` com `new Date().toISOString()` sem timezone + funcao `isOverdue()` compara `due_date` (campo `date`) com data local sem timezone do perfil (pode marcar fatura como vencida 1 dia antes)"

**Atualizar `src/components/PaymentOptionsCard.tsx`**:
De: "1x `format()` sem timezone (datas de faturas)"
Para: "1x `format()` sem timezone (datas de faturas) + `isOverdue` compara `due_date` com `new Date()` sem timezone (pode marcar fatura como vencida 1 dia antes)"

### 2. Versao do documento

Atualizar para **v3.1** (v3.0 + isOverdue logic em Financeiro.tsx e PaymentOptionsCard.tsx).

### 3. Contagem de componentes

Mantida em **34** (nao sao componentes novos, sao bugs adicionais em componentes ja listados).
