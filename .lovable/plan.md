

# Avaliacao dos 5 Pontos do Gemini vs. Plano v3.5

## Resultado: 2 pontos merecem notas arquiteturais. 3 pontos ja estao cobertos ou nao se aplicam.

---

### Ponto 1: Wrappers para `startOfMonth`/`isToday` do date-fns — PARCIALMENTE VALIDO

O Gemini aponta que funcoes nativas do `date-fns` (`startOfMonth`, `isToday`, `startOfDay`) operam no timezone do browser. Os **componentes individuais** que usam esses padroes (Dashboard.tsx, Financeiro.tsx, StudentDashboard.tsx) ja estao na tabela de migracao do Passo 8 (linhas 769-771).

O que **falta** e uma **regra arquitetural explicita** no Passo 8 que proiba o uso direto dessas funcoes e mande criar wrappers timezone-aware em `src/utils/timezone.ts`.

**Acao**: Adicionar uma nota arquitetural ao Passo 8 com a diretriz: "Proibido usar `startOfMonth`, `startOfDay`, `endOfMonth`, `isToday`, `isSameDay` do date-fns diretamente. Criar wrappers em `src/utils/timezone.ts` usando `toZonedTime` do date-fns-tz para garantir que a matematica de datas ocorra no fuso do perfil."

**Status**: ✅ Aplicado no plano v3.6.

---

### Ponto 2: `end-recurrence` — JA COBERTO

O Gemini sugere adicionar `end-recurrence` ao plano. **Ja esta coberto** desde a v3.5:
- Passo 5.1.13 (linhas 660+ do documento) detalha exatamente esta correcao
- Linha 864 da tabela de arquivos impactados
- Linha 896 na tabela de riscos
- Item 14 da sequencia de execucao

**Veredicto**: Nenhuma acao necessaria.

---

### Ponto 3: `process-expired-subscriptions` — NAO SE APLICA

O Gemini assume que o campo e do tipo `DATE`. Confirmei no codigo (linha 42 do `process-expired-subscriptions/index.ts`):

```typescript
.lt('current_period_end', now.toISOString())
```

O campo `current_period_end` e `timestamp with time zone` (timestamptz), **nao** `DATE`. E um instante absoluto definido pelo Stripe. A comparacao `.lt(timestamptz, timestamptz)` e imune a timezone.

A classificacao "Baixo - sem acao" (linha 933 do plano) esta **correta**.

**Veredicto**: Nenhuma acao necessaria.

---

### Ponto 4: `DEFAULT CURRENT_DATE` no Schema — COBERTO INDIRETAMENTE

Encontrei 2 arquivos de migracao com `DEFAULT CURRENT_DATE`:

1. `starts_at DATE NOT NULL DEFAULT CURRENT_DATE` em `subscription_students` — o `useMonthlySubscriptions.ts` ja envia `starts_at` explicitamente (linha 781 do plano). Apos a migracao deste hook (item ja listado), o default nunca sera usado.

2. `p_reference_date DATE DEFAULT CURRENT_DATE` nas RPCs `get_billing_cycle_dates` e `count_completed_classes_in_billing_cycle` — ambas ja estao cobertas no Passo 5.3 (receberao `p_timezone` e o caller passara a data explicita).

**Veredicto**: Os casos concretos ja sao resolvidos pelos passos existentes. Nao justifica um novo passo de auditoria.

---

### Ponto 5: Formatacao de campos `date` com timezone causa off-by-one — PARCIALMENTE VALIDO

O Gemini aponta: `new Date('2026-03-10')` cria meia-noite UTC; formatar com `timeZone: 'America/Sao_Paulo'` (UTC-3) recua 3h e exibe **09/03/2026**. Confirmei no codigo atual de `send-invoice-notification` (linha 190):

```typescript
const formattedDueDate = new Date(invoice.due_date).toLocaleDateString("pt-BR", {
  timeZone: "America/Sao_Paulo", // BUG: recua 1 dia para fusos negativos
});
```

O plano **reconhece** o problema (linha 811: "tratar `date` offset") mas **nao define uma regra explicita** de como tratar campos `date`. A memory `constraints/database-date-timezone-rendering` documenta o risco, mas o plano nao traduz isso numa diretriz concreta.

**Acao**: Adicionar uma regra arquitetural ao Passo 8 e ao Passo 5.1: "Campos do tipo `date` (sem hora) como `due_date`, `starts_at`, `expense_date`, `birth_date` NUNCA devem ser convertidos para `Date` e formatados com `timeZone`. Devem ser parseados como string (`split('-')`) e montados localmente, ou usar `parseISO` do date-fns (que trata como data local, sem offset)."

**Status**: ✅ Aplicado no plano v3.6.

---

## Resumo de Alteracoes ao Plano v3.5 → v3.6

| Alteracao | Tipo | Secao | Status |
|---|---|---|---|
| Regra arquitetural: proibir `startOfMonth`/`isToday` nativos do date-fns; exigir wrappers timezone-aware | Nota tecnica | Passo 8 | ✅ |
| Regra arquitetural: campos `date` nunca formatados com `timeZone`; usar parse de string | Nota tecnica | Passos 5.1 e 8 | ✅ |

Nenhum novo componente, edge function ou RPC a adicionar. Apenas duas diretrizes de implementacao para guiar os desenvolvedores durante a migracao.
