

# Avaliação dos 5 Novos Pontos do Gemini vs. Plano v3.3

## Análise Ponto a Ponto

### Ponto 1: Input Parsing no ClassForm.tsx — CORRETO, GAP REAL

**O que o Gemini diz**: `new Date(\`${formData.class_date}T${formData.time}\`)` usa o timezone do browser, não o do perfil. Se o professor viaja e recusa a atualização do `useTimezoneSync`, o browser está em `Europe/Paris` mas o perfil em `America/Sao_Paulo`. A aula "14:00" seria gravada como 14:00 de Paris (UTC+1) em vez de 14:00 de Brasília (UTC-3).

**Verificação no código**: Confirmado em 2 arquivos:
- `src/components/ClassForm/ClassForm.tsx` (linha 148)
- `src/pages/Agenda.tsx` (linha 1424)

Ambos fazem `new Date(\`${class_date}T${time}\`)` que interpreta no timezone do browser.

**Veredicto**: Gap **real e crítico**. O plano v3.3 lista `ClassForm.tsx` e `Agenda.tsx` na tabela do Passo 8 como "migrar datas para utilitário", mas não menciona explicitamente a conversão de **input parsing** (criação de aulas) — foca apenas em **display**. A submissão de formulário precisa de `zonedTimeToUtc` (ou equivalente `date-fns-tz`) para forçar o parse no timezone do perfil.

**Ação**: Adicionar ao Passo 8 uma nota explícita sobre **input parsing** em `ClassForm.tsx` e `Agenda.tsx`: ao submeter, usar `zonedTimeToUtc` do `date-fns-tz` para converter a data/hora do formulário do timezone do perfil (não do browser) para UTC antes de gravar.

---

### Ponto 2: Cruzamento de Fusos na Disponibilidade — JÁ COBERTO (Passo 5.4)

**O que o Gemini diz**: `get_teacher_availability` precisa converter blocos de disponibilidade para o fuso do aluno.

**Análise**: O plano v3.3 já cobre isso completamente no **Passo 5.4** (linhas 462-484), incluindo:
- `get-teacher-availability` retornar `teacherTimezone`
- `StudentScheduleRequest.tsx` converter `working_hours` do fuso do professor para o do aluno
- `request-class` validar no fuso do professor

**Veredicto**: **Já coberto**. Nenhuma ação necessária.

---

### Ponto 3: Resiliência do Hourly Sweeper (`= 1` vs `>= 1`) — PARCIALMENTE CORRETO

**O que o Gemini diz**: Se o cron falhar às 01:00 UTC, a cláusula `EXTRACT(HOUR ...) = 1` faz com que o grupo não seja cobrado na execução das 02:00.

**Análise da RPC** (linhas 153-173 do plano): A query usa `= 1` (hora exata). Se o cron não rodar na hora certa, aquele grupo de professores perde o billing.

**Porém**: O plano já tem **idempotência** (Passo 6, linhas 570-597) que previne duplicatas. A mudança para `>= 1` com `NOT EXISTS` é uma melhoria de resiliência real.

**Veredicto**: Gap **real e importante**. A RPC `get_relationships_to_bill_now` deve usar `>= 1` (ou qualquer hora após meia-noite local) combinado com verificação de idempotência na própria query SQL via `NOT EXISTS`. Isso torna o sweeper auto-corretivo.

**Ação**: Atualizar o SQL da RPC no Passo 5 (linhas 153-173) para:
```sql
AND EXTRACT(HOUR FROM (now() AT TIME ZONE ...)) >= 1
AND NOT EXISTS (
  SELECT 1 FROM invoices i 
  WHERE i.teacher_id = tsr.teacher_id 
  AND i.student_id = tsr.student_id
  AND i.invoice_type = 'monthly'
  AND i.created_at >= ((now() AT TIME ZONE ...)::date)::timestamptz
)
```

---

### Ponto 4: RRule e DST em Aulas Recorrentes — PARCIALMENTE CORRETO, MAS BAIXA PRIORIDADE

**O que o Gemini diz**: `RRule` no frontend gera datas com drift de 1h ao cruzar DST.

