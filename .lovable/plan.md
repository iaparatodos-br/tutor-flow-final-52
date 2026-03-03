

# Revisão do Plano v3.6.2 — Pontas Soltas Identificadas

Após revisão completa do documento e cruzamento com o código-fonte, identifiquei **3 gaps reais** e **2 inconsistências de documentação**.

---

## Gap 1: `validate-payment-routing/index.ts` — `dueDate` em UTC (não listado)

A edge function `validate-payment-routing` (linha 241) calcula um `due_date` de teste:

```typescript
due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
```

Mesma vulnerabilidade do `create-invoice` (Passo 5.1.10). Apesar de ser um script de validação interna (baixo impacto), viola a regra arquitetural de não usar `.toISOString().split('T')[0]` para campos `date`.

**Ação**: Adicionar nota ao Passo 5.1.10 ou como item separado (prioridade baixa, semelhante ao `validate-monthly-subscriptions`).

---

## Gap 2: `Recibo.tsx` — `due_date` parseado como `Date` (bug off-by-one)

Linha 253 de `Recibo.tsx`:

```typescript
format(new Date(invoice.due_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
```

`due_date` é campo `date` (`YYYY-MM-DD`). `new Date('2026-03-15')` cria meia-noite UTC; `format()` do date-fns usa o timezone do browser. Para um utilizador em UTC-3, `new Date('2026-03-15')` = `14/03/2026 21:00 BRT` → o recibo exibe **14 de março** em vez de **15 de março**.

O componente **já está** na tabela de migração do Passo 8 (linha 891), mas a nota diz apenas "Migrar 4x `format()` para utilitário timezone-aware". Falta a advertência explícita de que `due_date` é campo `date` e deve seguir a regra de `parseISO` (sem conversão UTC).

**Ação**: Adicionar nota no Passo 8, entrada de `Recibo.tsx`, referenciando a regra v3.6 de campos `date`: usar `parseISO(invoice.due_date)` em vez de `new Date(invoice.due_date)`.

---

## Gap 3: Contagem do Passo 7/8 desatualizada (40 vs 39)

A secção 8 da sequência de execução (linha 1049) ainda diz "migrar **39** componentes" e lista todas as versões, mas não inclui o `CreateInvoiceModal.tsx` (v3.6.2) na contagem textual. A tabela de migração (linha 807) já tem o componente, mas a contagem na sequência de execução está inconsistente.

**Ação**: Atualizar linha 1049 para "**40** componentes" e adicionar `+ 1 v3.6.2 CreateInvoiceModal`.

---

## Inconsistência de Documentação 1: Secção 5.1.1 — "timezone do professor" vs "timezone do aluno"

A ação da secção 5.1.1 (`send-class-reminders`) diz corretamente que o email vai para o **aluno** e deve usar o timezone do aluno. Mas a tabela do Passo 3 (Arquivos Impactados, linha 856) diz:

> "Formatação de datas com timezone **do professor**"

Deveria ser "do **destinatário** (aluno)".

**Ação**: Corrigir linha 856 para "timezone do destinatário (aluno)".

---

## Inconsistência de Documentação 2: `isTodayTz` usa `dfStartOfMonth` em vez de `dfStartOfDay`

No exemplo de código da regra arquitetural (linhas 828-832):

```typescript
export const isTodayTz = (date: Date, timezone: string): boolean => {
  const zonedNow = toZonedTime(new Date(), timezone);
  const zonedDate = toZonedTime(date, timezone);
  return dfStartOfMonth(zonedNow).getTime() === dfStartOfMonth(zonedDate).getTime();
  //     ^^^^^^^^^^^^^^ BUG: deveria ser dfStartOfDay
};
```

Usar `startOfMonth` faz com que qualquer data no mesmo mês retorne `true`. Deve ser `startOfDay`.

**Ação**: Corrigir o snippet para usar `dfStartOfDay` (importar `startOfDay` do date-fns).

---

## Resumo

| # | Tipo | Descrição | Impacto | Ação |
|---|---|---|---|---|
| 1 | Gap | `validate-payment-routing` — `dueDate` UTC | Baixo (teste interno) | Adicionar nota |
| 2 | Gap | `Recibo.tsx` — `new Date(due_date)` off-by-one | Médio (documento oficial) | Nota explícita sobre campo `date` |
| 3 | Inconsistência | Contagem 39 vs 40 na sequência de execução | Cosmético | Corrigir texto |
| 4 | Inconsistência | Tabela diz "professor" mas deveria ser "aluno" | Confusão na implementação | Corrigir texto |
| 5 | Bug no snippet | `isTodayTz` usa `startOfMonth` em vez de `startOfDay` | Alto (código exemplo errado) | Corrigir snippet |

Nenhum gap estrutural ou de design foi encontrado. O plano v3.6.2 está arquiteturalmente sólido — estas são correções pontuais.

