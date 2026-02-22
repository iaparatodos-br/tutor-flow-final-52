

## Redesign do sistema de cores de status das aulas

### Novo sistema de cores

| Status | Cor | Justificativa |
|---|---|---|
| Pendente | Amber | Atencao/espera, sem agressividade |
| Aguardando Pagamento | Indigo | Remete a processos financeiros/Stripe |
| Confirmada | Blue | Neutro-positivo, "agendado/ativo" |
| Concluida | Emerald | Sucesso sofisticado |
| Cancelada | Slate | Inativa, sem chamar atencao |

### Arquivos a alterar

**1. `src/components/Calendar/CalendarView.tsx`**

- **Linha 139-144** — Cores HSL do calendario (blocos coloridos no grid):
  - `pendente`: `'hsl(var(--warning))'` -> `'hsl(38 92% 50%)'` (amber-500)
  - `confirmada`: `'hsl(var(--primary))'` -> `'hsl(217 91% 60%)'` (blue-500)
  - `cancelada`: `'hsl(var(--destructive))'` -> `'hsl(215 16% 47%)'` (slate-500)
  - `concluida`: `'hsl(var(--success))'` -> `'hsl(160 84% 39%)'` (emerald-500)
  - `aguardando_pagamento`: `'hsl(25 95% 53%)'` -> `'hsl(239 84% 67%)'` (indigo-500)

- **Linha 185-190** — Badge no popup de detalhes:
  - `pendente`: className `bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400`
  - `confirmada`: className `bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400`
  - `cancelada`: className `bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400`
  - `concluida`: className `bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400`
  - `aguardando_pagamento`: className `bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400`

**2. `src/components/Calendar/MobileCalendarList.tsx`**

- **Linha 105-113** — `getStatusColor()`:
  - `pendente`: `'bg-amber-500 text-white'`
  - `confirmada`: `'bg-blue-500 text-white'`
  - `cancelada`: `'bg-slate-400 text-white'`
  - `concluida`: `'bg-emerald-500 text-white'`
  - `aguardando_pagamento`: `'bg-indigo-500 text-white'`

**3. `src/pages/PerfilAluno.tsx`**

- **Linha 493-501** — `getStatusBadge()`:
  - Aplicar as mesmas classes Tailwind com fundo suave e texto escuro para cada status
  - `pendente`: `bg-amber-100 text-amber-800`
  - `cancelada`: `bg-slate-100 text-slate-700`
  - `concluida`: `bg-emerald-100 text-emerald-800`
  - `aguardando_pagamento`: `bg-indigo-100 text-indigo-800`

**4. `src/pages/Historico.tsx`**

- **Linha 181-186** — `statusMap`:
  - `pendente`: className `bg-amber-100 text-amber-800`
  - `cancelada`: className `bg-slate-100 text-slate-700`
  - `realizada` (equivale a concluida): className `bg-emerald-100 text-emerald-800`
  - `aguardando_pagamento`: className `bg-indigo-100 text-indigo-800`

**5. `src/components/ArchivedDataViewer.tsx`**

- **Linha 114-120** — `statusMap`:
  - Mesma logica: amber para pendente, slate para cancelada, emerald para concluida, indigo para aguardando_pagamento, blue para confirmada

**6. `src/pages/PerfilAluno.tsx`** (icones, linha 485-489)

- Atualizar as cores dos icones de status para combinar:
  - `concluida`: `text-emerald-500`
  - `cancelada`: `text-slate-400`
  - `confirmada`: `text-blue-500`
  - `pendente`: `text-amber-500`

### Notas de implementacao

- Os badges usarao `variant="secondary"` (ou nenhum variant) como base, com as classes Tailwind customizadas controlando as cores via `className`
- As cores HSL no `CalendarView` (blocos do calendario) precisam ser mais saturadas/escuras porque o texto e branco sobre fundo colorido
- Os badges nos popups/modais usam o estilo "suave" (fundo claro + texto escuro) conforme a proposta
- Suporte a dark mode incluido com as classes `dark:` nos badges
