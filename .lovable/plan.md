


# Revisao do Plano de Cobranca Hibrida v5.5

## Status Atual

O plano v5.5 documenta **97 pontas soltas** e **41 melhorias** no sistema de cobranca hibrida. A Fase 1 (migracao SQL) esta concluida. Fases 2-8 estao pendentes.

## Pontas Soltas CRITICAS (risco financeiro ou de dados)

1. **#68**: Mensalidade ignora cancelamentos com cobranca (receita perdida)
2. **#74**: Webhook sobrescreve payment_method (dados corrompidos)
3. **#80**: Service role key como Bearer token (pode falhar a qualquer momento)
4. **#81**: Race condition overdue vs paid (fatura paga revertida)
5. **#87**: Handlers invoice.* nunca encontram faturas internas (reconciliacao quebrada) -- **MAIS CRITICA**
6. **#94**: Mensalidade sem geracao de pagamento Stripe (faturas sem mecanismo de pagamento) -- **NOVA**
7. **#95**: check-overdue-invoices race condition paid→overdue (codigo exato sem guard clause) -- **NOVA**
8. **#96**: process-cancellation service_role auth falha (receita cancelamentos perdida) -- **NOVA**

## Pontas Soltas ALTAS

- **#57/#58**: FK joins no create-invoice e automated-billing
- **#59**: process-cancellation sem is_paid_class
- **#71**: check-overdue-invoices sem tracking
- **#85**: payment_method ausente no automated-billing
- **#86**: payment_intent.succeeded apaga dados de boleto/PIX
- **#91**: Email "Pagar com Cartao" quando link e de boleto
- **#92**: automated-billing hardcoda boleto ignorando enabled_payment_methods -- **NOVA**
- **#93**: automated-billing nao salva payment_method na fatura -- **NOVA**

## Roadmap de Implementacao (6 batches)

| Batch | Descricao | Pontas Chave |
|-------|-----------|--------------|
| 1 | Financial Criticals (Idempotency, runtime checks, service_role auth, webhook reconciliation) | #80, #81, #87, #95, #96, M35 |
| 2 | HTTP Status standardization (200+success:false) | #72, #76, #83, M32 |
| 3 | Notifications and Status translations | #32, #39, #91, M33, M36, M39 |
| 4 | Data/Schema integrity + automated-billing fixes | #85, #86, #88, #92, #93, #94, M34, M37, M38 |
| 5 | FK Join refactoring + validation | #57, #58, #52, #69, M40, M41 |
| 6 | Performance/Stripe optimizations | #75, #89, #97, M31 |

## Documentos Relacionados

- Plano completo: `docs/hybrid-billing-implementation-plan.md`
- Detalhes tecnicos: `docs/hybrid-billing-implementation-plan.md` (secoes por fase)
