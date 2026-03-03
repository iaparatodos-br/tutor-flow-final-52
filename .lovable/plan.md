

# Atualizar Plano de Timezone v2.3: 2 Edge Functions Faltantes

## Resumo

Apos varredura completa de todas as 75+ edge functions do projeto, encontrei **2 edge functions adicionais** que NAO estao no plano e possuem logica sensivel a timezone.

---

## Edge Functions Faltantes

### 1. `generate-teacher-notifications/index.ts` (FALTANDO)

Linha 192 — usa `new Date().toISOString().split('T')[0]` para determinar "hoje" e encontrar faturas vencidas:

```typescript
const today = new Date().toISOString().split('T')[0]
const { data: overdueInvoices2 } = await supabase
  .from('invoices')
  .select('id, teacher_id')
  .eq('status', 'pendente')
  .lt('due_date', today)
```

**Problema**: Identico ao `check-overdue-invoices` (ja no plano como Passo 5.2). Usa data UTC do servidor para comparar com `due_date` (campo `date`). Para professores em fusos ocidentais (ex: UTC-5), faturas podem ser classificadas como "vencidas" antes do fim do dia local.

**Acao**: Buscar o timezone do professor (disponivel via `teacher_id` na fatura) e calcular "hoje" no fuso local antes de comparar com `due_date`. Alternativamente, como o cron ja roda a cada hora, pode-se agrupar faturas por professor e calcular "hoje" por timezone.

### 2. `check-pending-boletos/index.ts` (FALTANDO)

Linhas 178-186 — calcula "amanha" para enviar lembretes de boleto usando UTC:

```typescript
const dueDate = new Date(subscription.boleto_due_date);
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(0, 0, 0, 0);
const dueDateNormalized = new Date(dueDate);
dueDateNormalized.setHours(0, 0, 0, 0);
if (dueDateNormalized.getTime() === tomorrow.getTime()) {
  // send reminder
}
```

**Problema**: "Amanha" e calculado em UTC. Para um professor em UTC-5, as 22:00 locais do dia 1, `tomorrow` seria dia 3 em UTC (nao dia 2). O lembrete pode ser enviado no dia errado ou nao ser enviado.

**Impacto**: Medio — afeta apenas o timing de lembretes de boleto, nao a cobranca em si.

**Acao**: Buscar timezone do professor (via `subscription.user_id` -> `profiles.timezone`) e calcular "amanha" no fuso local.

---

## Edge Functions Confirmadas SEM Impacto (verificacao completa)

As seguintes edge functions usam `new Date()` APENAS para timestamps absolutos (`updated_at`, `created_at`, `toISOString()`) e NAO precisam de alteracao:

- `process-expired-subscriptions` — `new Date()` apenas para log
- `process-payment-failure-downgrade` — `new Date().toISOString()` apenas para `updated_at`
- `handle-student-overage` — `new Date().toISOString()` apenas para `updated_at`
- `auto-verify-pending-invoices` — `new Date().toISOString()` apenas para `updated_at`
- `validate-monthly-subscriptions` — `new Date()` apenas para teste/log
- `stripe-events-monitor` — `new Date()` apenas para calculo de janela relativa (dias atras)
- `materialize-virtual-class` — compara `recurrence_end_date` (timestamptz) com `new Date()` — comparacao absoluta OK
- `manage-future-class-exceptions` — gera datas de recorrencia — opera com timestamptz, sem formatacao para exibicao
- `request-class` — `new Date(datetime).toISOString()` — conversao de input para timestamptz
- `send-student-invitation` — `new Date().getFullYear()` — apenas para copyright no email
- `get-teacher-availability` — `new Date().toISOString()` — filtro absoluto
- `send-password-reset`, `send-material-shared-notification`, `end-recurrence`, etc. — sem uso de datas

---

## Alteracoes ao Documento

1. **Adicionar Passo 5.1.11**: `generate-teacher-notifications/index.ts` — calculo de "hoje" para faturas vencidas deve considerar timezone do professor.
2. **Adicionar Passo 5.1.12**: `check-pending-boletos/index.ts` — calculo de "amanha" para lembretes de boleto deve considerar timezone do professor.
3. **Atualizar Secao 3 (Arquivos Impactados)**: Adicionar as 2 edge functions.
4. **Atualizar checklist** (Secao 7): Adicionar item para estas 2 funcoes.
5. **Atualizar versao** para 2.3.

---

## Arquivo a Modificar

- `docs/timezone-multi-support-implementation-plan.md` (unico arquivo)

