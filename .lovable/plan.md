

# Plano: Adicionar Botão de Anistia no Calendário (SimpleCalendar)

## Problema

O fluxo atual de anistia está quebrado do ponto de vista de UX:

1. Professor recebe notificação "Anistia Disponível" no Inbox
2. Deep-link navega para `/agenda?date=...&classId=...&action=amnesty`
3. Aula é destacada no calendário
4. Professor clica na aula cancelada
5. **Não existe botão de Anistia** no modal de detalhes da aula

O `AmnestyButton` atualmente só aparece na página **Financeiro** (lista de faturas), não no calendário.

## Solução

Adicionar o botão de anistia no modal de detalhes de aula (`SimpleCalendar`) para aulas canceladas que têm cobrança pendente.

## Alterações Necessárias

### 1. Estender a interface `CalendarClass` (CalendarView.tsx)

Adicionar campos `charge_applied` e `amnesty_granted` à interface:

```typescript
export interface CalendarClass {
  // ... campos existentes ...
  charge_applied?: boolean;      // NOVO
  amnesty_granted?: boolean;     // NOVO
}
```

### 2. Atualizar SimpleCalendar (SimpleCalendar.tsx)

**2.1 - Importar AmnestyButton:**
```typescript
import { AmnestyButton } from '@/components/AmnestyButton';
```

**2.2 - Adicionar callback para refresh após anistia:**
```typescript
interface SimpleCalendarProps {
  // ... props existentes ...
  onAmnestyGranted?: () => void;  // NOVO
}
```

**2.3 - Adicionar botão na seção de ações do modal:**

Na função `renderEventDetails()`, após a seção de ações existentes, adicionar condição para aulas canceladas com cobrança:

```typescript
{/* Amnesty Button - for cancelled classes with pending charge */}
{isProfessor && 
 (selectedEvent as CalendarClass).status === 'cancelada' && 
 (selectedEvent as CalendarClass).charge_applied === true && 
 (selectedEvent as CalendarClass).amnesty_granted === false && (
  <div className="pt-4 border-t">
    <p className="text-xs text-muted-foreground mb-3">
      {t('actions.amnestySection', 'Gestão de Cobrança')}
    </p>
    <AmnestyButton
      classId={(selectedEvent as CalendarClass).id}
      studentName={getDisplayName(selectedEvent as CalendarClass).name}
      onAmnestyGranted={() => {
        setSelectedEvent(null);
        onAmnestyGranted?.();
      }}
    />
  </div>
)}
```

### 3. Atualizar Agenda.tsx

**3.1 - Mapear `charge_applied` e `amnesty_granted` nos dados do calendário:**

Atualizar a função `transformClassToCalendarEvent` para incluir os novos campos:

```typescript
const transformToCalendarEvent = (cls: ClassWithParticipants): CalendarClass => ({
  // ... campos existentes ...
  charge_applied: cls.charge_applied,      // NOVO
  amnesty_granted: cls.amnesty_granted,    // NOVO
});
```

**3.2 - Passar callback de refresh:**

```typescript
<SimpleCalendar
  // ... props existentes ...
  onAmnestyGranted={() => {
    if (visibleRange) {
      loadClasses(visibleRange.start, visibleRange.end);
    }
  }}
/>
```

### 4. Adicionar traduções (opcional)

Adicionar chave para o título da seção no arquivo de traduções:

```json
// src/i18n/locales/pt/classes.json
{
  "actions": {
    "amnestySection": "Gestão de Cobrança"
  }
}

// src/i18n/locales/en/classes.json
{
  "actions": {
    "amnestySection": "Charge Management"
  }
}
```

## Fluxo Resultante

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE ANISTIA CORRIGIDO                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Notificação "Anistia Disponível" no Inbox                   │
│                    │                                            │
│                    ▼                                            │
│  2. Clique leva para /agenda?classId=...&action=amnesty         │
│                    │                                            │
│                    ▼                                            │
│  3. Calendário navega para o mês correto                        │
│     + Aula é destacada visualmente                              │
│                    │                                            │
│                    ▼                                            │
│  4. Professor clica na aula cancelada                           │
│                    │                                            │
│                    ▼                                            │
│  5. Modal de detalhes mostra:                                   │
│     ┌──────────────────────────────────────────┐                │
│     │  Status: Cancelada                       │                │
│     │  Aluno: Maria Silva                      │                │
│     │  Data: 15/01/2026                        │                │
│     │                                          │                │
│     │  ─────────────────────────────────       │                │
│     │  Gestão de Cobrança                      │                │
│     │  [ ❤️ Anistia ] ← NOVO BOTÃO             │                │
│     └──────────────────────────────────────────┘                │
│                    │                                            │
│                    ▼                                            │
│  6. Clique abre modal de confirmação do AmnestyButton           │
│                    │                                            │
│                    ▼                                            │
│  7. Anistia concedida → Cobrança removida + Notificação OK      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/Calendar/CalendarView.tsx` | Adicionar `charge_applied` e `amnesty_granted` à interface `CalendarClass` |
| `src/components/Calendar/SimpleCalendar.tsx` | Importar `AmnestyButton`, adicionar prop `onAmnestyGranted`, renderizar botão para aulas canceladas com cobrança |
| `src/pages/Agenda.tsx` | Mapear novos campos, passar callback `onAmnestyGranted` |
| `src/i18n/locales/pt/classes.json` | Adicionar tradução `actions.amnestySection` |
| `src/i18n/locales/en/classes.json` | Adicionar tradução `actions.amnestySection` |

## Validação

Após implementação:

1. Cancelar uma aula com menos de 24h de antecedência (para gerar cobrança)
2. Executar `generate-teacher-notifications` manualmente
3. Verificar notificação "Anistia Disponível" no Inbox
4. Clicar na notificação → navega para Agenda
5. Clicar na aula destacada → modal mostra botão "Anistia"
6. Clicar em "Anistia" → modal de confirmação aparece
7. Confirmar → anistia concedida, botão desaparece, toast de sucesso

