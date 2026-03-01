
## Corrigir modal de cancelamento para aulas materializadas do aluno

### Problema
Para aulas materializadas (nao-virtuais), o `handleRecurringClassCancel` so passa `virtualClassData` ao modal quando `classToCancel.isVirtual === true`. Para aulas materializadas, o modal tenta buscar dados diretamente na tabela `classes` via `.eq('id', classId)`, mas o RLS (Row Level Security) bloqueia a leitura do aluno. Resultado: query retorna vazio, `classData` fica `null`, nenhum alert e exibido.

Evidencia nos logs:
- Console: `Error loading class data: null`
- Network: `classes?id=eq.f2f44711-...` retorna `[]`

### Solucao
Para o fluxo de aluno, passar os dados da aula ao modal tambem para aulas materializadas, eliminando a necessidade de query direta na tabela `classes`.

### Alteracao

**Arquivo: `src/pages/Agenda.tsx`**

1. No `handleRecurringClassCancel`, criar o objeto de dados para TODAS as aulas (nao apenas virtuais), usando `classToCancel` que ja contem todos os campos necessarios vindos do `calendarClasses`:

```typescript
// Antes (so virtual):
const virtualData = classToCancel.isVirtual ? { ... } : undefined;

// Depois (todas as aulas):
const classDataForModal = {
  teacher_id: classToCancel.teacher_id || profile!.id,
  class_date: classToCancel.class_date || classToCancel.start.toISOString(),
  service_id: classToCancel.service_id || null,
  is_group_class: classToCancel.is_group_class || false,
  is_experimental: classToCancel.is_experimental || false,
  is_paid_class: classToCancel.is_paid_class ?? false,
  service_price: classToCancel.service_id
    ? services.find(s => s.id === classToCancel.service_id)?.price || 0
    : 0,
  class_template_id: classToCancel.class_template_id || classId,
  duration_minutes: classToCancel.duration_minutes || 60,
  status: classToCancel.isVirtual 
    ? 'confirmada' as const 
    : (classToCancel.status || 'confirmada')
};
```

2. Passar `classDataForModal` como `virtualClassData` no `setCancellationModal` para todas as aulas, nao apenas virtuais.

3. Atualizar o tipo do estado `cancellationModal` para incluir os campos `is_experimental`, `is_paid_class` e `status` que ja existem na interface `VirtualClassData` do modal mas estavam ausentes no tipo local.

### Resultado esperado
- Aulas materializadas do aluno exibirao os alerts corretos (emerald para nao cobrada, green/red para pos-paga conforme prazo, amber para pre-paga, violeta para experimental)
- O erro `Error loading class data: null` desaparecera do console
- O modal nao precisara mais fazer query direta na tabela `classes` para o fluxo de aluno
- Aulas virtuais continuam funcionando como antes (sem regressao)
