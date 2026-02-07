
# Plano de Implementação: Cobrança Híbrida - v2.3 Completa

## Status: Documento atualizado para v2.3 com 114 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 2.3, incorporando 15 novos gaps técnicos (100-114) identificados na revisão mais recente.

## Gaps incorporados na v2.3

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 100 | Nota na seção 12 contradiz Gap 96 — afirma "Não é necessário modificar config.toml" mas Gap 96 EXIGE verify_jwt = false | Deploy falha com 401 se config.toml não for atualizado |
| 101 | CORS headers do webhook-stripe-connect EXISTENTE estão incompletos (faltam headers Supabase) | Inconsistência com padrão do projeto |
| 102 | `canChangePaymentMethod` em Faturas.tsx não exclui `invoice_type === 'prepaid_class'` | Botão RefreshCw aparece para faturas pré-pagas, causando erro ao tentar trocar método |
| 103 | **CRÍTICO**: Handlers invoice.paid e invoice.payment_succeeded EXISTENTES usam .single() — Gap 75 só corrigiu código PROPOSTO | Eventos de invoices não cadastradas causam erro 500 → retries infinitos do Stripe por 3 dias |
| 104 | invoice.payment_succeeded EXISTENTE sobrescreve payment_origin incondicionalmente | Faturas prepaid perdem rastreabilidade de origem |
| 105 | payment_intent.succeeded EXISTENTE sobrescreve payment_origin incondicionalmente | Mesmo problema do Gap 104 para Payment Intents |
| 106 | payment_intent.succeeded limpa stripe_hosted_invoice_url incondicionalmente | Faturas pré-pagas perdem URL de pagamento |
| 107 | process-class-billing não valida array class_ids vazio | Resposta ambígua se frontend envia array vazio |
| 108 | Fonte do email do customer não especificada no passo 3c.ii | Ambiguidade na implementação |
| 109 | Sem tratamento para troca de charge_timing com faturas pendentes | UX confusa para professor |
| 110 | payment_method null em invoice prepaid não documentado como intencional | Confusão durante implementação |
| 111 | process-cancellation void não trata invoice_already_voided | Alertas falsos nos logs |
| 112 | invoice.finalized não na lista de validateStripeEvent | Inconsistência na validação |
| 113 | charge_timing inconsistente em grupos com alunos de profiles diferentes | Limitação de design não documentada |
| 114 | CORS headers de process-cancellation incompletos | Possíveis erros CORS em chamadas do frontend |

## Destaques críticos da v2.3

**Gaps 103-106 são PRÉ-REQUISITOS para deploy**: O webhook-stripe-connect EXISTENTE em produção tem bugs que serão amplificados quando `process-class-billing` começar a criar faturas pré-pagas. Estes 4 gaps devem ser corrigidos NO WEBHOOK ATUAL antes de qualquer deploy da feature de cobrança híbrida.

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.
Prioridade zero: corrigir Gaps 103-106 no webhook existente.
