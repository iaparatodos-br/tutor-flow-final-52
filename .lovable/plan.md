

# Plano v5.26 — Concluído

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para v5.26 com todas as correções aplicadas.

## Próximo passo: Implementação da Fase 0 (8 itens críticos)

| # | Descrição | Tipo |
|---|-----------|------|
| #87 | webhook-stripe-connect handlers `invoice.*` nunca encontram faturas internas | Reconciliação |
| #155 | check-overdue-invoices: guard clause no UPDATE | Race Condition |
| #156 | auto-verify-pending-invoices: guard clause no UPDATE | Race Condition |
| #158 | verify-payment-status: guard clause no UPDATE | Race Condition |
| #160 | webhook-stripe-connect: verificação payment_origin nos handlers de falha | Proteção Manual |
| #169 | webhook + cancel-payment-intent: status 'paid' vs 'paga' (5 locais) | Padronização |
| #170 | change-payment-method: bypass de autorização | Segurança |
| #175 | create-payment-intent-connect: SEM autenticação | Segurança |
