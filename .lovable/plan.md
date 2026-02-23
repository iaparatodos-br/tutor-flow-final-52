

## Diferenciar "Aguardando Pagamento" de "Confirmada"

### Problema
As cores `indigo` (aguardando pagamento) e `blue` (confirmada) sao muito semelhantes, dificultando a distincao visual.

### Solucao
Trocar "aguardando_pagamento" de **indigo** para **violet** (roxo), que e visivelmente diferente do azul:

| Status | Antes | Depois |
|---|---|---|
| Confirmada | `bg-blue-100 text-blue-800` | Sem alteracao |
| Aguardando Pagamento | `bg-indigo-100 text-indigo-800` | `bg-violet-100 text-violet-800` |

### Arquivos a alterar (5 arquivos, mesma troca em todos)

Substituir todas as ocorrencias de `indigo` por `violet` no contexto de "aguardando_pagamento":

1. **`src/components/Calendar/SimpleCalendar.tsx`** (linha 262)
   - `bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400`
   - -> `bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400`

2. **`src/components/Calendar/CalendarView.tsx`** (linha 190)
   - Mesma troca no badge do popup
   - Tambem atualizar a cor HSL do bloco do calendario (linha ~144): `'hsl(239 84% 67%)'` -> `'hsl(263 70% 50%)'` (violet-600)

3. **`src/components/Calendar/MobileCalendarList.tsx`** (linha ~111)
   - `bg-indigo-500 text-white` -> `bg-violet-500 text-white`

4. **`src/pages/PerfilAluno.tsx`** (linha 499)
   - Mesma troca indigo -> violet

5. **`src/pages/Historico.tsx`** (linha 185)
   - Mesma troca indigo -> violet

6. **`src/components/ArchivedDataViewer.tsx`** (linha 119)
   - Mesma troca indigo -> violet

### Resultado
- **Confirmada**: Azul (blue) -- neutro-positivo
- **Aguardando Pagamento**: Roxo (violet) -- claramente distinto, ainda remetendo a processo financeiro

