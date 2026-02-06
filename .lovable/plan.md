

# Plano: Remover TeacherContextSwitcher Duplicado do Header

## Problema Identificado

O componente `TeacherContextSwitcher` (combobox para selecionar professor) está aparecendo em dois lugares para alunos:

1. No **Header** (Layout.tsx, linha 75)
2. Na **Sidebar** (AppSidebar.tsx)

O comportamento correto, conforme indicado pelo usuário, é manter o seletor **apenas na sidebar**.

## Alteração Necessária

### Arquivo: `src/components/Layout.tsx`

Remover a renderização condicional do `TeacherContextSwitcher` no header e também remover o import que ficará não utilizado.

**Antes:**
```tsx
import { TeacherContextSwitcher } from "@/components/TeacherContextSwitcher";
// ...
<div className="ml-auto flex items-center gap-4">
  {isProfessor && <NotificationBell />}
  {isAluno && <TeacherContextSwitcher />}
</div>
```

**Depois:**
```tsx
// Remover import do TeacherContextSwitcher
// ...
<div className="ml-auto flex items-center gap-4">
  {isProfessor && <NotificationBell />}
</div>
```

## Impacto

- O seletor de professor para alunos continuará funcionando normalmente através da sidebar
- O header ficará mais limpo, mostrando apenas o sino de notificações para professores
- Nenhuma funcionalidade será perdida, apenas a duplicação será removida

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/Layout.tsx` | Remover TeacherContextSwitcher do header e seu import |

