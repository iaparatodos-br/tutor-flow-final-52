
# Plano de Implementação: Cobrança Híbrida - v2.9 Completa

## Status: Documento atualizado para v2.9 com 161 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 2.9, incorporando 6 novos gaps técnicos (156-161) identificados na revisão cruzada com o código-fonte real.

## Gaps incorporados na v2.9

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 156 | **CRÍTICO**: Gap 153 afirmava erroneamente que `process-cancellation` já tinha import Stripe — código real NÃO tem | Implementador pularia import → `ReferenceError` em runtime |
| 157 | Variável `voidResult` usada na seção 5.4 (Gap 148) nunca é declarada | `ReferenceError` ao atribuir resultado do void de fatura paga |
| 158 | Gap 147 (partial unique index) não está na seção 3 "Estrutura de Dados" | Migração incompleta → sem proteção DB contra duplicatas prepaid |
| 159 | `send-invoice-notification` — modificações para Gaps 145/155 sem código explícito | Implementador não sabe ONDE/COMO modificar os CTAs no switch |
| 160 | Gap 91 ausente da numeração (v2.1 pula de 90 para 92) | Confusão na contagem total de gaps |
| 161 | Apêndice A sem seções v2.5, v2.6, v2.7 — Gaps 126-149 sem documentação tabular | Implementadores perdem contexto/rationale de 24 correções |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.
Prioridade zero: corrigir Gaps 103-106 + 115 no webhook existente.
