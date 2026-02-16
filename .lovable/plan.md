

# Correção Final v5.26 — Completude do Documento

## Problema

O documento `docs/hybrid-billing-implementation-plan.md` tem 2 lacunas que dificultam a implementação:

1. **19 itens sem descrição**: Os itens #152, #157, #159, #161-#165, #167-#168, #171-#174, #176-#180 estão na tabela de fases (linha 294) mas não possuem seção descritiva no documento. As descrições só existiam no `.lovable/plan.md`.

2. **6 duplicatas internas não marcadas** nos itens #86-#147:
   - #59 = #5.1 (process-cancellation sem is_paid_class)
   - #107 = #5.1 (mesma coisa, descrita novamente)
   - #92 = #60 = #31 (automated-billing hardcoded boleto — 3 entradas para o mesmo bug)
   - #93 = #85 = #48 (automated-billing sem payment_method — 3 entradas)

## Ações

### 1. Adicionar seção "Pontas Soltas v5.18-v5.23 (#152-#180)" ao documento

Inserir após a seção de Itens Implementados (linha ~360) com descrições concisas para os 19 itens faltantes, agrupados por padrão:

**FK Joins (Fase 4/5/8):**
- #163: automated-billing query principal usa FK joins `teacher:profiles!teacher_id` (mesmo que #58, mas na query de billing_day)
- #164: create-invoice FK join para relationship (refinamento de #57)
- #165: create-invoice FK joins aninhados para classes (refinamento de #38)
- #171: generate-boleto-for-invoice FK joins (mesmo que #103)
- #172: automated-billing FK join diagnóstico em old confirmed classes (mesmo que #69)
- #176: create-payment-intent-connect FK joins triplos (mesmo que #119)
- #179: change-payment-method FK joins + `.single()` (mesmo que #114)
- #180: automated-billing FK joins na query principal (mesmo que #58)

**`.single()` para `.maybeSingle()` (Fase 5/6/8):**
- #152: process-orphan-cancellation-charges verificação de erro após filtragem
- #157: verify-payment-status `.single()` em lookup de fatura
- #159: send-invoice-notification `.single()` em 3 lookups (mesmo que #53+#73)
- #161: process-cancellation `.single()` na linha 107 (lookup de dependente, mesmo que #84)
- #162: create-invoice `.single()` nas linhas 154 e 382 (mesmo que #78)
- #167: handle-student-overage `.single()` em lookup
- #168: send-cancellation-notification `.single()` em 4 lookups
- #173: webhook-stripe-connect `.single()` em 3 handlers (mesmo que #49+#64)
- #174: cancel-payment-intent `.single()` em lookup
- #177: create-payment-intent-connect `.single()` cascata (subsume #153)

**Semântico (Fase 8):**
- #178: check-overdue-invoices usa coluna class_id para armazenar invoice_id (mesmo que #41)

### 2. Marcar 6 duplicatas adicionais no índice

| Duplicata | Original | Descrição |
|-----------|----------|-----------|
| #59 | #5.1 | process-cancellation sem is_paid_class (Fase 6 via #5.1) |
| #107 | #5.1 | process-cancellation sem is_paid_class (Fase 6 via #5.1) |
| #92 | #60 | automated-billing hardcoded boleto (Fase 4 via #60) |
| #93 | #85 | automated-billing sem payment_method (Fase 8 via #85) |
| #171 | #103 | generate-boleto FK joins (já coberta) |
| #178 | #41 | check-overdue class_notifications semântica (já coberta) |

### 3. Atualizar totais

```text
Pontas Soltas Totais:       180
  Duplicatas anteriores:      4 (#81, #95, #96, #166)
  Novas duplicatas:           6 (#59, #92, #93, #107, #171, #178)
  Total duplicatas:          10
  Únicas:                   170
  Implementadas:             12
  Pendentes:               158
```

### 4. Atualizar cabeçalho e histórico de versões

- Versão: v5.26
- Únicas: 170 (era 176)
- Pendentes: 158 (era 164)
- Adicionar entrada no histórico

## Seção Técnica

### Arquivos a modificar
- `docs/hybrid-billing-implementation-plan.md`: Adicionar seção de descrições #152-#180, marcar duplicatas, atualizar totais

### Verificação final de fluxos
Todos os 5 fluxos end-to-end continuam 100% cobertos. Nenhuma ponta solta genuinamente nova foi identificada — todas as 6 "novas duplicatas" são repetições de bugs já documentados e atribuídos a fases.

### Impacto na implementação
As duplicatas reduzem o trabalho real de 164 para **158 itens pendentes**. A Fase 0 permanece com 8 itens críticos inalterados.
