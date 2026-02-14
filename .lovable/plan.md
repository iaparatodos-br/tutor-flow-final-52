




# Revisao do Plano de Cobranca Hibrida v5.13

## Status Atual

O plano v5.13 documenta **131 pontas soltas** e **52 melhorias** no sistema de cobranca hibrida. A Fase 1 (migracao SQL) esta concluida. Fases 2-8 estao pendentes. A v5.13 adicionou 5 novas pontas soltas (#127-#131) em 4 funcoes ausentes da cobertura v5.12. Cobertura exaustiva confirmada com tabela de 30 funcoes.

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
- **#86**: payment_intent.succeeded apaga dados de boleto/PIX (confirmada M51)
- **#91**: Email "Pagar com Cartao" quando link e de boleto
- **#92**: automated-billing hardcoda boleto ignorando enabled_payment_methods
- **#93**: automated-billing nao salva payment_method na fatura
- **#98**: cancel-payment-intent status 'paid' vs 'paga' (confirmada M50 -- ambos branches)
- **#100**: AmnestyButton cancela faturas de todos os participantes em aulas de grupo
- **#102**: verify-payment-status e auto-verify-pending-invoices sem autenticacao
- **#105**: process-orphan-cancellation-charges assinatura RPC incorreta -- **NOVA v5.7**
- **#106**: process-orphan-cancellation-charges sem geracao de pagamento nem notificacao -- **NOVA v5.7**
- **#108**: automated-billing tradicional nunca envia notificacao ao aluno -- **NOVA v5.7**
- **#110**: handle-teacher-subscription-cancellation condiciona emails a RESEND_API_KEY inexistente -- **NOVA v5.8**
- **#112**: handle-teacher-subscription-cancellation nao cancela Payment Intents -- alunos pagam faturas canceladas -- **NOVA v5.8**
- **#114**: change-payment-method FK joins falham no Deno -- funcionalidade critica para pagamento -- **NOVA v5.9**
- **#115**: change-payment-method autorizacao guardiao/responsavel completamente quebrada -- **NOVA v5.9**
- **#117**: create-subscription-checkout nao cancela Payment Intents ao mudar plano -- **NOVA v5.9**
- **#119**: create-payment-intent-connect 3 FK joins -- ponto unico de falha para TODOS os pagamentos -- **NOVA v5.10**
- **#121**: generate-boleto-for-invoice FK joins + sem autenticacao -- exposicao de dados pessoais -- **NOVA v5.10**
- **#127**: smart-delete-student FK joins `classes!inner(teacher_id)` -- exclusao de aluno com aulas pendentes -- **NOVA v5.13**
- **#128**: smart-delete-student sem autenticacao -- qualquer usuario pode deletar alunos de outro professor -- **NOVA v5.13**
- **#129**: handle-plan-downgrade-selection audit_logs com colunas inexistentes -- logs silenciosamente perdidos -- **NOVA v5.13**

## Pontas Soltas MEDIAS/BAIXAS

- **#111**: process-expired-subscriptions FK joins -- **NOVA v5.8**
- **#113**: check-pending-boletos FK join e fallback hardcoded -- **NOVA v5.8**
- **#116**: check-subscription-status FK join em checkNeedsStudentSelection -- **NOVA v5.9**
- **#118**: validate-business-profile-deletion sem autenticacao -- **NOVA v5.9**
- **#120**: send-class-reminders FK joins implicitos -- **NOVA v5.10**
- **#122**: cancel-payment-intent nao verifica status PI antes de cancelar -- risco cobranca dupla -- **NOVA v5.10**
- **#123**: process-orphan-cancellation-charges FK join em query principal -- **NOVA v5.10**
- **#124**: automated-billing copia boleto_url para stripe_hosted_invoice_url em 3 locais -- emails com rotulo errado -- **NOVA v5.11**
- **#125**: create-payment-intent-connect referencia guardian_name inexistente -- codigo morto -- **NOVA v5.11**
- **#126**: check-overdue-invoices usa status 'overdue' em ingles -- inconsistencia com #104 -- **NOVA v5.11**
- **#130**: validate-payment-routing cria/deleta faturas reais no banco + FK join -- **NOVA v5.13**
- **#131**: cancel-subscription usa `.single()` em lookup de assinatura -- **NOVA v5.13**

## Confirmacoes da Auditoria Final v5.12

1. **verify-payment-status** usa `.single()` em lookup de fatura -- ja coberto por #102 (Batch 1)
2. **Cron jobs** (setup-billing-automation, setup-expired-subscriptions-automation) usam ANON_KEY para funcoes com verify_jwt=true -- padrao fragil mas funcional. Recomendacao: adicionar `verify_jwt = false` em config.toml para `automated-billing` e `process-expired-subscriptions`.
3. **webhook-stripe-subscriptions** segue padroes ja documentados (#49, #76, #77) -- extensoes naturais, nenhuma nova ponta necessaria.

## Roadmap de Implementacao (6 batches)

| Batch | Descricao | Pontas Chave |
|-------|-----------|--------------|
| 1 | Financial Criticals (Idempotency, runtime checks, service_role auth, webhook reconciliation) | #80, #81, #87, #95, #96, #102, #104, #109, #115, #128, M35 |
| 2 | HTTP Status standardization (200+success:false) + Auth | #72, #76, #83, #118, #121, M32 |
| 3 | Notifications and Status translations + Audit fixes | #32, #39, #91, #98, #99, #107, #108, #110, #126, #129, M33, M36, M39, M46, M50 |
| 4 | Data/Schema integrity + automated-billing fixes | #85, #86, #88, #92, #93, #94, #106, #112, #117, #122, #124, M34, M37, M38, M48, M51 |
| 5 | FK Join refactoring + validation | #57, #58, #52, #69, #103, #105, #111, #113, #114, #116, #119, #120, #123, #127, #131, M40, M41 |
| 6 | Performance/Stripe optimizations + UI fixes | #75, #89, #97, #100, #101, #125, #130, M31, M42, M43, M44, M45, M47, M49, M52 |

## Documentos Relacionados

- Plano completo: `docs/hybrid-billing-implementation-plan.md`
- Detalhes tecnicos: `docs/hybrid-billing-implementation-plan.md` (secoes por fase)
