
# Plano de Cobranca Hibrida -- v5.7

**Totais acumulados: 118 pontas soltas | 52 melhorias**
**Ultima atualizacao: 2026-02-13**

---

## Roadmap de Implementação por Batches (Ordem Recomendada)

### Batch 1: Críticos Financeiros (Previnem dano monetário)

| # | Descrição | Arquivo | Esforço |
|---|-----------|---------|---------|
| #109 | Idempotência create-invoice (duplicatas) | create-invoice | Médio |
| #115 | charge_timing NUNCA implementado (prepaid 2x) | automated-billing, process-cancellation, ClassForm | Alto |
| #114 | is_paid_class ignorado no cancelamento (#88 confirmado) | process-cancellation | Baixo |
| #80 | process-cancellation usa service_role como Bearer | process-cancellation | Médio |
| M52 | Fatura cancelamento sem business_profile_id (amplifica #80) | process-cancellation | Baixo |
| #116 | Fallback R$100 silencioso em 4 locais | automated-billing | Baixo |
| #102 | Minimum R$5 hardcoded bloqueia PIX R$1 | process-cancellation, create-payment-intent | Baixo |

### Batch 2: HTTP Status Violations (10 locais -- batch único)

| Função | Status Atual → Correto | Ponta |
|--------|----------------------|-------|
| create-invoice catch | 500 → 200+success:false | #110 |
| process-cancellation catch | 500 → 200+success:false | #84 |
| automated-billing catch | 500 → 200+success:false | #76 |
| create-payment-intent-connect validation | 400 → 200+success:false | #106 |
| create-payment-intent-connect catch | 500 → 200+success:false | M44 |
| generate-boleto-for-invoice catch | 500 → 200+success:false | #107 |
| verify-payment-status catch | 500 → 200+success:false | #118 |
| send-invoice-notification catch | 500 → 200+success:false | M51 |
| webhook-stripe-connect invoice.paid | 500 (return) → break+log | #91 |
| webhook-stripe-connect marked_uncollectible | 500 (return) → break+log | #91 |

### Batch 3: Notificações & Emails

| # | Descrição | Arquivo |
|---|-----------|---------|
| #112 | Fluxo tradicional sem send-invoice-notification (#67/#83 confirmado) | automated-billing |
| #117 | Status em inglês no email (overdue → Vencida) | send-invoice-notification |
| #103 | verify-payment-status não envia notificação ao reconciliar | verify-payment-status |
| #118 | verify-payment-status reconciliação incompleta vs webhook | verify-payment-status |
| #104 | payment_intent.payment_failed não limpa campos temporários | webhook-stripe-connect |

### Batch 4: Validações & Dados

| # | Descrição | Arquivo |
|---|-----------|---------|
| #108 | invoice_type sem whitelist | create-invoice |
| #111 | guardian_name inexistente no schema | create-payment-intent-connect |
| #113 | Colisão invoice.id em class_notifications.class_id | send-invoice-notification |
| #101 | change-payment-method guardian check quebrado (.eq consecutivos) | change-payment-method |
| #82/#90 | Colunas overdue/reminder_notification_sent ausentes no schema | Migração DB |

### Batch 5: FK Joins → Queries Sequenciais

| Função | Linhas | Join Problemático | Ponta |
|--------|--------|-------------------|-------|
| automated-billing (trad) | 320-330 | classes→class_services | #93 |
| automated-billing (trad) | 340-345 | classes→class_participants | #93 |
| automated-billing (mensal) | 700-710 | monthly_subscriptions→profiles | #93 |
| automated-billing (outside) | 900-910 | classes→class_services | #93 |
| create-invoice | 226-241 | class_participants→classes→class_services | M48 |
| create-payment-intent-connect | 41-44 | invoices→profiles | #93 |
| process-cancellation | 45-60 | classes→class_participants | #93 |
| check-overdue-invoices | 30-40 | invoices→profiles | #93 |
| change-payment-method | varies | invoices→profiles | #100 |

### Batch 6: Otimizações & Payment Method Hierarchy

| # | Descrição | Arquivo |
|---|-----------|---------|
| #89/M50 | Hierarquia payment_method (hardcoded boleto → enabled_payment_methods) | automated-billing |
| M49 | Stripe customer não reutilizado (stripe_customer_id) | create-payment-intent-connect |
| M48 | FK join triplo no create-invoice | create-invoice |
| #105/M46 | Webhook invoice.paid/payment_succeeded são no-ops para Connect | webhook-stripe-connect |

---

## Índice Consolidado: Todas as Pontas Soltas (#1-#118)

### Pontas Soltas por Função

#### create-invoice (#108, #109, #110, #72)
- **#108**: Sem validação whitelist invoice_type
- **#109**: Sem idempotência participant_id+class_id → faturas duplicadas
- **#110**: Catch HTTP 500 (deveria 200+success:false)
- **#72**: Throws internos capturados por catch genérico

#### automated-billing (#67, #76, #83, #89, #93, #112, #116)
- **#67/#83/#112**: Fluxo tradicional não envia notificação (CONFIRMADO)
- **#76**: Catch HTTP 500
- **#89/M50**: payment_method hardcoded 'boleto' nos 3 fluxos
- **#93**: FK joins em múltiplos locais
- **#116**: Fallback R$100 silencioso em 4 locais

#### process-cancellation (#80, #84, #88, #114, #115, M52)
- **#80**: Usa service_role_key como Bearer → auth incorreta
- **#84**: Catch HTTP 500
- **#88/#114**: Não verifica is_paid_class (CONFIRMADO)
- **#115**: Não verifica charge_timing → prepaid cobrado 2x
- **M52**: Não inclui business_profile_id na fatura de cancelamento
- **#102**: Mínimo R$5 hardcoded

#### create-payment-intent-connect (#93, #101, #106, #111, M44, M49)
- **#106**: Validation retorna HTTP 400 (deveria 200)
- **#111**: Usa guardian_name inexistente no schema
- **M44**: Catch HTTP 500
- **M49**: Stripe customer não reutilizado
- **#93**: FK join em invoices→profiles
- **#102**: Mínimo R$5 hardcoded

#### verify-payment-status (#103, #118)
- **#103**: Não envia notificação ao reconciliar
- **#118**: Update incompleto vs webhook (falta payment_origin, limpeza campos)

#### send-invoice-notification (#113, #117, M51)
- **#113**: Insere invoice.id em class_notifications.class_id (colisão ativa)
- **#117**: Status em inglês no email
- **M51**: Catch HTTP 500

#### webhook-stripe-connect (#91, #104, #105, M46)
- **#91**: invoice.paid e marked_uncollectible retornam HTTP 500 em vez de break
- **#104**: payment_intent.payment_failed não limpa campos temporários
- **#105/M46**: Handlers invoice.paid/payment_succeeded são no-ops para billing via Connect

#### check-overdue-invoices (#82, #90, M43, M45)
- **#82/#90**: Não usa overdue_notification_sent (coluna ausente)
- **M43**: Race condition com pagamento paralelo
- **M45**: cancel-payment-intent race condition similar

#### generate-boleto-for-invoice (#107)
- **#107**: Catch HTTP 500

#### change-payment-method (#100, #101)
- **#100**: FK join em invoices→profiles
- **#101**: Guardian check quebrado (.eq consecutivos sobrescrevem)

---

## Panorama: Features Planejadas mas Ausentes no Código

| Feature | Status | Ponta(s) |
|---|---|---|
| Whitelist invoice_type em create-invoice | NÃO implementada | #108 |
| Idempotência participant_id+class_id | NÃO implementada | #109 |
| Coluna overdue_notification_sent em invoices | NÃO existe no schema | #82, #90, #113 |
| Coluna reminder_notification_sent em invoices | NÃO existe no schema | #90 |
| Verificação charge_timing em runtime | NÃO implementada em NENHUMA função | #115 |
| Verificação is_paid_class em process-cancellation | NÃO implementada | #114 |
| Hierarquia payment_method (enabled_payment_methods) | NÃO implementada (hardcoded boleto) | #89, M50 |
| Notificação no fluxo tradicional do automated-billing | NÃO implementada | #112 |
| Limpeza campos temporários em payment_failed | NÃO implementada | #104 |
| Notificação em verify-payment-status | NÃO implementada | #103, #118 |

---

## Resumo de Severidade Consolidado (todos os itens)

### CRÍTICOS (dano financeiro direto)
| # | Descrição | Batch |
|---|-----------|-------|
| #109 | Faturas duplicadas por retentativa | 1 |
| #115 | charge_timing não implementado → prepaid cobrado 2x | 1 |
| #114 | Aulas gratuitas cobram cancelamento | 1 |
| #80 | process-cancellation auth incorreta (service_role) | 1 |
| M52 | Fatura cancelamento sem business_profile_id | 1 |
| #112 | Alunos tradicionais nunca recebem email de cobrança | 3 |
| #116 | Fallback R$100 silencioso | 1 |
| #101 | change-payment-method guardian check quebrado | 4 |

### ALTOS (dados incorretos / UX degradada)
| # | Descrição | Batch |
|---|-----------|-------|
| #108 | invoice_type sem validação | 4 |
| #110 | HTTP 500 perde mensagens de erro | 2 |
| #113 | Colisão invoice.id em class_notifications | 4 |
| #117 | Status inglês no email | 3 |
| #118 | verify-payment-status incompleto | 3 |
| #91 | webhook handlers retornam 500 em vez de break | 2 |
| #104 | Campos temporários não limpos em payment_failed | 3 |
| #82/#90 | Notificações overdue sem controle de duplicatas | 4 |

### MÉDIOS (otimizações / inconsistências)
| # | Descrição | Batch |
|---|-----------|-------|
| #111 | guardian_name inexistente (fallback funciona) | 4 |
| #93 | FK joins em múltiplas funções | 5 |
| M48 | FK join triplo create-invoice | 5 |
| M49 | Stripe customer não reutilizado | 6 |
| M50 | payment_method hardcoded boleto | 6 |
| M51 | send-invoice-notification HTTP 500 | 2 |
| #102 | Mínimo R$5 hardcoded | 1 |
| #105/M46 | Webhook handlers no-ops para Connect | 6 |

---

## Detalhes Técnicos: Pontas Soltas v5.7 (#108-#118)

### 108. create-invoice sem validação whitelist invoice_type (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linha 197)

A função aceita qualquer valor de `invoice_type` sem validação:
```javascript
invoice_type: body.invoice_type || 'manual',
```

Tipos válidos planejados: 'regular', 'manual', 'automated', 'monthly_subscription', 'prepaid_class', 'cancellation', 'orphan_charges'.

**Ação**: Adicionar whitelist `VALID_INVOICE_TYPES` antes da inserção, retornando `success: false` para tipos inválidos.

### 109. create-invoice sem idempotência participant_id+class_id (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 190-208)

Nenhuma verificação de duplicidade existe. Retentativas de rede ou cliques múltiplos geram faturas duplicadas.

**Ação**: Antes de inserir, verificar se já existe fatura com `class_id = body.class_id` AND `student_id = billingStudentId` AND `status != 'cancelada'`. Se existir, retornar a fatura existente com `success: true, already_exists: true`.

### 110. create-invoice catch HTTP 500 (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 564-574)

Todos os throws internos (linhas 42, 46, 55, 158, 212, 247, 276, 356) são capturados pelo catch genérico com HTTP 500. Confirma e consolida #72.

**Ação**: Alterar catch para HTTP 200 com `success: false`.

### 111. create-payment-intent-connect usa guardian_name inexistente (Fase 5)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 308, 433)

`invoice.student?.guardian_name` é sempre `undefined` pois `guardian_name` não existe em `profiles`. Fallback `invoice.student?.name` funciona.

**Ação**: Substituir por `finalPayerName` (linhas 267-269 já resolvem guardian vs student).

### 112. automated-billing fluxo tradicional sem notificação (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 559-566)

Confirmação definitiva de #67/#83. Fluxo tradicional não chama `send-invoice-notification`. Fluxos de mensalidade (linha 884) e outside-cycle (linha 998) chamam.

**Ação**: Adicionar chamada fire-and-forget após linha 566.

### 113. send-invoice-notification colisão invoice.id em class_notifications.class_id (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 435-442)

Insere `invoice.id` no campo `class_id` de `class_notifications`. Comentário no código confirma decisão intencional.

**Ação**: Adicionar campo `reference_type` ('class'|'invoice') em `class_notifications`, ou migrar para tabela dedicada.

### 114. process-cancellation não verifica is_paid_class (Fase 6)

Confirmação definitiva de #88. Busca por `is_paid_class` retorna zero resultados. Aulas gratuitas canceladas tardiamente geram cobrança indevida.

**Ação**: Adicionar `is_paid_class` ao SELECT da aula (linha 45) e ao `shouldCharge` (linhas 216-225): `if (!classData.is_paid_class) shouldCharge = false`.

### 115. charge_timing NÃO implementado em runtime (Fase 6)

Busca por `charge_timing` em TODAS as edge functions retorna zero resultados. O campo existe no schema (`business_profiles.charge_timing`) mas nenhuma função o consulta.

**Impacto CRÍTICO**: Aulas prepaid podem ser cobradas 2x (fatura individual + billing automático).

**Ação**:
1. `process-cancellation`: não cobrar cancelamento para prepaid
2. `automated-billing`: filtrar aulas com fatura prepaid existente (via `invoice_classes.class_id`)
3. `ClassForm`: consultar `charge_timing` para lógica de recorrência

### 116. automated-billing fallback R$100 em 4 locais (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 337, 348, 387, 410)

```javascript
const amount = service?.price || defaultServicePrice || 100;
```

Nenhum log de warning. Consolida M41.

**Ação**: Adicionar `logStep("WARNING: Using fallback price R$100")` nos 4 locais. Considerar rejeitar em vez de cobrar valor estimado.

### 117. send-invoice-notification status em inglês no email (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linha 393)

Email exibe `invoice.status` raw ('overdue') em vez de traduzido ('Vencida').

**Ação**: Adicionar mapeamento de status: `{ pendente: 'Pendente', paga: 'Paga', cancelada: 'Cancelada', overdue: 'Vencida' }`.

### 118. verify-payment-status reconciliação incompleta (Fase 7)

**Arquivo**: `supabase/functions/verify-payment-status/index.ts` (linhas 89-93)

Atualiza APENAS `status`. Falta: `payment_origin: 'automatic'`, limpeza de campos temporários, notificação. Webhook `payment_intent.succeeded` faz tudo isso corretamente.

**Ação**: Alinhar update com o do webhook.

---

## Detalhes Técnicos: Pontas Soltas v5.6 (#100-#107)

### 100. change-payment-method FK join em invoices→profiles

**Arquivo**: `supabase/functions/change-payment-method/index.ts`

Usa FK join syntax que viola constraint de queries sequenciais.

### 101. change-payment-method guardian check quebrado (.eq consecutivos)

**Arquivo**: `supabase/functions/change-payment-method/index.ts`

Dois `.eq('responsible_id', ...)` consecutivos na mesma query -- o segundo sobrescreve o primeiro. Potencialmente permite acesso não autorizado.

**Ação**: Usar `.or()` ou queries separadas para verificar guardian.

### 102. Mínimo R$5 hardcoded em process-cancellation e create-payment-intent-connect

Bloqueia pagamentos PIX válidos de R$1. Stripe Connect permite mínimo R$1 para PIX.

**Ação**: Diferenciar mínimo por payment_method: R$5 para boleto, R$1 para PIX.

### 103. verify-payment-status não envia notificação ao reconciliar

Ver #118 (consolidado).

### 104. webhook payment_intent.payment_failed não limpa campos temporários

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts`

Quando pagamento falha, PIX QR codes e boleto URLs expirados permanecem na fatura.

**Ação**: Limpar `pix_qr_code`, `pix_copy_paste`, `pix_expires_at`, `boleto_url`, `boleto_expires_at` no handler de `payment_failed`.

### 105. webhook invoice.paid/payment_succeeded são no-ops para Connect billing

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts`

Handlers buscam por `stripe_invoice_id`, mas billing via Connect usa apenas `stripe_payment_intent_id`. Consolidado com M46.

### 106. create-payment-intent-connect validation HTTP 400

Retorna HTTP 400 para erros de validação em vez de 200+success:false.

### 107. generate-boleto-for-invoice catch HTTP 500

Retorna HTTP 500 no catch genérico em vez de 200+success:false.

---

## Detalhes Técnicos: Pontas Soltas Anteriores (Seleção #67-#99)

### #67/#83 → Confirmado em #112
### #72 → Consolidado em #110
### #76 → automated-billing catch HTTP 500
### #80 → process-cancellation usa service_role_key como Bearer (auth incorreta)
### #82/#90 → Colunas overdue/reminder_notification_sent ausentes no schema
### #84 → process-cancellation catch HTTP 500
### #88 → Confirmado em #114
### #89 → payment_method hardcoded boleto (consolidado em M50)
### #91 → webhook-stripe-connect invoice.paid e marked_uncollectible retornam 500
### #93 → FK joins em múltiplas funções (9 locais identificados)

---

## Detalhes Técnicos: Melhorias (M1-M52, Seleção)

### M43. check-overdue-invoices race condition com pagamento paralelo
Fatura pode ser marcada 'overdue' após já ter sido paga por webhook paralelo.
**Ação**: Adicionar `.eq('status', 'pendente')` no UPDATE para evitar revert.

### M44. create-payment-intent-connect catch HTTP 500
### M45. cancel-payment-intent race condition similar a M43
### M46. webhook payment_method sobrescrito com 'stripe_invoice' (consolidado com #105)
### M47. Não documentado separadamente

### M48. create-invoice FK join triplo
`class_participants → classes!inner → class_services`. Se qualquer nível falhar, preço será `undefined`.

### M49. Stripe customer não reutilizado
Cada geração de boleto/PIX faz `customers.list` + potencialmente `customers.create`.
**Ação**: Armazenar `stripe_customer_id` em profiles após criação.

### M50. automated-billing 3 fluxos sem payment_method + hardcoded boleto
Nenhum dos 3 fluxos inclui `payment_method` no invoiceData. Todos hardcodam 'boleto' na chamada ao create-payment-intent-connect.

### M51. send-invoice-notification catch HTTP 500
### M52. process-cancellation fatura cancelamento sem business_profile_id
Amplifica #80: auth incorreta + routing incorreto.

---

## Histórico de Versões

| Versão | Data | Mudanças |
|--------|------|----------|
| v5.0 | 2026-02 | Plano inicial com arquitetura híbrida |
| v5.1-5.4 | 2026-02 | Identificação progressiva de pontas soltas #1-#79, melhorias M1-M30 |
| v5.5 | 2026-02 | +20 pontas (#80-#99), +12 melhorias (M31-M42) |
| v5.6 | 2026-02-13 | +8 pontas (#100-#107), +5 melhorias (M43-M47): change-payment-method auth quebrada, FK joins, mínimo R$5, HTTP status violations, webhook no-ops |
| v5.7 | 2026-02-13 | +11 pontas (#108-#118), +5 melhorias (M48-M52): create-invoice validações ausentes, charge_timing/is_paid_class não implementados, fallback R$100, colisão IDs, status inglês email, verify-payment-status incompleto |
