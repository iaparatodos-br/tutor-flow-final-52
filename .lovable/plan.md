
# Etapa 0.1 — Corrigir Status Mismatch pt-BR ✅
# Etapa 0.2 — Guard Clauses / Race Conditions ✅
# Etapa 0.3 — Webhook Resilience / HTTP 500 ✅
# Etapa 0.4 — Audit Logs Schema Mismatch ✅
# Etapa 0.5 — .single() → .maybeSingle() ✅
# Etapa 0.6 — FK Joins proibidos no Deno ✅
# Etapa 0.7 — Categoria A: Auth/IDOR ✅
# Etapa 0.8 — Categoria H: FK Cascade / Deletion Failures ✅
# Etapa 0.9 — Categoria I: Data Corruption ✅

## Etapa 0.9 — Resumo

Corrigidos 7 problemas de Data Corruption em 4 Edge Functions:

1. **#74 webhook-stripe-connect**: `invoice.payment_succeeded` preserva `payment_method` original
2. **#548 webhook-stripe-connect**: `payment_intent.succeeded` não apaga mais `boleto_url`/`pix_qr_code` (recibos)
3. **#202/#493 process-payment-failure-downgrade**: FK join removido, queries sequenciais
4. **#364 automated-billing**: Idempotência para faturas mensais duplicadas
5. **automated-billing validateTeacherCanBill**: variável `plan` corrigida
6. **#259 validate-payment-routing**: Não cria mais fatura REAL como teste

## Etapa 0.8 — Resumo

Corrigidos ~8 problemas de FK cascade/deletion em 4 Edge Functions que causavam falhas silenciosas ou erros 500 por violação de foreign key RESTRICT.

### Funções Corrigidas

1. **smart-delete-student** (3 correções)
   - `deleteDependentsCascade()`: Adicionada limpeza de `invoice_classes` (via participant_ids) ANTES de deletar `class_participants`
   - Full delete path: Mesma correção + limpeza de `invoice_classes` para participações diretas do aluno
   - Adicionada limpeza de `student_monthly_subscriptions` ANTES de deletar `teacher_student_relationships` (ambos os paths: unlink e delete)

2. **delete-dependent** (2 correções)
   - Removido comentário incorreto ("FK SET NULL" — era RESTRICT)
   - Adicionada limpeza de `invoice_classes` para participant_ids do dependente ANTES de deletar `class_participants`
   - Adicionada deleção explícita de `class_participants` antes de deletar dependente

3. **end-recurrence** (1 correção major)
   - Antes: deletava classes diretamente → FK violation em `class_participants`, `class_exceptions`, `invoice_classes`
   - Agora: cascade correto em 6 passos: `invoice_classes` → `class_exceptions` → `class_notifications` → `class_participants` → `classes`

4. **archive-old-data** (3 correções)
   - Removida seleção de `student_id` inexistente na tabela `classes`
   - Removidos FK joins (`class_participants(...)`, `class_reports(...)`) → substituídos por queries sequenciais
   - Cascade de deleção completo: `invoice_classes` → `class_report_photos` → `class_report_feedbacks` → `class_reports` → `class_notifications` → `class_exceptions` → `class_participants` → `classes`

### Ordem de Deleção Segura (Padrão)

```
invoice_classes (participant_id FK RESTRICT)
  → class_report_photos (report_id FK)
  → class_report_feedbacks (report_id FK)
  → class_reports (class_id FK)
  → class_notifications (class_id FK)
  → class_exceptions (original_class_id FK)
  → class_participants (class_id FK)
  → student_monthly_subscriptions (relationship_id FK)
  → teacher_student_relationships
  → classes
```

## Próximas Etapas Pendentes (Fase 0)

- **Categoria I**: Data Corruption (~6 itens)
- **Categoria J**: Integridade de dados (~8 itens)
- **Categoria K**: ANON_KEY inline / SQL injection em setup (~6 itens)
- **Categoria L**: Outros itens Fase 0 (~20 itens)
