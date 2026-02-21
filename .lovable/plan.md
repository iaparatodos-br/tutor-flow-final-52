

## Correcao: Permitir Agendamento em Horarios de Aulas Canceladas

### Problema
Ao tentar agendar uma nova aula em um horario que tinha uma aula cancelada, o sistema bloqueia o agendamento como se houvesse conflito. Aulas canceladas nao deveriam ocupar espaco na agenda.

### Causa Raiz
Existem **3 pontos** no codigo que verificam conflitos de horario, mas **2 deles** nao excluem aulas canceladas:

| Local | Filtra canceladas? | Status |
|---|---|---|
| `ClassForm.tsx` (linha 264-267) | Sim (skip `cancelada` e `concluida`) | OK |
| `Agenda.tsx` (linha 1420-1431) | Nao | BUG |
| `StudentScheduleRequest.tsx` (linha 238-248) | Nao | BUG |

### Solucao

**Arquivo 1: `src/pages/Agenda.tsx` (~linha 1420)**

Adicionar filtro para pular aulas canceladas e concluidas na validacao de conflito dentro de `handleClassSubmit`:

```typescript
// ANTES:
const hasConflict = classes?.some(existingClass => {
  if (existingClass.isVirtual || existingClass.is_template) return false;

// DEPOIS:
const hasConflict = classes?.some(existingClass => {
  if (existingClass.isVirtual || existingClass.is_template) return false;
  if (existingClass.status === 'cancelada' || existingClass.status === 'concluida') return false;
```

**Arquivo 2: `src/components/StudentScheduleRequest.tsx` (~linha 238)**

Adicionar filtro para pular aulas canceladas na verificacao de disponibilidade do aluno:

```typescript
// ANTES:
for (const existingClass of existingClasses) {

// DEPOIS:
for (const existingClass of existingClasses) {
  // Skip cancelled classes - they don't occupy the time slot
  if ((existingClass as any).status === 'cancelada' || (existingClass as any).status === 'concluida') {
    continue;
  }
```

### Arquivos Modificados
- `src/pages/Agenda.tsx` - adicionar 1 linha de filtro na validacao de conflito
- `src/components/StudentScheduleRequest.tsx` - adicionar 3 linhas de filtro no loop de verificacao

### Impacto
- Professores poderao agendar novas aulas em horarios de aulas canceladas
- Alunos poderao solicitar aulas em horarios previamente cancelados
- Nenhuma mudanca no backend ou banco de dados
