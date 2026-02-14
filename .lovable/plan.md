

# Revisao do Plano de Cobranca Hibrida v5.8

## Status Atual

O plano v5.8 documenta **113 pontas soltas** e **46 melhorias** no sistema de cobranca hibrida. A Fase 1 (migracao SQL) esta concluida. Fases 2-8 estao pendentes.

## Pontas Soltas CRITICAS (risco financeiro ou de dados)

1. **#68**: Mensalidade ignora cancelamentos com cobranca (receita perdida)
2. **#74**: Webhook sobrescreve payment_method (dados corrompidos)
3. **#80**: Service role key como Bearer token (pode falhar a qualquer momento)
4. **#81**: Race condition overdue vs paid (fatura paga revertida)
5. **#87**: Handlers invoice.* nunca encontram faturas internas (reconciliacao quebrada) -- **MAIS CRITICA**
6. **#94**: Mensalidade sem geracao de pagamento Stripe (faturas sem mecanismo de pagamento)
7. **#95**: check-overdue-invoices race condition paid→overdue (codigo exato sem guard clause)
8. **#96**: process-cancellation service_role auth falha (receita cancelamentos perdida)
9. **#104**: Webhook handlers usam status em ingles ('paid', 'overdue') -- faturas pagas nao aparecem no sistema -- **NOVA v5.7**
10. **#109**: process-payment-failure-downgrade parametros incorretos para smart-delete-student -- alunos nunca removidos -- **NOVA v5.8**

## Pontas Soltas ALTAS

- **#57/#58**: FK joins no create-invoice e automated-billing
- **#59**: process-cancellation sem is_paid_class
- **#71**: check-overdue-invoices sem tracking
- **#85**: payment_method ausente no automated-billing
- **#86**: payment_intent.succeeded apaga dados de boleto/PIX
- **#91**: Email "Pagar com Cartao" quando link e de boleto
- **#92**: automated-billing hardcoda boleto ignorando enabled_payment_methods
- **#93**: automated-billing nao salva payment_method na fatura
- **#98**: cancel-payment-intent status 'paid' vs 'paga' (faturas pagas manualmente ficam invisiveis)
- **#100**: AmnestyButton cancela faturas de todos os participantes em aulas de grupo
- **#102**: verify-payment-status e auto-verify-pending-invoices sem autenticacao
- **#105**: process-orphan-cancellation-charges assinatura RPC incorreta -- **NOVA v5.7**
- **#106**: process-orphan-cancellation-charges sem geracao de pagamento nem notificacao -- **NOVA v5.7**
- **#108**: automated-billing tradicional nunca envia notificacao ao aluno -- **NOVA v5.7**
- **#110**: handle-teacher-subscription-cancellation condiciona emails a RESEND_API_KEY inexistente -- **NOVA v5.8**
- **#112**: handle-teacher-subscription-cancellation nao cancela Payment Intents -- alunos pagam faturas canceladas -- **NOVA v5.8**

## Roadmap de Implementacao (6 batches)

| Batch | Descricao | Pontas Chave |
|-------|-----------|--------------|
| 1 | Financial Criticals (Idempotency, runtime checks, service_role auth, webhook reconciliation) | #80, #81, #87, #95, #96, #102, #104, #109, M35 |
| 2 | HTTP Status standardization (200+success:false) | #72, #76, #83, M32 |
| 3 | Notifications and Status translations | #32, #39, #91, #98, #99, #107, #108, #110, M33, M36, M39, M46 |
| 4 | Data/Schema integrity + automated-billing fixes | #85, #86, #88, #92, #93, #94, #106, #112, M34, M37, M38 |
| 5 | FK Join refactoring + validation | #57, #58, #52, #69, #103, #105, #111, #113, M40, M41 |
| 6 | Performance/Stripe optimizations + UI fixes | #75, #89, #97, #100, #101, M31, M42, M43, M44, M45 |

## Documentos Relacionados

- Plano completo: `docs/hybrid-billing-implementation-plan.md`
- Detalhes tecnicos: `docs/hybrid-billing-implementation-plan.md` (secoes por fase)
