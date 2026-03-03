

# Furos no Frontend: Componentes Ausentes do Plano v2.4

## Resumo da Auditoria

Cruzei todos os arquivos do frontend que formatam datas (`format()` do date-fns, `toLocaleDateString`, `toLocaleTimeString`) com a tabela do Passo 8 (linhas 549-566 do plano). Encontrei **7 arquivos com impacto real** que estao ausentes.

---

## Arquivos Ausentes com ALTO Impacto

Estes renderizam campos `timestamptz` ou `date` vindos do banco de dados sem timezone explicito, podendo mostrar dia/hora errados:

### 1. `src/pages/Recibo.tsx`
- 4 ocorrencias de `format(new Date(...))` sem timezone
- `invoice.created_at` (timestamptz), `invoice.due_date` (date), `invoice.updated_at` (timestamptz)
- `format(new Date(), ...)` para "Recibo gerado em" -- usa hora local do browser, nao do professor
- **Criticidade**: Alta -- recibo e documento oficial

### 2. `src/pages/Faturas.tsx`
- 2 ocorrencias: `invoice.created_at` e `invoice.due_date` com `format(new Date(...), 'dd/MM/yyyy')`
- **Criticidade**: Alta -- lista de faturas, campo `due_date` e tipo `date` (sujeito ao bug de dia anterior)

### 3. `src/pages/Historico.tsx`
- Funcao `formatDateTime` com `format(new Date(dateString), "dd/MM/yyyy HH:mm")` sem timezone
- Formata `class_date` (timestamptz) -- pode mostrar hora errada
- **Criticidade**: Media-alta

### 4. `src/pages/StudentDashboard.tsx`
- 2 ocorrencias: `cls.class_date` (timestamptz) e `activeSubscription.starts_at` (date)
- Portal do aluno -- pode mostrar data de aula errada
- **Criticidade**: Media-alta

### 5. `src/components/Inbox/NotificationItem.tsx`
- 2 ocorrencias: `notification.invoice_due_date` (date) e `notification.class_date` (timestamptz)
- `format(new Date(...), 'dd/MM/yyyy')` sem timezone
- **Criticidade**: Media

### 6. `src/pages/Subscription.tsx`
- 3 ocorrencias: `subscription.current_period_end` e `invoice.created` (timestamps do Stripe, em epoch seconds)
- Ja usa `dateLocale` mas sem timezone explicito
- **Criticidade**: Media (dados do Stripe, nao do banco local)

### 7. `src/components/PlanDowngradeSelectionModal.tsx`
- 1 ocorrencia: `entity.created_at` com `format(new Date(...), 'dd/MM/yyyy')`
- **Criticidade**: Baixa (informacional)

---

## Arquivos Ausentes com BAIXO Impacto (nao recomendo adicionar ao plano)

- `src/pages/Legal.tsx` -- `published_at` e data estatica, nao depende de timezone do usuario
- `src/components/InlineDependentForm.tsx` -- `birth_date` e campo `date` inserido pelo usuario, exibe via `parse('yyyy-MM-dd')` (seguro)
- `src/pages/DevValidation.tsx` -- ja excluido no plano (logs de debug)

---

## Observacao: `formatDateBrazil` nao e usado

As funcoes `formatDateBrazil`, `formatTimeBrazil` e `formatDateTimeBrazil` de `src/utils/timezone.ts` nao sao importadas por **nenhum** componente. Todos usam `format()` do date-fns ou `toLocaleDateString` diretamente. O plano preve refatora-las (Passo 8), mas sera necessario tambem **migrar os componentes para usa-las** -- caso contrario a refatoracao de `timezone.ts` nao tera efeito pratico.

---

## Alteracoes Propostas ao Documento

### 1. Tabela do Passo 8 (linha 549-566) -- Adicionar 7 linhas

| Arquivo | Problema |
|---|---|
| `src/pages/Recibo.tsx` | 4x `format()` sem timezone (created_at, due_date, updated_at, hora atual) -- documento oficial |
| `src/pages/Faturas.tsx` | 2x `format()` sem timezone (created_at, due_date) -- bug de dia anterior em `due_date` |
| `src/pages/Historico.tsx` | `formatDateTime` sem timezone (class_date timestamptz) |
| `src/pages/StudentDashboard.tsx` | 2x `format()` sem timezone (class_date, starts_at) |
| `src/components/Inbox/NotificationItem.tsx` | 2x `format()` sem timezone (invoice_due_date, class_date) |
| `src/pages/Subscription.tsx` | 3x `format()` sem timezone (datas do Stripe) |
| `src/components/PlanDowngradeSelectionModal.tsx` | 1x `format()` sem timezone (created_at) |

### 2. Secao 3 (Arquivos Impactados, linha 573) -- Adicionar 7 linhas

Adicionar os mesmos 7 arquivos na tabela de arquivos impactados com tipo "Migrar datas para utilitario".

### 3. Checklist Secao 8 (item 7, linha 738) -- Atualizar contagem

Atualizar a descricao do item 7 para refletir que agora sao **22 componentes frontend** (15 existentes + 7 novos) a migrar.

### 4. Nota sobre `formatDateBrazil` nao utilizado

Adicionar uma nota ao Passo 8 alertando que nenhum componente importa as funcoes atuais de `timezone.ts`, portanto a migracao dos componentes e **pre-requisito** para que a refatoracao tenha efeito.

