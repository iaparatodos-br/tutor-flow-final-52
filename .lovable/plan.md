

# Auditoria v3.2 — 1 Componente Frontend Ausente

## Resultado

O plano v3.2 está completo para backend (edge functions, RPCs, cron jobs). Encontrei **1 componente frontend ausente** da tabela de migração.

---

## Gap: `src/components/Calendar/CalendarView.tsx` ausente da tabela do Passo 8

Este componente usa `moment().format()` em ~5 locais para formatar datas (linhas 185, 261, 302, 346):

```typescript
moment(start).format('HH:mm')
moment(selectedEvent.start).format('dddd, DD/MM/YYYY')
```

`moment()` usa o timezone local do browser por padrão, o que é o comportamento desejado pela regra do plano ("cada componente usa o timezone do utilizador logado"). Porém, o componente deveria ser listado na tabela de migração para ser migrado das funções `moment` para o utilitário `timezone.ts` refatorado — consistente com o objetivo de substituição progressiva do `moment.js` mencionado no Passo 7.

**Ação**: Adicionar à tabela do Passo 8 (linha ~568) e à Seção 3 (linha ~641):

| Arquivo | Problema |
|---|---|
| `src/components/Calendar/CalendarView.tsx` | ~5x `moment().format()` sem timezone explícito — migrar para utilitário timezone-aware |

---

## Componentes Verificados e Confirmados SEM Gap

| Componente | Razão para exclusão |
|---|---|
| `ExpenseModal.tsx` | Usa `format(parse('yyyy-MM-dd', ...))` — apenas reformatação de string de data, sem conversão de timezone |
| `ClassForm/ClassForm.tsx` | Mesmo padrão de `format(parse(...))` — sem impacto de timezone |
| `SecurityMonitoringDashboard.tsx` | Componente admin/debug, similar ao `DevValidation.tsx` já excluído |

## Verificações de Backend Confirmadas (Sem Gaps)

- 11 edge functions com formatação de data: todas cobertas (5.1.1–5.1.12)
- 5x `toISOString().split('T')[0]` de negócio: todas cobertas
- 7 RPCs com `CURRENT_DATE`: todas cobertas (5.3.1–5.3.7)
- `check-overdue-invoices` overdue + upcoming: coberto (5.2 + nota)
- `validate-payment-routing`: corretamente excluído (debug)

---

## Alteração Proposta

Adicionar `CalendarView.tsx` à tabela do Passo 8 e à Seção 3. Manter versão **v3.2** (correção menor de documentação).

