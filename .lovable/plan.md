
# Plano de Implementação: Cobrança Híbrida - v1.7 Completa

## Status: Documento atualizado para v1.7 com 69 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 1.7, incorporando 6 novos gaps técnicos (64-69) identificados na revisão mais recente.

## Gaps incorporados na v1.7

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 64 | Migração `DEFAULT 'prepaid'` altera comportamento de TODOS os professores existentes | **CRÍTICO** - Faturas inesperadas para professores existentes |
| 65 | Cancelamento de participante individual anula fatura de OUTROS alunos do grupo | Void incorreto de faturas não relacionadas |
| 66 | `create-payment-intent-connect` não listado para atualização de SDK | Versão divergente (`14.21.0` vs `14.24.0`) no fluxo de pagamento |
| 67 | `invoice.payment_succeeded` error handler não interrompe fluxo | Evento com falha marcado como sucesso, impede retries |
| 68 | `payment_intent.succeeded` limpa `stripe_hosted_invoice_url` incondicionalmente | Perde URL "Pagar Agora" para faturas com Stripe Invoice |
| 69 | Verificação da RPC `get_unbilled_participants_v2` | Confirmado: filtra corretamente via `LEFT JOIN invoice_classes WHERE ic.id IS NULL` |

## Gaps anteriores (v1.6)

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 58 | Versão Stripe SDK divergente: plano dizia `v14.21.0` mas webhook usa `v14.24.0` | Incompatibilidade de tipos e comportamento |
| 59 | Handler `payment_intent.succeeded` sobrescreve `payment_origin: 'prepaid'` | Perda de rastreabilidade (mesma causa do Gap 53) |
| 60 | CORS headers faltam headers específicos do Supabase | Requisições bloqueadas pelo preflight |
| 61 | `process-class-billing` usa `teacher_id` do body sem validação JWT | Vulnerabilidade de segurança |
| 62 | `create-payment-intent-connect` cria customers sem persistir ID | Customers Stripe duplicados |
| 63 | `get_unbilled_participants_v2` filtra por `participant_id` — não documentado | Confusão em testes de billing parcial em grupo |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.
