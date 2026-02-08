# Plano de Implementação: Cobrança Híbrida — Status Atual

> **Versão do Documento**: 3.1 (177 gaps resolvidos)
> **Última Atualização**: 2026-02-08
> **Status**: ✅ Aprovado - Pronto para Implementação

---

## Resumo Executivo

O plano de implementação da cobrança híbrida (pré-paga / pós-paga) foi revisado extensivamente até a versão 3.1, resolvendo **177 gaps técnicos** e **9 pontas soltas críticas** identificadas na última auditoria.

### Documento Principal

📄 **Arquivo completo**: `docs/hybrid-billing-implementation-plan.md`

---

## Próximos Passos

### Fase 0: Correções Críticas no Webhook Existente (URGENTE)
- [ ] Gaps 82, 83, 86, 98, 99, 103-106, 114, 115
- [ ] Deploy e teste ANTES de qualquer nova feature

### Fase 1: Migração de Banco de Dados + i18n
- [ ] Migração SQL (`charge_timing`, `stripe_invoice_item_id`)
- [ ] Regenerar tipos TypeScript
- [ ] Traduções i18n (`billing.json`, `financial.json`)

### Fase 2: Frontend
- [ ] BillingSettings card
- [ ] Atualizar InvoiceTypeBadge (7 tipos)
- [ ] Refatorar Financeiro.tsx
- [ ] Corrigir canChangePaymentMethod em Faturas.tsx

### Fase 3-8: Ver documento completo

---

## Pontas Soltas v3.1 — Resolvidas

| # | Ponta Solta | Status |
|---|-------------|--------|
| 1 | Regenerar tipos após migração | ✅ Documentado no checklist |
| 2 | InvoiceTypeBadge com 7 tipos | ✅ Documentado na seção 4.4 |
| 3 | financial.json prepaidIndicator | ✅ Movido para Fase 1 |
| 4 | billing.json chargeTiming | ✅ Movido para Fase 1 |
| 5 | canChangePaymentMethod filtro | ✅ Apêndice C criado |
| 6 | CORS process-cancellation | ✅ Checklist + Fase 0 |
| 7 | voidResult declaração | ✅ Linha exata especificada |
| 8 | Fase 0 para webhook | ✅ Criada na seção 11 |
| 9 | Fluxo "Escolher Método" | ✅ Apêndice D criado |

---

## Referências Rápidas

- **Seção 11**: Sequência de implementação (agora com Fase 0)
- **Seção 13**: Checklist de deploy completo
- **Apêndice A**: Histórico de gaps (v1.0-v3.0)
- **Apêndice C**: Código de canChangePaymentMethod
- **Apêndice D**: Nota de compatibilidade do fluxo "Escolher Método"
