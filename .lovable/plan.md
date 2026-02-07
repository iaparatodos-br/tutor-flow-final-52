
# Plano de Implementação: Cobrança Híbrida - v2.4 Completa

## Status: Documento atualizado para v2.4 com 125 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 2.4, incorporando 11 novos gaps técnicos (115-125) identificados na revisão mais recente.

## Gaps incorporados na v2.4

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 115 | **CRÍTICO**: `payment_intent.succeeded` handler (linha 453) usa `.single()` — omitido pelo Gap 103 | Mesmo risco de retries infinitos do Stripe para PIs sem invoice no banco |
| 116 | `shouldCharge` para faturas prepaid PAGAS não é desativado — risco de double-charging | Aluno perde prepaid + recebe cobrança de cancelamento |
| 117 | Agenda.tsx não verifica `billingResult.success` da resposta de `process-class-billing` | Erros genéricos silenciados, professor sem feedback |
| 118 | **CRÍTICO**: Sem rollback se Stripe Invoice criada/finalizada mas DB insert falha | Invoice Stripe pagável sem registro local — pagamento "fantasma" |
| 119 | Padrão de resposta inconsistente entre `process-cancellation` e `process-class-billing` | Frontend pode não extrair mensagens user-friendly de HTTP 500 |
| 120 | Agenda.tsx precisa importar namespace i18n `billing` para toasts de cobrança | Chaves traduzidas mostram literal em vez de texto |
| 121 | Resposta não detalha participantes skipados por mensalidade ativa | Professor sem visibilidade sobre quem não foi cobrado |
| 122 | `process-class-billing` não valida preço/status do serviço server-side | Stripe rejeita Invoice com amount 0 |
| 123 | `payment_settings.payment_method_types` não especificado na Invoice Stripe | Documentar como decisão intencional |
| 124 | Sem limite de batch size — risco de timeout para muitas aulas simultâneas | Edge function pode expirar com >20 aulas |
| 125 | Seção 5.3 descreve modificações de webhook como incrementais mas são reescritas | Risco de código duplicado durante implementação |

## Destaques críticos da v2.4

**Gaps 115 e 118 são PRÉ-REQUISITOS para deploy**:
- Gap 115: O handler `payment_intent.succeeded` EXISTENTE tem o mesmo bug de `.single()` identificado no Gap 103, mas foi omitido. Deve ser corrigido junto com os Gaps 103-106.
- Gap 118: Se o DB falhar após a criação da Invoice Stripe, o aluno pode pagar uma fatura "fantasma" que nunca é reconciliada. Requer void automático como rollback.

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.
Prioridade zero: corrigir Gaps 103-106 + 115 no webhook existente.
