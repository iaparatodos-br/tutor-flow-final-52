
# Plano: Opção de "Aula Paga" ao Confirmar Aula Pendente

## Contexto
Quando um aluno solicita uma aula, ela é criada com `is_paid_class: false` por padrão (para evitar cobranças acidentais). Atualmente, ao confirmar a aula, o professor simplesmente clica "Confirmar" e o status muda para "confirmada" sem nenhuma opção adicional. O professor precisa ter a oportunidade de marcar a aula como paga no momento da confirmacao.

## O que vai mudar

Ao clicar em "Confirmar Aula" em uma aula pendente, em vez de confirmar diretamente, sera aberto um pequeno dialog de confirmacao com:
- Uma mensagem de confirmacao
- Um switch "Aula Cobrada" (ligado por padrao)
- Botoes "Cancelar" e "Confirmar"

Ao confirmar, o sistema atualizara tanto o `status` quanto o `is_paid_class` da aula.

---

## Detalhes Tecnicos

### 1. Adicionar `is_paid_class` ao tipo `CalendarClass`
**Arquivo:** `src/components/Calendar/CalendarView.tsx`
- Adicionar `is_paid_class?: boolean` na interface `CalendarClass`

### 2. Alterar assinatura de `onConfirmClass`
**Arquivos:** `CalendarView.tsx`, `SimpleCalendar.tsx`, `Agenda.tsx`
- Mudar de `(classId: string) => void` para `(classId: string, isPaidClass: boolean) => void`

### 3. Adicionar estado e dialog de confirmacao nos calendarios
**Arquivos:** `CalendarView.tsx` e `SimpleCalendar.tsx`
- Adicionar estados: `showConfirmDialog`, `confirmClassId`, `confirmIsPaidClass` (default `true`)
- O botao "Confirmar Aula" agora abre o dialog em vez de chamar `onConfirmClass` diretamente
- O dialog contem:
  - Titulo "Confirmar Aula"
  - Switch "Aula Cobrada" com label explicativo (padrao: ligado)
  - Botoes Cancelar/Confirmar
- Ao confirmar no dialog, chama `onConfirmClass(classId, isPaidClass)`

### 4. Atualizar `handleConfirmClass` em `Agenda.tsx`
**Arquivo:** `src/pages/Agenda.tsx`
- Receber `isPaidClass: boolean` como segundo parametro
- Incluir `is_paid_class: isPaidClass` no update da tabela `classes`

### 5. Traducoes
**Arquivos:** `src/i18n/locales/pt/classes.json` e `src/i18n/locales/en/classes.json`
- Adicionar chaves para o dialog de confirmacao:
  - `actions.confirmTitle`: "Confirmar Aula" / "Confirm Class"
  - `actions.confirmDescription`: "Deseja confirmar esta aula?" / "Do you want to confirm this class?"
  - `actions.isPaidClass`: "Aula Cobrada" / "Paid Class"
  - `actions.isPaidClassDescription`: "Esta aula sera cobrada do aluno" / "This class will be charged to the student"
