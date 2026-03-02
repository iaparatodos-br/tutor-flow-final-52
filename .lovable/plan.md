

# Lacunas em Edge Functions no Plano de Timezone (v2.1)

## Resumo

Encontrei **5 edge functions** com formatacao de datas que NAO estao listadas no plano `docs/timezone-multi-support-implementation-plan.md`.

---

## Edge Functions Faltantes

### 1. `send-class-report-notification/index.ts` (FALTANDO)

Linhas 174-177 — formata data/hora da aula no email de relatorio SEM timezone:

```typescript
const formattedDate = classDate.toLocaleDateString('pt-BR');
const formattedTime = classDate.toLocaleTimeString('pt-BR', { 
  hour: '2-digit', minute: '2-digit' 
});
```

**Impacto**: Emails de notificacao de relatorio de aula mostram data/hora no fuso do servidor (UTC), nao do professor.

**Acao**: Buscar timezone do professor e passar como opcao `timeZone` na formatacao.

---

### 2. `send-boleto-subscription-notification/index.ts` (FALTANDO)

Linha 34-39 — funcao helper `formatDate` formata datas SEM timezone:

```typescript
const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
};
```

**Impacto**: Datas de vencimento de boleto nos emails de assinatura podem exibir dia errado para professores fora de BRT (especialmente `due_date` que e campo `date`).

**Acao**: Parametrizar `formatDate` para receber timezone e buscar do professor.

---

### 3. `process-cancellation/index.ts` (FALTANDO)

Linha 470 — formata data da aula para descricao de fatura SEM timezone:

```typescript
const classDateFormatted = new Date(classData.class_date).toLocaleDateString('pt-BR');
```

**Impacto**: Descricoes de faturas de cancelamento podem mostrar data errada (dia anterior/posterior) dependendo do fuso do professor.

**Acao**: Buscar timezone do professor (ja disponivel no contexto da funcao) e usar na formatacao.

---

### 4. `process-orphan-cancellation-charges/index.ts` (FALTANDO)

Linha 233 — formata data da aula para descricao de fatura SEM timezone:

```typescript
description: `Cancelamento - ${service?.name || 'Aula'} - ${new Date(participant.classData.class_date).toLocaleDateString('pt-BR')}`,
```

**Impacto**: Mesmo problema — descricoes de faturas orfas com data potencialmente incorreta.

**Acao**: Buscar timezone do professor e usar na formatacao.

---

### 5. `create-invoice/index.ts` (FALTANDO)

Linha 352 — formata data da aula para descricao de item de fatura SEM timezone:

```typescript
let itemDescription = `${service?.name || 'Aula'} - ${new Date(classInfo.class_date).toLocaleDateString('pt-BR')}`;
```

**Impacto**: Descricoes de itens de fatura manual com data potencialmente incorreta.

**Acao**: O `teacher_id` ja esta disponivel no contexto. Buscar timezone e usar na formatacao.

---

## Edge Functions JA no Plano (confirmadas presentes)

- `automated-billing/index.ts` — 4 ocorrencias (OK, listado)
- `send-class-reminders/index.ts` — hardcoded (OK, Passo 5.1.1)
- `send-class-confirmation-notification/index.ts` — 2x hardcoded (OK, Passo 5.1.2)
- `send-cancellation-notification/index.ts` — 1x hardcoded (OK, Passo 5.1.3)
- `send-invoice-notification/index.ts` — 1x hardcoded (OK, Passo 5.1.4)
- `send-class-request-notification/index.ts` — 2x hardcoded (OK, Passo 5.1.5)
- `check-overdue-invoices/index.ts` — comparacao de datas (OK, Passo 5.2)
- `create-teacher/index.ts` — aceitar timezone (OK, Passo 2)

## Edge Functions Sem Impacto (confirmadas sem problema)

- `process-expired-subscriptions` — sem formatacao de datas
- `send-student-invitation` — sem formatacao de datas
- `send-password-reset` — sem formatacao de datas
- `send-material-shared-notification` — sem formatacao de datas
- `handle-student-overage` — sem formatacao de datas
- `generate-teacher-notifications` — usa `new Date()` para `thirtyDaysAgo`, mas e uma janela relativa de 30 dias que funciona em qualquer fuso (comparacao absoluta com `timestamptz`)

---

## Alteracoes ao Documento

Adicionar ao Passo 5.1 (ou criar 5.1.6 a 5.1.10):

1. **5.1.6** `send-class-report-notification/index.ts` — 2 ocorrencias sem timezone
2. **5.1.7** `send-boleto-subscription-notification/index.ts` — funcao `formatDate` sem timezone
3. **5.1.8** `process-cancellation/index.ts` — 1 ocorrencia sem timezone (descricao de fatura)
4. **5.1.9** `process-orphan-cancellation-charges/index.ts` — 1 ocorrencia sem timezone (descricao de fatura)
5. **5.1.10** `create-invoice/index.ts` — 1 ocorrencia sem timezone (descricao de item)

Adicionar a Secao 3 (Arquivos Impactados):

| Arquivo | Tipo de Mudanca |
|---|---|
| `supabase/functions/send-class-report-notification/index.ts` | Adicionar timezone na formatacao de data/hora |
| `supabase/functions/send-boleto-subscription-notification/index.ts` | Parametrizar `formatDate` com timezone |
| `supabase/functions/process-cancellation/index.ts` | Usar timezone na descricao de fatura |
| `supabase/functions/process-orphan-cancellation-charges/index.ts` | Usar timezone na descricao de fatura |
| `supabase/functions/create-invoice/index.ts` | Usar timezone na descricao de item |

---

## Arquivo a Modificar

- `docs/timezone-multi-support-implementation-plan.md` (unico arquivo — atualizar para v2.2)
