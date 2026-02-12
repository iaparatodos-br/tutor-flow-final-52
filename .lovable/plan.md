

# Atualizar hybrid-billing-implementation-plan.md

## O que sera feito

Substituir o conteudo completo do arquivo `docs/hybrid-billing-implementation-plan.md` (v3.10, 2939 linhas com regras antigas) pelo novo plano refatorado que ja esta documentado em `.lovable/plan.md`.

## Detalhes

O documento antigo (v3.10) contem 228 gaps baseados em premissas que nao se aplicam mais (Invoice Items no Stripe, reembolsos, process-class-billing, etc). O novo documento reflete as regras de negocio simplificadas:

- `charge_timing` como configuracao global do professor (prepaid/postpaid)
- `is_paid_class` como campo por aula no ClassForm
- Recorrencia bloqueada apenas para aulas pagas + prepaid
- Cancelamento simplificado (sem reembolsos, sem void de faturas Stripe)
- AmnestyButton com verificacao de faturamento
- Card informativo no BillingSettings
- Fase 1 (migracao SQL) ja executada

O conteudo do `.lovable/plan.md` sera copiado para `docs/hybrid-billing-implementation-plan.md`, adicionando versao (v4.0), data e status da Fase 1 como concluida.

## Secao Tecnica

- **Arquivo modificado**: `docs/hybrid-billing-implementation-plan.md`
- **Acao**: Substituicao completa do conteudo (2939 linhas antigas -> ~250 linhas novas)
- **Nenhum arquivo criado ou deletado**
- **Nenhuma alteracao de codigo** — apenas documentacao

