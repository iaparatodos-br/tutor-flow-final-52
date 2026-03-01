
## Corrigir cobranca incorreta ao cancelar aula virtual nao-paga

### Problema
O objeto `virtualData` construido em `src/pages/Agenda.tsx` (linhas 1733-1745) nao inclui os campos `is_paid_class` e `is_experimental`. Quando o `CancellationModal` recebe esses dados, `fetchedClassData.is_paid_class` fica `undefined`, e a verificacao `=== false` (linha 229) nao e acionada. O resultado: o modal trata a aula como paga e exibe o alerta de cobranca (mesmo que com valor R$ 0,00).

### Solucao
Adicionar `is_paid_class` e `is_experimental` ao objeto `virtualData` em `Agenda.tsx`.

### Alteracoes

**Arquivo: `src/pages/Agenda.tsx` (linhas 1733-1745)**

Adicionar dois campos ao objeto `virtualData`:

```typescript
const virtualData = classToCancel.isVirtual && fullClassData ? {
  teacher_id: fullClassData.teacher_id || profile!.id,
  class_date: fullClassData.class_date,
  service_id: fullClassData.service_id || null,
  is_group_class: fullClassData.is_group_class || false,
  is_experimental: fullClassData.is_experimental || false,   // NOVO
  is_paid_class: fullClassData.is_paid_class ?? true,        // NOVO (fallback seguro)
  service_price: fullClassData.service_id
    ? services.find(s => s.id === fullClassData.service_id)?.price || 0
    : 0,
  class_template_id: fullClassData.class_template_id || '',
  duration_minutes: fullClassData.duration_minutes || 60,
  status: fullClassData.status || 'confirmada'
} : undefined;
```

### Resultado esperado
- Aulas virtuais com `is_paid_class = false` exibirao o alerta correto "Aula Gratuita" e nao mostrarao aviso de cobranca.
- Aulas virtuais experimentais exibirao o alerta "Aula Experimental".
- Aulas virtuais pagas continuarao respeitando a politica de cancelamento normalmente.
