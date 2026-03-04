

# Auditoria das Sugestões do Gemini para o Plano de Testes

## Verificação Ponto a Ponto

### Sugestões VÁLIDAS (a incorporar)

**1. Erro matemático no item 5.2.2** — CONFIRMADO.
Em março, NY está em EDT (UTC-4). Às 03:00 UTC = 23:00 NY do dia anterior, não 00:00 NY. A descrição atual está errada.

**2. `check-overdue-invoices` (Seção 5.4)** — VÁLIDO.
O código em `check-overdue-invoices/index.ts` (L80-85) já usa `getTodayInTimezone(teacherTz)` para comparar com `due_date`. Testar a fronteira de dia é importante para garantir que faturas não são marcadas como vencidas prematuramente.

**3. `end-recurrence` e `materialize-virtual-class` (Seção 8.5)** — VÁLIDO.
Ambas as Edge Functions já têm lógica timezone-aware (`localDateToUtcMidnight` em end-recurrence L19-54, `getNowInTimezone` em materialize L20-54). Testar estes cenários de fronteira é importante.

**4. Backend constraint em `request-class` (Seção 8.3.3)** — PARCIALMENTE VÁLIDO.
O código em `request-class/index.ts` (L177-189) valida working_hours no fuso do professor mas apenas loga um aviso, não bloqueia. O teste deve refletir este comportamento real (soft check, não hard block).

**5. DST na materialização de aulas recorrentes (8.2.3)** — VÁLIDO.
O plano atual cobre DST superficialmente. Adicionar um teste explícito para verificar que aulas virtuais geradas pelo frontend mantêm a hora local após cruzar a fronteira do DST.

**6. Hora inexistente durante DST (4.7)** — VÁLIDO.
`fromZonedTime` do `date-fns-tz` faz o shift automaticamente, mas vale documentar o comportamento esperado.

### Sugestões PARCIALMENTE VÁLIDAS (já cobertas pelo código)

**7. Dashboard financeiro** — O `Dashboard.tsx` (L76) já usa `startOfMonthTz(new Date(), userTimezone)` para calcular receita mensal. O código está correto, mas adicionar um teste documental é útil.

**8. Stripe webhooks** — BAIXO VALOR. Timestamps UNIX são inerentemente UTC. Os webhooks processam eventos sem conversão de fuso — atualizam status de faturas que já foram criadas com datas corretas. Não há risco real aqui.

## Plano de Alteração

Atualizar `docs/timezone-test-plan.md` com:

1. **Corrigir 5.2.2**: `03:00 UTC (23:00 NY, ainda dia 09/03)` e `due_date = '2026-03-16'`
2. **Adicionar 5.4**: Testes de `check-overdue-invoices` com fronteira de dia timezone-aware
3. **Adicionar 4.7**: Teste de hora inexistente durante DST (Spring Forward)
4. **Adicionar 7.6**: Teste de agregações do Dashboard com `startOfMonthTz`
5. **Expandir 8.2** com item 8.2.3: DST na materialização de aulas virtuais
6. **Adicionar 8.3.3**: Validação cross-timezone de working_hours no backend
7. **Adicionar 8.5**: Testes de `end-recurrence` e `materialize-virtual-class`
8. **Atualizar checklist** (Seção 9) com os novos cenários

