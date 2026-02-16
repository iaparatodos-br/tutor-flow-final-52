



# Verificação Final v5.39 — 6 Novas Pontas Soltas em Cancelamento, Pagamento e Validação

## Veredicto: Plano atualizado para v5.39 com 2 novos bugs críticos (identity spoofing + status 'paid' recorrente) e reclassificação de 4 findings anteriores.

---

## Auditoria de 2ª Passagem (Funções Financeiras Core + Cancelamento)

Funções auditadas nesta rodada (2ª passagem — análise mais profunda):
- `process-cancellation/index.ts` (500 linhas) — **Identity spoofing: aceita `cancelled_by` do body sem JWT** (#231)
- `manage-class-exception/index.ts` (157 linhas) — OK (auth + ownership robusto, fix #136 aplicado)
- `manage-future-class-exceptions/index.ts` (220 linhas) — OK (auth + ownership robusto, fix #137 aplicado)
- `request-class/index.ts` (223 linhas) — OK (auth + ownership + dependent validation)
- `verify-payment-status/index.ts` (124 linhas) — **Sem ownership validation: IDOR** (#232)
- `create-invoice/index.ts` (575 linhas) — **FK joins aninhados** (#233), `.single()` em relationship (já coberto)
- `cancel-payment-intent/index.ts` (250 linhas) — **CONFIRMA #199: status 'paid' em inglês** (#234)
- `create-payment-intent-connect/index.ts` (659 linhas) — OK (FK joins explicitamente nomeados, validação robusta)
- `customer-portal/index.ts` (75 linhas) — OK (auth + Stripe lookup by email)
- `send-student-invitation/index.ts` (158 linhas) — **Reclassificação**: verify_jwt=true no gateway (#236)
- `validate-payment-routing/index.ts` (321 linhas) — **Cria faturas REAIS em produção** (#235)
- `send-class-confirmation-notification/index.ts` (212 linhas) — 3x `.single()` (já coberto genericamente por #230)

### Novos Gaps Encontrados (#231-#236)

1. **#231 (ALTA → Fase 0)**: `process-cancellation` aceita `cancelled_by` do body da request sem extrair o usuário do JWT. Identity spoofing: User A pode cancelar aulas como User B.

2. **#232 (MÉDIA)**: `verify-payment-status` não verifica ownership. Qualquer usuário autenticado pode consultar/atualizar status de qualquer fatura (IDOR).

3. **#233 (BAIXA)**: `create-invoice` usa FK joins aninhados `classes!inner → class_services` em class_participants. Tratamento de rollback presente, mas viola padrão.

4. **#234 (ALTA → Fase 0)**: `cancel-payment-intent` usa `status: 'paid'` em inglês (linhas 111, 172). CONFIRMA que o padrão #199 é recorrente. Faturas pagas manualmente ficam invisíveis.

5. **#235 (MÉDIA)**: `validate-payment-routing` cria faturas REAIS em produção como "teste" (linhas 245-264), com deleção por match de descrição que pode deletar faturas de usuários.

6. **#236 (CORREÇÃO)**: #218, #223, #227, #228 reclassificados de "sem auth" para "sem ownership". O gateway Supabase aplica verify_jwt=true por padrão.

### Totais Atualizados (v5.39)
- 236 pontas soltas totais
- 18 duplicatas + 2 subsumidas
- 216 únicas
- 10 implementadas
- **206 pendentes**
- Fase 0: **19 itens** (+2: #231, #234)
- **100% cobertura**: Todas as 75 funções auditadas (2ª passagem em 12 funções core)

### Status Final
O documento está **pronto para execução da Fase 0** com 19 itens críticos. A 2ª passagem confirmou que o bug de status em inglês (#199/#234) é um padrão recorrente que precisa ser corrigido em TODAS as funções que escrevem status de faturas.
