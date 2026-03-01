

## Corrigir fonte de dados para cancelamento de aula virtual

### Problema

O codigo em `Agenda.tsx` (linha 1731-1733) tenta encontrar o template da aula virtual no array `classes`:

```typescript
const fullClassData = classToCancel.isVirtual 
  ? classes.find(c => c.id === classToCancel.class_template_id)
  : classes.find(c => c.id === classId);
```

Porem, o array `classes` contem **apenas aulas materializadas** (nao-templates). Os templates sao filtrados na linha 840-841 e usados separadamente para gerar instancias virtuais. Resultado: `fullClassData` e sempre `null` para aulas virtuais, `virtualData` fica `undefined`, e o modal tenta buscar no banco com o ID virtual (`xxx_virtual_timestamp`), gerando o erro UUID invalido no console.

Sem `virtualData`, o modal nao recebe `is_paid_class`, `is_experimental`, etc., e exibe alertas incorretos.

### Solucao

Para aulas virtuais, usar `classToCancel` diretamente como fonte de dados. O `classToCancel` vem de `calendarClasses`, que ja contem todos os dados do template (via spread `...templateClass` na linha 306-315), incluindo `is_paid_class`, `is_experimental`, `service_id`, `teacher_id`, etc.

### Alteracao

**Arquivo: `src/pages/Agenda.tsx` (linha 1731-1733)**

De:
```typescript
const fullClassData = classToCancel.isVirtual 
  ? classes.find(c => c.id === classToCancel.class_template_id)
  : classes.find(c => c.id === classId);
```

Para:
```typescript
const fullClassData = classToCancel.isVirtual 
  ? classToCancel
  : classes.find(c => c.id === classId);
```

Tambem ajustar `class_template_id` no `virtualData` (linha 1746) porque `classToCancel.class_template_id` ja aponta para o template correto, enquanto `fullClassData.class_template_id` (quando `fullClassData = classToCancel`) tambem tera o valor correto.

E ajustar `class_date` no `virtualData` (linha 1738) para usar a data da instancia virtual (`classToCancel.class_date`) e nao a data do template original.

### Resultado esperado

- O alerta emerald "Aula Gratuita" aparecera corretamente para aulas virtuais com `is_paid_class = false`
- O erro `invalid input syntax for type uuid` desaparecera do console
- Todos os outros cenarios (experimental, prepaid, postpaid) funcionarao corretamente

