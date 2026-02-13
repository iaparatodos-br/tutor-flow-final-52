
# Plano de Cobrança Híbrida -- Detalhes Técnicos

Este arquivo contém as descrições detalhadas de cada ponta solta e melhoria.
Para o índice consolidado, roadmap e panoramas, ver `.lovable/plan.md`.

---

## Pontas Soltas v5.7 (#108-#118)

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

## Pontas Soltas v5.6 (#100-#107)

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

## Pontas Soltas Anteriores (Seleção #67-#99)

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

## Melhorias (M1-M52, Seleção)

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
| v5.1-5.4 | 2026-02 | Identificação progressiva de pontas #1-#79, melhorias M1-M30 |
| v5.5 | 2026-02 | +20 pontas (#80-#99), +12 melhorias (M31-M42) |
| v5.6 | 2026-02-13 | +8 pontas (#100-#107), +5 melhorias (M43-M47) |
| v5.7 | 2026-02-13 | +11 pontas (#108-#118), +5 melhorias (M48-M52) |
