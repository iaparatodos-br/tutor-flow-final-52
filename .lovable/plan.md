

# Verificacao Final v5.65 — Contagem Fase 0 Incorreta

## Diagnostico Principal

Apos leitura completa das 5195 linhas e contagem item-a-item de cada tabela nas categorias A-L, identifiquei **1 problema critico** que impede o uso como checklist de implementacao.

## Problema: Categorias A-L Contam 138 Itens, Nao 162

A nota na linha 502 afirma: "As tabelas acima (categorias A-L) consolidam todos os 162 itens da Fase 0." Isso e **falso**. A contagem real por categoria:

| Categoria | Descricao | Itens Listados |
|-----------|-----------|---------------|
| A | Auth/IDOR | 24 |
| B | Status Mismatch pt-BR | 8 |
| C | Guard Clauses / Race Conditions | 11 |
| D | Webhook Resilience / HTTP 500 | 8 |
| E | FK Joins proibidos no Deno | 15 |
| F | .single() criticos em loops | 20 |
| G | Audit Logs schema mismatch | 4 |
| H | FK Cascade / Deletion failures | 8 |
| I | Data Corruption | 6 |
| J | Integridade de dados | 8 |
| K | ANON_KEY inline / SQL injection | 6 |
| L | Outros itens Fase 0 | 20 |
| **Total** | | **138** |

### Itens Faltantes (24 itens ausentes das tabelas A-L)

Os seguintes itens foram marcados como Fase 0 nas secoes de passagem mas NUNCA adicionados as tabelas consolidadas:

**Da 9a passagem** (6 itens):
- #287: webhook-stripe-connect handlers invoice.paid/payment_intent.succeeded escrevem 'paid' (extensao de #546, Cat B)
- #288: webhook-stripe-connect invoice.marked_uncollectible escreve 'overdue' (extensao de #547, Cat B)
- #290: process-cancellation identity spoofing via cancelled_by do body (Cat A)
- #294: webhook-stripe-subscriptions HTTP 400 para "user not found" causa retry storm (Cat D)
- #296: create-subscription-checkout cancela assinatura ANTES do checkout (Cat C)
- #297: webhook-stripe-connect .single() em invoice lookups causa retry storm (Cat F)

**Da 13a passagem** (4 itens):
- #329: webhook-stripe-connect TODOS handlers de sucesso escrevem 'paid' (extensao de #546, Cat B)
- #330: webhook-stripe-connect 'overdue' em marked_uncollectible (extensao de #547, Cat B)
- #334: cancel-payment-intent confirmacao manual escreve 'paid' (Cat B)
- #337: process-cancellation SERVICE_ROLE_KEY como Bearer para create-invoice (extensao de #563, Cat L)

**Da 19a passagem** (6 itens):
- #400: validate-business-profile-deletion sem auth (confirmado por #573, ja em Cat A)
- #401: stripe-events-monitor sem auth (confirmado por #572, ja em Cat A)
- #402: check-email-availability sem auth + enumeracao (Cat A)
- #403: audit-logger colunas erradas — ZERO logs de auditoria (confirmado por #277, ja em Cat G)
- #404: handle-plan-downgrade-selection audit mismatch (confirmado por #568, ja em Cat G)
- #405: get-teacher-availability FK join proibido `classes!inner` (Cat E)

**Da 24a passagem** (8 itens):
- #488: handle-teacher-subscription-cancellation sem auth (confirmado por #564, ja em Cat A)
- #489: handle-teacher-subscription-cancellation sem stripeAccount (confirmado por #567, ja em Cat L)
- #491: handle-teacher-subscription-cancellation guardian_email fantasma (confirmado por #565, ja em Cat J)
- #493: process-payment-failure-downgrade params errados para smart-delete (Cat I)
- #495: setup-class-reminders-automation exec_sql SQL injection (Cat K)
- #497: create-subscription-checkout FK join (confirmado por #371, ja em Cat E)
- #502: send-class-report-notification sem auth (confirmado por #576, ja em Cat A)
- #516: item nao identificado na secao detalhada

### Duplicatas Internas nas Tabelas A-L (7 pares)

Alem dos itens faltantes, as tabelas A-L contem itens que sao a MESMA vulnerabilidade catalogada duas vezes sob numeros diferentes:

1. Cat A: #350 e #564 (handle-teacher-subscription-cancellation sem auth)
2. Cat B: #169 e #546 (webhook status 'paid')
3. Cat B: #209 e #555 (check-overdue-invoices status 'overdue')
4. Cat H: #181 e #365 (end-recurrence FK cascade)
5. Cat H: #397 e #580 (archive-old-data student_id fantasma)
6. Cat H: #398 e #581 (archive-old-data FK cascade failure)
7. Cat L: #80 e #563 (process-cancellation SERVICE_ROLE_KEY como Bearer)

## Correcao Proposta

### Abordagem: Deduplicate + Adicionar Faltantes

1. **Marcar duplicatas internas** com nota "(confirmado por #XXX)" para manter rastreabilidade sem inflacionar a contagem
2. **Adicionar itens genuinamente faltantes** (aqueles que NAO sao confirmacoes de itens ja listados):
   - #290 → Cat A (identity spoofing)
   - #294 → Cat D (webhook HTTP 400 retry)
   - #296 → Cat C (cancela antes do checkout)
   - #297 → Cat F (.single() em webhook)
   - #329, #334 → Cat B (status 'paid' em mais locais)
   - #402 → Cat A (check-email-availability sem auth)
   - #405 → Cat E (get-teacher-availability FK join)
   - #493 → Cat I (params errados smart-delete)
   - #495 → Cat K (SQL injection exec_sql)
3. **Atualizar nota da linha 502** para refletir contagem real corrigida
4. **Recalcular total da Fase 0** apos deduplicacao + adicoes

### Impacto Estimado

- Itens genuinamente novos a adicionar: ~10
- Duplicatas a marcar: ~7 pares (14 itens, contar como 7 unicos)
- Total corrigido da Fase 0: provavelmente ~148-155 itens unicos (vs 162 com duplicatas)
- A contagem no cabecalho e totais finais deve ser ajustada

### Arquivo Afetado

- `docs/hybrid-billing-implementation-plan.md` — correcao das tabelas A-L, nota da linha 502, totais finais

### Estimativa de Impacto

Nenhuma alteracao de codigo. Apenas correcao de contagem e consolidacao do documento de planejamento para refletir numeros reais.

