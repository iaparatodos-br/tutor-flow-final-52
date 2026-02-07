
# Plano de Implementação: Cobrança Híbrida - v2.1 Completa

## Status: Documento atualizado para v2.1 com 93 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 2.1, incorporando 6 novos gaps técnicos (88-93) identificados na revisão mais recente.

## Gaps incorporados na v2.1

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 88 | `process-class-billing` passo 3c.vi NÃO inclui `payment_account_used_id` na tabela `invoices`. O `automated-billing` já seta esse campo; pré-pagas ficam sem rastreamento por conta de pagamento | Relatórios financeiros e dashboards que agrupam por conta de pagamento ignoram faturas pré-pagas |
| 89 | `process-class-billing` busca `charge_timing` do PRIMEIRO business_profile (`LIMIT 1`), mas usa `business_profile_id` da relationship para Stripe. Se professor tem múltiplos profiles com `charge_timing` diferentes, usa config de um e Stripe de outro | Inconsistência entre decisão de cobrança e conta Stripe utilizada. Professor com PJ (prepaid) e PF (postpaid) teria comportamento imprevisível |
| 90 | Evento `invoice.finalized` do Stripe não tem case explícito no webhook. `process-class-billing` chama `finalizeInvoice` → Stripe envia `invoice.finalized` → se default case não chama `completeEventProcessing`, evento fica preso | Evento preso em "processing" no sistema de idempotência, impedindo retries futuros |
| 92 | Race condition (TOCTOU) no check de idempotência: verificação de `invoice_classes` e criação de InvoiceItems no Stripe NÃO são atômicas. Double-click simultâneo pode criar InvoiceItems duplicados | Duplicação de cobrança no Stripe (InvoiceItems duplicados) mesmo com check no banco |
| 93 | `teacher_student_relationships.business_profile_id` é nullable. Sem fallback, invoice é criada com `business_profile_id: null` mesmo quando step 2 encontrou um business_profile válido | Invoice "órfã" sem vínculo a business_profile. Inconsistência com faturas do `automated-billing` |

**Nota**: Gap 91 (null guard para `stripeAccountId`) já estava implementado no código proposto da seção 5.3 (linha 803: `if (stripeAccountId) {`). Verificação confirmou que o guard existe. Gap número 91 pulado para evitar renumeração.

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.
