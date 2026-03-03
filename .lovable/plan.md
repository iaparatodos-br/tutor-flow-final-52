# Plano v3.4 — Correções Gemini Aplicadas

As 3 correções do Gemini foram incorporadas ao `docs/timezone-multi-support-implementation-plan.md` (v3.4):

1. ✅ **Input Parsing (v3.4)**: Nota explícita sobre `zonedTimeToUtc` em `ClassForm.tsx`, `Agenda.tsx`, `ClassExceptionForm.tsx`, `FutureClassExceptionForm.tsx`
2. ✅ **Sweeper auto-corretivo (v3.4)**: RPC `get_relationships_to_bill_now` usa `>= 1` + `NOT EXISTS` para resiliência
3. ✅ **RRule/DST (v3.4)**: Nota técnica sobre drift de DST coberto pelo input parsing + migração de componentes
4. ✅ **Riscos atualizados**: 2 novos riscos adicionados à Seção 4

O plano está pronto para implementação. Próximo passo: Passo 1 (migração DB) + Passo 7 (`date-fns-tz`).
