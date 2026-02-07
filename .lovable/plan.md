
# Plano de Implementação: Cobrança Híbrida - v3.0 Completa

## Status: Documento atualizado para v3.0 com 168 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 3.0, incorporando 7 novos gaps técnicos (162-168) identificados na revisão cruzada com o código-fonte real.

## Gaps incorporados na v3.0

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 162 | `voidResult` / `prepaid_invoice_info` nunca incluído no return de `process-cancellation` | Frontend não recebe info da fatura pré-paga paga → professor sem feedback |
| 163 | SELECT de invoices na seção 5.4 não inclui campo `amount` | `voidResult.paid_amount` retorna `undefined` |
| 164 | **CRÍTICO**: `shouldCharge` não setado `false` para faturas prepaid pagas (Gap 116 violado) | Dupla penalização: multa de cancelamento + pagamento original mantido |
| 165 | Checklist pré-deploy pula v2.5 (Gaps 126-133) | 8 verificações ausentes → implementador pode ignorar |
| 166 | `send-invoice-notification` sem código concreto para CTA de `prepaid_class` | Aluno recebe link para `/faturas` em vez da página de pagamento Stripe |
| 167 | Step 3c.vi de `process-class-billing` omite `original_amount` | Relatórios financeiros sem dados de valor original |
| 168 | Apêndice A verificado — seções v2.2-v2.4 e v2.8-v2.9 já existem | Resolvido por verificação |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.
Prioridade zero: corrigir Gaps 103-106 + 115 no webhook existente.
