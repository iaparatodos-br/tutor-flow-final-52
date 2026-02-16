


# Verificação Final v5.33 — 3 Novas Pontas Soltas em Funções de Pagamento

## Veredicto: Plano atualizado para v5.33 com 1 nova vulnerabilidade de segurança crítica.

---

## Auditoria Profunda Realizada (Funções de Criação de Pagamento)

Funções auditadas nesta rodada:
- `create-invoice/index.ts` (575 linhas) — FK joins + `.single()`
- `create-payment-intent-connect/index.ts` (659 linhas) — FK joins + `.single()` + sem guard de status
- `verify-payment-status/index.ts` (124 linhas) — sem auth + `.single()` + sem guard
- `check-overdue-invoices/index.ts` (152 linhas) — confirmação de #187
- `cancel-payment-intent/index.ts` (250 linhas) — confirmação de #188

### Novos Gaps Encontrados (#193-#195)

1. **#193 (MÉDIA)**: `create-invoice` usa FK join syntax em 2 locais (linhas 145-153 e 228-241) e `.single()` (linha 154), violando padrões sequenciais e de resiliência do projeto.

2. **#194 (MÉDIA)**: `create-payment-intent-connect` usa FK joins triplos (linhas 39-49) + `.single()` (linha 51) e **não verifica se a fatura está em status `pendente`** antes de gerar novo Payment Intent — pode gerar cobranças para faturas já pagas.

3. **#195 (ALTA → Fase 0)**: `verify-payment-status` não possui NENHUMA verificação de autenticação ou autorização. Qualquer requisição com `invoice_id` válido pode consultar e atualizar status de qualquer fatura. Vulnerabilidade de segurança crítica.

### Totais Atualizados (v5.33)
- 195 pontas soltas totais
- 18 duplicatas + 2 subsumidas
- 175 únicas
- 10 implementadas
- **165 pendentes**
- Fase 0: **10 itens** (+1: #195)

### Status Final
O documento está **pronto para execução da Fase 0** com 10 itens críticos.
