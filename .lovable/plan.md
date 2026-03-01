
## Corrigir dados ausentes ao cancelar aula virtual recorrente

### Diagnostico raiz

O bug esta na linha 1730 de `Agenda.tsx`:

```typescript
const fullClassData = classes.find(c => c.id === classId);
```

Para aulas virtuais, o `classId` tem formato `templateId_virtual_timestamp` (ex: `abc123_virtual_1709420400000`). Esse ID **nao existe** no array `classes` (que contem apenas dados brutos do RPC). Resultado: `fullClassData` e `null`, o que faz `virtualData` ser `undefined`.

Sem `virtualData`, o `CancellationModal` tenta buscar a aula no banco pelo ID virtual (que tambem nao existe), e acaba com dados incompletos -- `is_paid_class` fica `undefined`, entao o modal assume que a aula e paga e exibe alertas incorretos (prepaid, cobranca, etc).

Enquanto isso, o `classToCancel` (da linha 1718, buscado em `calendarClasses`) **ja tem todos os dados corretos** porque as instancias virtuais sao geradas com `...templateClass` (linha 306), que inclui `is_paid_class`, `is_experimental`, `service_id`, etc.

### Solucao

Usar `classToCancel` como fonte de dados para construir o `virtualData`, em vez de `fullClassData`. Para o template ID, usar `classToCancel.class_template_id`. Para dependentes, usar `classToCancel.participants`.

### Alteracoes

**Arquivo: `src/pages/Agenda.tsx` (linhas 1729-1763)**

Substituir o bloco que busca `fullClassData` e constroi `virtualData`:

```typescript
// For virtual classes, use classToCancel directly (it has all template data)
// For materialized classes, find in the raw classes array
const fullClassData = classToCancel.isVirtual 
  ? classToCancel 
  : classes.find(c => c.id === classId);

const virtualData = classToCancel.isVirtual && fullClassData ? {
  teacher_id: fullClassData.teacher_id || profile!.id,
  class_date: fullClassData.class_date,
  service_id: fullClassData.service_id || null,
  is_group_class: fullClassData.is_group_class || false,
  is_experimental: fullClassData.is_experimental || false,
  is_paid_class: fullClassData.is_paid_class ?? true,
  service_price: fullClassData.service_id
    ? services.find(s => s.id === fullClassData.service_id)?.price || 0
    : 0,
  class_template_id: fullClassData.class_template_id || '',
  duration_minutes: fullClassData.duration_minutes || 60,
  status: fullClassData.status || 'confirmada'
} : undefined;
```

### Resultado esperado

- Aulas virtuais com `is_paid_class = false` exibirao o alerta "Aula Gratuita" corretamente
- Aulas virtuais de professor com `charge_timing = 'prepaid'` mas marcadas como nao cobradas (`is_paid_class = false`) **nao** exibirao o alerta de pre-pago
- Todos os demais cenarios (experimental, pago, grupo) funcionarao corretamente porque os dados vem do template original