**Análise do código**: O `RRule` em `ClassForm.tsx` (linhas 183, 216) e `Agenda.tsx` (linha 297) é usado para:
1. **Detecção de conflitos** em tempo real (ClassForm.tsx, linhas 162-198) — apenas visual, não persiste.
2. **Geração de ocorrências futuras** (ClassForm.tsx, linhas 200-221) — submete ao banco.
3. **Expansão visual de templates** (Agenda.tsx, linhas 295-300) — apenas renderização.

O cenário de drift real: `RRule({ dtstart: classDateTime, ... })` onde `classDateTime` foi criado com `new Date()` do browser. Se o Ponto 1 (input parsing) for corrigido (gravar em UTC do timezone do perfil), a `dtstart` estará em UTC correto, e o `RRule` opera sobre instantes UTC — sem drift.

O risco de DST com `RRule` é real apenas na **apresentação** das datas geradas. Como as ocorrências vão para o banco como `timestamptz` (via `.toISOString()`), o armazenamento é correto. A exibição é coberta pela migração de componentes.

**Veredicto**: Gap **menor/teórico**. Se o Ponto 1 for corrigido, o `RRule` recebe instantes UTC corretos. O drift de DST na apresentação já está coberto pela migração de componentes (Passo 8). Adicionar uma **nota** ao plano é suficiente.

---

### Ponto 5: Webhooks do Stripe — JÁ COBERTO / SEM IMPACTO

**O que o Gemini diz**: `webhook-stripe-subscriptions` e `webhook-stripe-connect` podem gerar faturas/recibos com timezone errado.

**Verificação**: Busquei `toLocaleDateString`, `toLocaleTimeString` e `format(` em ambos os webhooks — **zero ocorrências**. Esses webhooks:
- Processam eventos do Stripe (payment_intent.succeeded, invoice.paid, etc.)
- Atualizam status de faturas no banco (`status: 'pago'`, `updated_at: new Date().toISOString()`)
- Não formatam datas para exibição ao utilizador
- Não enviam emails diretamente (delegam para edge functions de notificação, já cobertas em 5.1.1-5.1.7)

**Veredicto**: **Sem impacto**. Os webhooks trabalham com timestamps absolutos e delegam a formatação para as funções de notificação. Nenhuma ação necessária.

---

## Resumo de Alterações ao Plano v3.3

### 1. NOVO — Passo 8: Nota sobre Input Parsing (criação de aulas)

Adicionar ao Passo 8 uma seção explícita:

> **REGRA CRÍTICA: Input Parsing no Formulário de Aulas**
>
> Ao submeter datas de formulários (`ClassForm.tsx` linha 148, `Agenda.tsx` linha 1424), o `new Date(\`${date}T${time}\`)` usa o timezone do browser. Se o utilizador estiver fisicamente num fuso diferente do perfil (ex: professor brasileiro viajando pela Europa), a aula será gravada no horário errado.
>
> **Correção**: Usar `zonedTimeToUtc` do `date-fns-tz` para forçar o parse no timezone do perfil:
> ```typescript
> import { zonedTimeToUtc } from 'date-fns-tz';
> const classDateTime = zonedTimeToUtc(`${formData.class_date}T${formData.time}`, profile.timezone);
> ```
>
> Aplicar em: `ClassForm.tsx`, `Agenda.tsx`, `ClassExceptionForm.tsx`, `FutureClassExceptionForm.tsx`.

### 2. Passo 5: Tornar Sweeper auto-corretivo (`>= 1` + `NOT EXISTS`)

Atualizar o SQL de `get_relationships_to_bill_now` para usar `>= 1` em vez de `= 1`, com cláusula `NOT EXISTS` que verifica se já existe fatura criada "hoje local" para aquele par professor/aluno. Isso garante que se o cron falhar numa hora, a execução seguinte recupera automaticamente.

### 3. Nota sobre RRule e DST

Adicionar nota: A biblioteca `rrule` opera sobre instantes `Date` do JS. Após a correção do input parsing (item 1), o `dtstart` será UTC correto. O risco de drift de 1h na apresentação já está coberto pela migração dos 37 componentes. Não requer refatoração imediata do `rrule`.

### 4. Atualizar Seção 4 (Riscos)

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Aula gravada no UTC do browser em vez do perfil | Média | Alto | `zonedTimeToUtc` no submit de formulários |
| Cron billing falha e grupo de professores não cobrado | Baixa | Alto | Sweeper com `>= 1` + `NOT EXISTS` auto-corretivo |

