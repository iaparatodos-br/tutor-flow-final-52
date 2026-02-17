


# Verificação Final v5.51 — 8 Novas Pontas Soltas (14ª Passagem: Análise Cruzada Profunda — Materialização, Deleção e Integração de Pagamento)

## Veredicto: Plano atualizado para v5.51 com 3 achados CRÍTICOS — create-payment-intent-connect sem NENHUMA autenticação permitindo IDOR (#339), materialize-virtual-class não copia is_paid_class causando cobranças fantasma em prepaid (#340), e smart-delete-student com cascata incompleta impedindo deleção de alunos já faturados (#342).

---

## Auditoria de 14ª Passagem (Análise Cruzada Profunda — Materialização, Deleção e Integração de Pagamento)

Funções auditadas nesta rodada (14ª passagem — análise cruzada profunda):
- `create-payment-intent-connect/index.ts` (659 linhas) — ZERO autenticação (#339 ALTA), FK joins (#332 confirma)
- `materialize-virtual-class/index.ts` (376 linhas) — não copia is_paid_class (#340 ALTA)
- `smart-delete-student/index.ts` (547 linhas) — cascata incompleta invoice_classes (#342), FK student_monthly_subscriptions (#343), .single() (#344)
- `automated-billing/index.ts` (1057 linhas) — boleto_url→stripe_hosted_invoice_url (#341), FK joins (confirma #300)
- `check-overdue-invoices/index.ts` (152 linhas) — status 'overdue' inglês (confirma #278), dedup quebrada (confirma #308)
- `verify-payment-status/index.ts` (124 linhas) — sem auth (confirma #195)
- `end-recurrence/index.ts` (133 linhas) — SDK sem versão pinada (#346), FK cascade incompleta (confirma #181)
- `webhook-stripe-connect/index.ts` (560 linhas) — sem fallback stripe_invoice_id→payment_intent_id (#345 confirma memória)

### Achados Críticos (→ Fase 0)

1. **#339 (ALTA — IDOR CRÍTICO)**: `create-payment-intent-connect` NÃO possui nenhuma validação de autenticação. Qualquer chamador com a anon key pode gerar Payment Intents (boletos, PIX, cards) para QUALQUER invoice_id, expondo URLs de pagamento e dados financeiros. A função usa SERVICE_ROLE_KEY internamente, tornando-a completamente aberta.

2. **#340 (ALTA — COBRANÇAS FANTASMA)**: `materialize-virtual-class` L252-263 NÃO copia o campo `is_paid_class` do template para a aula materializada. O default do banco é `true`. Para templates de aulas gratuitas/experimentais em modo prepaid, a aula materializada será marcada como paga incorretamente, podendo disparar faturamento imediato indevido.

3. **#342 (ALTA — DELEÇÃO QUEBRADA)**: `smart-delete-student` L245-253 deleta `class_participants` para dependentes SEM primeiro deletar `invoice_classes` que referenciam esses participantes via FK `invoice_classes_participant_id_fkey`. Para qualquer aluno já faturado, a deleção FALHA com erro de FK constraint, deixando o processo de exclusão incompleto.

### Achados Médios

4. **#341**: `automated-billing` L537 copia `boleto_url` para `stripe_hosted_invoice_url`, conflitando semântica e causando CTAs incorretos em notificações por email.
5. **#343**: `smart-delete-student` não deleta `student_monthly_subscriptions` antes de `teacher_student_relationships`. FK `student_monthly_subscriptions_relationship_id_fkey` impede a deleção para alunos com histórico de mensalidade.
6. **#344**: `smart-delete-student` L52, L89 usa `.single()` em lookups de `user_subscriptions` e `subscription_plans`. Crash se professor não tiver assinatura ativa.
7. **#345 (confirma memória)**: `webhook-stripe-connect` handlers de invoice.paid e invoice.payment_succeeded buscam APENAS por `stripe_invoice_id`. Faturas de aulas individuais (que só possuem `stripe_payment_intent_id`) ficam eternamente como 'pendente' mesmo após pagamento confirmado.

### Achados Baixos

8. **#346**: `end-recurrence` importa SDK como `@supabase/supabase-js@2` (sem versão pinada) enquanto o padrão do projeto é `@2.45.0`. Risco de incompatibilidade em runtime.

### Totais Atualizados (v5.51)
- 346 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 12 confirmações
- 316 únicas
- 10 implementadas + 2 confirmações de memória
- **304 pendentes**
- Fase 0: **53 itens** (+3: #339, #340, #342)
- **100% cobertura**: 75 funções auditadas (14 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (53 itens críticos), com destaque para o #339 (IDOR em create-payment-intent-connect) que é uma vulnerabilidade de segurança explorável AGORA por qualquer usuário anônimo. O #340 (is_paid_class não copiado) causa cobranças fantasma para aulas recorrentes materializadas por alunos. O #342 (cascata incompleta em smart-delete-student) impede a remoção de alunos que já foram faturados, afetando operações do dia-a-dia do professor.
