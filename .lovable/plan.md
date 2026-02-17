



# Verificação Final v5.55 — 16 Novas Pontas Soltas (18ª Passagem: Gerenciamento de Alunos/Dependentes, Expiração de Subscrições, Arquivamento)

## Veredicto: Plano atualizado para v5.55 com 6 achados CRÍTICOS — smart-delete-student sem auth JWT (#384 SEGURANÇA), FK joins proibidos em smart-delete-student (#385) e process-expired-subscriptions (#393), cascade incompleta em smart-delete-student (#389/#390), tabela inexistente em handle-student-overage (#396).

---

## Auditoria de 18ª Passagem (Gerenciamento de Alunos/Dependentes, Expiração de Subscrições, Arquivamento)

Funções auditadas nesta rodada (18ª passagem):
- `smart-delete-student/index.ts` — SEM AUTH JWT (#384 ALTA SEGURANÇA), FK join 2x (#385 ALTA), cascade incompleta (#389/#390 ALTA)
- `create-student/index.ts` — `.single()` plan L297 (#391)
- `update-student-details/index.ts` — Sem novos achados
- `create-dependent/index.ts` — Sem novos achados
- `delete-dependent/index.ts` — Sem novos achados
- `update-dependent/index.ts` — Sem novos achados
- `process-expired-subscriptions/index.ts` — FK join proibido 2x (#393 ALTA), `.single()` free plan (#394)
- `handle-student-overage/index.ts` — tabela inexistente `student_overage_charges` (#396 ALTA), `.single()` (#395)
- `archive-old-data/index.ts` — coluna inexistente (#397), cascade incompleta (#398)
- `resend-student-invitation/index.ts` — `.single()` 3x (#399)
- `check-subscription-status/index.ts` — FK join 3x (#401), `.single()` (#402)

### Achados Críticos (→ Fase 0)

1. **#384 (SEGURANÇA: DELEÇÃO SEM AUTH)**: `smart-delete-student` aceita `teacher_id` do body sem validar contra JWT. Permite deleção não autorizada de alunos.
2. **#385 (FK JOIN PROIBIDO)**: `smart-delete-student` usa `classes!inner(teacher_id)` — falha por cache de schema.
3. **#389 (CASCADE INCOMPLETA — UNLINK)**: Deleta `class_participants` antes de `invoice_classes` — FK RESTRICT bloqueia.
4. **#390 (CASCADE INCOMPLETA — DELETE)**: Mesmo problema no caminho de deleção completa.
5. **#393 (FK JOIN PROIBIDO — EXPIRED)**: `process-expired-subscriptions` usa `subscription_plans!inner` e `profiles!user_id`.
6. **#396 (TABELA INEXISTENTE)**: `handle-student-overage` insere em `student_overage_charges` — não existe no schema.

### Totais Atualizados (v5.55)
- 399 pontas soltas totais | 369 únicas | **357 pendentes**
- Fase 0: **72 itens** (+6: #384, #385, #389, #390, #393, #396)
- **100% cobertura**: 75 funções auditadas (18 passagens)
