
# Plano de Implementação: Cobrança Híbrida - v2.2 Completa

## Status: Documento atualizado para v2.2 com 99 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 2.2, incorporando 6 novos gaps técnicos (94-99) identificados na revisão mais recente.

## Gaps incorporados na v2.2

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 94 | `payment_method` extraction em `invoice.paid`/`invoice.payment_succeeded` usa `payment_settings.payment_method_types[0]` — lista de métodos PERMITIDOS, não o método usado. Deve usar charge associado (`stripe.charges.retrieve(chargeId).payment_method_details.type`) | Método de pagamento incorreto salvo no banco (ex: "boleto" quando aluno pagou com PIX) |
| 95 | `process-cancellation` void busca `business_profile` por `user_id = teacher_id` para `stripe_connect_id`. Se professor tem múltiplos profiles, pode voiding na conta Connect ERRADA | Void executado na conta Stripe errada → fatura NÃO é anulada, aluno continua sendo cobrado |
| 96 | `process-class-billing` não especifica `verify_jwt = false` em `config.toml`. Per convenção do projeto, edge functions chamadas pelo frontend DEVEM ter esta config | Chamada da edge function falha com 401 mesmo com JWT válido (Supabase rejeita antes da função rodar) |
| 97 | Resposta de `process-class-billing` não segue padrão do projeto (HTTP 200 + `success: false` para erros de business logic). Interface não incluía `success: boolean` nem `error?: string` | Frontend não consegue distinguir erro técnico de resultado de negócios |
| 98 | Gap 79 mencionava `invoice.payment_failed` no checklist mas NÃO fornecia código explícito de correção. Handler (linhas 380-393) marca evento falho como sucesso no sistema de idempotência | Idempotência corrompida: evento falho não será reprocessado em retries do Stripe |
| 99 | Gap 79 mencionava `payment_intent.payment_failed` no checklist mas NÃO fornecia código explícito. Handler (linhas 514-535) tem mesmo problema do Gap 98 | Mesmo impacto do Gap 98 |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.
