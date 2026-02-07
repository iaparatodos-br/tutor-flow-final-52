
# Plano de Implementação: Cobrança Híbrida - v2.7 Completa

## Status: Documento atualizado para v2.7 com 149 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 2.7, incorporando 6 novos gaps técnicos (144-149) identificados na revisão cruzada com o código-fonte real.

## Gaps incorporados na v2.7

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 144 | `payment_due_days` default inconsistente (doc dizia 7, `automated-billing` usa 15) | Datas de vencimento diferentes entre pré e pós-pago |
| 145 | `send-invoice-notification` CTA para prepaid não linka para Stripe hosted URL | Aluno sem acesso ao app não consegue pagar |
| 146 | `process-class-billing` invoca notificação sem try/catch (fire-and-forget) | Falha de email poderia falhar billing inteiro |
| 147 | Sem unique index no DB para `invoice_classes` prepaid (complementa Stripe idempotency) | Registros duplicados possíveis em concorrência |
| 148 | `process-cancellation` resposta não informa professor sobre fatura prepaid já paga | Professor sem informação para decidir reembolso |
| 149 | **CRÍTICO**: Handler `invoice.paid` na seção 5.3 omite extração de `payment_method` via charge | `payment_method` fica null permanentemente em faturas prepaid |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.
Prioridade zero: corrigir Gaps 103-106 + 115 no webhook existente.
