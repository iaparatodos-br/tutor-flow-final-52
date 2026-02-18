
# Plano: Status "Aguardando Pagamento" para Aulas Pre-pagas

## Contexto

Atualmente, no modelo prepaid, quando o professor confirma uma aula ou agenda uma nova, ela vai direto para o status "confirmada". O fluxo correto para aulas pre-pagas deveria ser:

```text
Aluno solicita aula:
  pendente --> [professor confirma] --> aguardando_pagamento --> [aluno paga] --> confirmada

Professor agenda aula (prepaid + paga):
  aguardando_pagamento --> [aluno paga] --> confirmada
```

## Alteracoes Necessarias

### 1. Novo status "aguardando_pagamento" no banco de dados
Nenhuma migracao de schema e necessaria, pois o campo `status` na tabela `classes` e do tipo `text`, nao enum. O novo valor sera aceito normalmente.

### 2. Logica de confirmacao pelo professor (`src/pages/Agenda.tsx`)
**Funcao `handleConfirmClass`**: Quando o professor confirma uma aula pendente e marca como paga (`isPaidClass = true`), verificar o `charge_timing` do business profile:
- Se `charge_timing === 'prepaid'` e `isPaidClass === true`: definir `status: 'aguardando_pagamento'` em vez de `'confirmada'`
- Caso contrario: manter `status: 'confirmada'` (comportamento atual)

Os participantes tambem devem receber o status correspondente.

### 3. Logica de criacao de aula pelo professor (`src/pages/Agenda.tsx`)
**Funcao `handleClassSubmit`**: Quando o professor agenda uma aula diretamente:
- Se `charge_timing === 'prepaid'` e `is_paid_class === true`: criar com `status: 'aguardando_pagamento'`
- Caso contrario: manter `status: 'confirmada'` (comportamento atual)

O `charge_timing` ja e consultado nesta funcao (linha ~1517-1521) para gerar faturas. Basta reutilizar essa verificacao antes da insercao.

### 4. Transicao automatica apos pagamento (webhook)
**Arquivo:** `supabase/functions/webhook-stripe-connect/index.ts`
No handler de `invoice.paid` e `payment_intent.succeeded`, apos marcar a fatura como `'paga'`, verificar:
- Se a fatura tem `class_id` (fatura de aula avulsa prepaid)
- Se a aula correspondente esta com `status = 'aguardando_pagamento'`
- Se sim, atualizar a aula e seus participantes para `status: 'confirmada'`

### 5. Exibicao do novo status na UI
Os seguintes arquivos precisam reconhecer `aguardando_pagamento`:

**`src/components/Calendar/CalendarView.tsx`**:
- Adicionar ao tipo `status` na interface `CalendarClass` e `ClassParticipant`
- Adicionar cor ao `statusColors` (ex: laranja/amber)
- Adicionar ao `getStatusBadge`

**`src/components/Calendar/SimpleCalendar.tsx`**:
- Adicionar ao mapeamento de status e badges
- Botao "Confirmar" nao deve aparecer para `aguardando_pagamento` (ja esta "confirmada" pelo professor, aguardando pagamento)

**`src/pages/Historico.tsx`**, **`src/pages/PerfilAluno.tsx`**, **`src/pages/Financeiro.tsx`**, **`src/components/ArchivedDataViewer.tsx`**:
- Adicionar badge para o novo status nos `getStatusBadge`

**`src/components/Calendar/MobileCalendarList.tsx`**:
- Adicionar tratamento para o novo status

### 6. Traducoes (i18n)
**`src/i18n/locales/pt/classes.json`**:
- Adicionar `"status.awaitingPayment": "Aguardando Pagamento"`

**`src/i18n/locales/en/classes.json`**:
- Adicionar `"status.awaitingPayment": "Awaiting Payment"`

### 7. Regras de interacao com o novo status
- O professor pode cancelar uma aula `aguardando_pagamento` (mesmo fluxo de cancelamento prepaid existente)
- O professor NAO pode "concluir" uma aula `aguardando_pagamento` (somente aulas confirmadas)
- O professor NAO pode "confirmar" novamente (o botao confirmar so aparece para `pendente`)
- O aluno pode cancelar uma aula `aguardando_pagamento`

### 8. Edge function `request-class`
Nenhuma alteracao necessaria. Aulas solicitadas por alunos continuam com `status: 'pendente'` e `is_paid_class: false`. A transicao para `aguardando_pagamento` ocorre na confirmacao pelo professor.

---

## Resumo dos arquivos afetados

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Agenda.tsx` | Logica de confirmacao e criacao com status condicional |
| `src/components/Calendar/CalendarView.tsx` | Tipo, cores, badge do novo status |
| `src/components/Calendar/SimpleCalendar.tsx` | Badge, regras de botoes |
| `src/components/Calendar/MobileCalendarList.tsx` | Badge do novo status |
| `src/pages/Historico.tsx` | Badge do novo status |
| `src/pages/PerfilAluno.tsx` | Badge do novo status |
| `src/pages/Financeiro.tsx` | Badge do novo status |
| `src/components/ArchivedDataViewer.tsx` | Badge do novo status |
| `supabase/functions/webhook-stripe-connect/index.ts` | Transicao automatica aula aguardando_pagamento para confirmada |
| `src/i18n/locales/pt/classes.json` | Traducao PT |
| `src/i18n/locales/en/classes.json` | Traducao EN |
