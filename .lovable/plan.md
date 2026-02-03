
# Plano: Corrigir Navegação do Calendário no Deep-Link

## ✅ STATUS: IMPLEMENTADO

## Problema Identificado

O `SimpleCalendar` tinha seu próprio estado interno para o mês exibido que sempre iniciava com a data atual, ignorando os parâmetros de deep-link.

## Solução Implementada

### 1. SimpleCalendar.tsx
- Adicionada prop `initialDate?: Date | null`
- Adicionado `useEffect` para reagir a mudanças no `initialDate`
- Estado `currentDate` agora usa `initialDate ?? new Date()` como valor inicial

### 2. Agenda.tsx
- Criado estado `calendarInitialDate` 
- No useEffect de deep-linking, `setCalendarInitialDate(targetDate)` é chamado
- A prop `initialDate={calendarInitialDate}` é passada ao `SimpleCalendar`

### 3. MobileCalendarList
- Nenhuma mudança necessária - já recebe `currentDate` como prop do `SimpleCalendar`

## Resultado

Ao clicar em uma notificação de "Relatório Pendente":
1. A URL é gerada: `/agenda?date=2026-01-09&classId=xxx&action=report`
2. O Agenda.tsx define `calendarInitialDate` como 9 de Janeiro de 2026
3. O SimpleCalendar navega para Janeiro 2026
4. A aula específica aparece destacada com `ring-2 ring-primary animate-pulse`
5. O toast de orientação "Criar Relatório" aparece
