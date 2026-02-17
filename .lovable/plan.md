


# Verificação Final v5.47 — 7 Novas Pontas Soltas (10ª Passagem: Análise Cruzada — Billing Automation, Materialização, Recorrência e Exceções)

## Veredicto: Plano atualizado para v5.47 com 3 achados CRÍTICOS — FK joins em automated-billing, is_paid_class não herdado em materialização, e idempotência de mensalidades.

---

## Auditoria de 10ª Passagem (Análise Cruzada — Fluxos de Aula e Faturamento)

Funções auditadas nesta rodada (10ª passagem — análise cruzada):
- `automated-billing/index.ts` (1057 linhas) — FK joins proibidos em 4 locais (#300), sem idempotência para mensalidades (#303), invoca payment-intent sem auth (#304)
- `materialize-virtual-class/index.ts` (376 linhas) — NÃO herda `is_paid_class` do template (#301)
- `request-class/index.ts` (223 linhas) — NÃO define `is_paid_class` (#302)
- `end-recurrence/index.ts` (133 linhas) — `.single()` L50, sem cleanup de FK antes de delete (#305, confirma #181)
- `create-invoice/index.ts` (575 linhas) — FK joins confirmados (#291), `.single()` confirmado (#292)
- `manage-class-exception/index.ts` (157 linhas) — `.single()` para profile L47 (#306)
- `manage-future-class-exceptions/index.ts` (220 linhas) — `.single()` para profile L53 (#306)
- `send-class-request-notification/index.ts` (210 linhas) — `.single()` em teacher/student/dependent lookups (padrão sistêmico)
- `send-class-confirmation-notification/index.ts` (212 linhas) — `.single()` em student/dependent/relationship lookups (padrão sistêmico)

### Achados Críticos (→ Fase 0)

1. **#300 (ALTA)**: `automated-billing` — Usa FK join syntax (`profiles!teacher_id`, `profiles!student_id`, `classes!inner`, `subscription_plans!inner`) em 4 locais. Viola constraint documentada de queries sequenciais. Risco de falha silenciosa por schema cache do Deno.

2. **#301 (ALTA)**: `materialize-virtual-class` — NÃO herda `is_paid_class` do template na inserção (L252-263). Campo default é `true`, então aulas de reposição/gratuitas se tornam cobradas após materialização.

3. **#303 (ALTA)**: `automated-billing` — Sem guarda de idempotência para faturamento de mensalidade. Se cron executa 2x no mesmo dia, cria faturas duplicadas. O valor base da mensalidade é SEMPRE adicionado sem verificar se já existe fatura `monthly_subscription` para o ciclo atual.

### Achados Médios

4. **#302 (MÉDIA)**: `request-class` — Não define `is_paid_class` na criação da aula (L135-146). Default `true` pode gerar cobranças indesejadas no modelo prepaid. Confirma memória #138.

5. **#304 (MÉDIA)**: `automated-billing` — Invoca `create-payment-intent-connect` (L522-529) sem auth header. Função destino espera JWT de usuário para validação (#175). Funciona por service_role implícito mas é inconsistente.

6. **#305 (MÉDIA)**: `end-recurrence` — L50 usa `.single()` para template. L67-73 deleta classes sem limpar `class_participants` e `class_exceptions` primeiro. FK RESTRICT pode causar falha de delete. Confirma #181.

### Achados Baixos

7. **#306 (BAIXA)**: `manage-class-exception` (L47) e `manage-future-class-exceptions` (L53) usam `.single()` para profile lookup. Menor risco pois profile do usuário autenticado deveria sempre existir.

### Totais Atualizados (v5.47)
- 306 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 10 confirmações
- 276 únicas
- 10 implementadas + 2 confirmações de memória
- **264 pendentes**
- Fase 0: **41 itens** (+3: #300, #301, #303)
- **100% cobertura**: 75 funções auditadas (10 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (41 itens críticos), seguido por batch fix de `.single()` em funções de notificação (~30 substituições) e utilitários (~15 substituições). Os 3 novos achados críticos afetam diretamente a integridade financeira: materialização de aulas gratuitas como pagas (#301), faturas mensais duplicadas (#303), e instabilidade em produção por FK joins (#300).
