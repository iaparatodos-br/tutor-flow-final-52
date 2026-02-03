
# Plano: Corrigir Navegação do Calendário no Deep-Link

## Problema Identificado

Após investigação completa, identifiquei a **causa raiz** do problema:

1. **O `buildNotificationDeepLink` funciona corretamente** - A URL gerada inclui o parâmetro `date=2026-01-09` (data correta da aula)

2. **A API retorna `class_date` corretamente** - Confirmado no network request: `"class_date":"2026-01-09T10:00:00+00:00"`

3. **O Agenda.tsx processa o parâmetro corretamente** - `setVisibleRange` é chamado com a data correta

4. **PROBLEMA: O SimpleCalendar ignora o `visibleRange`**

O `SimpleCalendar` tem seu próprio estado interno para o mês exibido:

```typescript
// SimpleCalendar.tsx - linha 67
const [currentDate, setCurrentDate] = useState(new Date()); // SEMPRE inicia com hoje!
```

O `visibleRange` do Agenda.tsx controla apenas **quais classes são carregadas do banco de dados**, mas o calendário visual é controlado pelo `currentDate` **interno** ao SimpleCalendar, que sempre inicia com a data atual (Fevereiro 2026).

## Solução Proposta

### 1. Adicionar prop `initialDate` ao SimpleCalendar

Permitir que o Agenda.tsx passe uma data inicial para o calendário quando vindo de um deep-link.

```typescript
// SimpleCalendar.tsx
interface SimpleCalendarProps {
  // ... props existentes
  initialDate?: Date | null; // Nova prop
}

export function SimpleCalendar({ 
  // ... props existentes
  initialDate
}: SimpleCalendarProps) {
  // Usar initialDate se fornecido, senão usa hoje
  const [currentDate, setCurrentDate] = useState(initialDate ?? new Date());
  
  // Reagir a mudanças no initialDate (para deep-links)
  useEffect(() => {
    if (initialDate) {
      setCurrentDate(initialDate);
    }
  }, [initialDate]);
  // ...
}
```

### 2. Atualizar Agenda.tsx para passar `initialDate`

Criar um estado para armazenar a data inicial quando vindo de deep-link:

```typescript
// Agenda.tsx
const [calendarInitialDate, setCalendarInitialDate] = useState<Date | null>(null);

// No useEffect de deep-linking:
useEffect(() => {
  if (!profile) return;
  
  const dateParam = searchParams.get('date');
  const classIdParam = searchParams.get('classId');
  const actionParam = searchParams.get('action');
  
  if (dateParam || classIdParam) {
    if (dateParam) {
      const targetDate = new Date(dateParam);
      if (!isNaN(targetDate.getTime())) {
        // NOVO: Definir a data inicial do calendário
        setCalendarInitialDate(targetDate);
        
        // ... resto do código de visibleRange
      }
    }
    // ...
  }
}, [searchParams, setSearchParams, toast, t, profile]);

// No render:
<SimpleCalendar
  initialDate={calendarInitialDate}  // Nova prop
  highlightedClassId={highlightedClassId}
  // ... outras props
/>
```

### 3. Atualizar MobileCalendarList também

O mesmo padrão deve ser aplicado ao `MobileCalendarList`:

```typescript
// MobileCalendarList.tsx
interface MobileCalendarListProps {
  // ... props existentes
  initialDate?: Date | null;
}
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/Calendar/SimpleCalendar.tsx` | Adicionar prop `initialDate` e useEffect para reagir a mudanças |
| `src/pages/Agenda.tsx` | Criar estado `calendarInitialDate` e passar para SimpleCalendar |
| `src/components/Calendar/MobileCalendarList.tsx` | Adicionar suporte a `initialDate` (já recebe do SimpleCalendar) |

## Sequência de Implementação

1. Adicionar prop `initialDate` ao `SimpleCalendar.tsx`
2. Adicionar useEffect para reagir a mudanças no `initialDate`
3. Criar estado `calendarInitialDate` no `Agenda.tsx`
4. Definir `calendarInitialDate` no useEffect de deep-linking
5. Passar a prop para `SimpleCalendar`
6. Verificar se `MobileCalendarList` também precisa de ajuste

## Resultado Esperado

Ao clicar em uma notificação de "Relatório Pendente" (Janeiro 2026):
1. A URL é gerada corretamente: `/agenda?date=2026-01-09&classId=xxx&action=report`
2. O Agenda.tsx define `calendarInitialDate` como 9 de Janeiro de 2026
3. O SimpleCalendar recebe essa data e **navega para Janeiro 2026**
4. A aula específica aparece destacada com `ring-2 ring-primary animate-pulse`
5. O toast de orientação "Criar Relatório" aparece

## Detalhes Técnicos

A correção respeita o padrão existente de "controlled component" onde:
- O Agenda.tsx é a "fonte da verdade" para a data quando há deep-link
- O SimpleCalendar mantém controle local para navegação manual (prev/next month)
- O useEffect permite sincronizar o estado quando a prop muda
