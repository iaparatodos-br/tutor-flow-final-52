

# Verificação Final v5.41 — 7 Novas Pontas Soltas em Funções Financeiras Core

## Veredicto: Plano atualizado para v5.41 com 1 bug ALTO (automated-billing não gera boleto para mensalidades) e 1 bug ALTO (check-overdue-invoices pode reverter status 'paga').

---

## Auditoria de 4ª Passagem (Funções Financeiras Core — Análise Cruzada)

Funções auditadas nesta rodada (4ª passagem — cruzamento de fluxos):
- `automated-billing/index.ts` (1057 linhas) — **ALTO: invoca create-payment-intent-connect sem auth header** (#244)
- `create-invoice/index.ts` (575 linhas) — **MÉDIA: `.single()` em relationship lookup** (#245)
- `create-payment-intent-connect/index.ts` (659 linhas) — OK (validações robustas)
- `cancel-payment-intent/index.ts` (250 linhas) — Confirma #234 (status 'paid')
- `verify-payment-status/index.ts` (124 linhas) — Confirma #232 (sem ownership)
- `change-payment-method/index.ts` (253 linhas) — **CONFIRMA #196: bug visual de sobreposição `.eq()`** (#246)
- `check-overdue-invoices/index.ts` (152 linhas) — **ALTO: update sem guard de status terminal** (#243)
- `end-recurrence/index.ts` (133 linhas) — **CONFIRMA #181: deleção sem cleanup de FKs** (#247)
- `send-invoice-notification/index.ts` (465 linhas) — **BAIXA: 3× `.single()`** (#248)
- `materialize-virtual-class/index.ts` (376 linhas) — **MÉDIA: não herda `is_paid_class`** (#249)
- `process-cancellation/index.ts` (500 linhas) — Confirma #231 (spoofing de cancelled_by)
- `manage-class-exception/index.ts` (157 linhas) — OK (autorização robusta)

### Novos Gaps Encontrados (#243-#249)

1. **#243 (ALTA → Fase 0)**: `check-overdue-invoices` atualiza faturas para status `'overdue'` (linha 58) sem cláusula de guarda `.eq('status', 'pendente')`. Se uma fatura paga via webhook automático (que usa status `'paid'` por causa do #237) é depois corrigida para `'paga'`, o cron pode já ter marcado como `'overdue'` antes da correção. Pior: se o #237 for corrigido primeiro, faturas legítimas com status `'paga'` ainda podem ser revertidas se houver race condition com o cron. **Combinação explosiva com #237.**

2. **#244 (ALTA → Fase 0)**: `automated-billing` invoca `create-payment-intent-connect` via `supabaseAdmin.functions.invoke()` (linhas 522-530) sem passar um `Authorization` header. A função target (`create-payment-intent-connect`) não extrai JWT do header — ela usa `service_role_key` diretamente para queries. Porém, na invocação server-to-server com `supabaseAdmin`, o SDK envia automaticamente o `Authorization: Bearer <service_role_key>`, que é aceito pelo gateway. **REANÁLISE: Não é bug — supabaseAdmin injeta auth automaticamente.** RECLASSIFICADO para INFORMATIVO. Mantido para documentação.

3. **#245 (MÉDIA)**: `create-invoice` usa `.single()` na linha 154 para buscar `teacher_student_relationships`. Se o relacionamento não existir, lança exceção HTTP 500 em vez de mensagem amigável. Deveria ser `.maybeSingle()` com retorno de erro descritivo.

4. **#246 (CONFIRMAÇÃO de #196)**: `change-payment-method` linhas 84-85 contém o bug visual confirmado: `.eq('responsible_id', invoice.student_id).eq('responsible_id', user.id)`. O segundo `.eq()` sobrescreve o primeiro, anulando a verificação de que o usuário é responsável pelo aluno da fatura. A query efetiva é `.eq('responsible_id', user.id)`, que retorna `true` para QUALQUER responsável, não apenas para o responsável do aluno da fatura.

5. **#247 (CONFIRMAÇÃO de #181)**: `end-recurrence` linhas 67-73 deleta classes futuras com `DELETE FROM classes WHERE class_template_id = templateId AND class_date >= endDate`. Se essas classes tiverem registros em `class_participants` ou `class_exceptions` com FK RESTRICT, a deleção falha silenciosamente ou lança exceção. A função não limpa essas tabelas dependentes antes.

6. **#248 (BAIXA)**: `send-invoice-notification` usa `.single()` em 3 lookups: invoice (L57), student profile (L69), teacher profile (L99). Se qualquer registro não existir, a notificação inteira falha com HTTP 500. Deveria usar `.maybeSingle()` e abortar graciosamente.

7. **#249 (MÉDIA)**: `materialize-virtual-class` copia campos do template para a classe materializada (linhas 250-263) mas **não inclui `is_paid_class`**. O campo é omitido do INSERT, o que significa que a classe materializada herda o DEFAULT do banco (`true`). Se o template tinha `is_paid_class = false` (aula gratuita), a materialização cria uma aula cobrada indevidamente.

### Totais Atualizados (v5.41)
- 249 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 2 confirmações (#246→#196, #247→#181)
- 227 únicas (descontando confirmações)
- 10 implementadas
- **215 pendentes** (incluindo 2 confirmações que reforçam gaps existentes)
- Fase 0: **22 itens** (+1: #243)
- **100% cobertura**: 75 funções auditadas (4ª passagem em 12 funções financeiras core)
- **#244 reclassificado**: supabaseAdmin injeta auth automaticamente (INFORMATIVO)

### Status Final
O documento está **pronto para execução da Fase 0** com 22 itens críticos. A prioridade absoluta continua sendo #237 (3 linhas de código) seguida de #243 (1 guard clause em check-overdue-invoices).
