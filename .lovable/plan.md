

## Plano: Verificacao de Conflito em Tempo Real no ClassForm

### Problema

A verificacao de conflitos roda apenas no `handleSubmit`. Como o conflito nao bloqueia mais a submissao, o formulario salva e fecha o modal antes do professor ver o aviso amarelo.

### Solucao

Mover a logica de deteccao de conflitos para um `useEffect` reativo que dispara sempre que `class_date`, `time`, `service_id`, `is_paid_class`, `showRecurrence` ou parametros de recorrencia mudam. Assim o warning amarelo aparece em tempo real no formulario, antes do professor clicar em "Salvar".

### Alteracoes

**Arquivo**: `src/components/ClassForm/ClassForm.tsx`

1. **Extrair a logica de conflito para um `useEffect`**
   - Criar um `useEffect` com dependencias: `formData.class_date`, `formData.time`, `formData.service_id`, `formData.is_paid_class`, `formData.duration_minutes`, `showRecurrence`, `formData.recurrence`, `existingClasses`, `services`
   - Dentro desse `useEffect`, executar toda a logica de expansao de aulas virtuais (RRULE) e verificacao de sobreposicao que hoje esta no `handleSubmit`
   - Chamar `setTimeConflictWarning(true/false)` conforme o resultado

2. **Remover a logica de conflito do `handleSubmit`**
   - Remover as linhas 256-369 (verificacao de conflito) do `handleSubmit`
   - O `handleSubmit` fica responsavel apenas pela validacao de campos obrigatorios e submissao

3. **Debounce opcional**
   - A verificacao envolve iteracao sobre `existingClasses` e geracao de RRULE, mas como os dados ja estao em memoria (sem chamada de rede), a performance deve ser aceitavel sem debounce

### Resultado

- O warning amarelo aparece assim que o professor seleciona data e hora que conflitam com outra aula
- O professor ve o aviso antes de clicar em "Salvar"
- O botao "Salvar" continua habilitado (nao bloqueia)
- Se o professor alterar a data/hora para um horario livre, o warning desaparece automaticamente

### Detalhes Tecnicos

```text
useEffect(() => {
  if (!formData.class_date || !formData.time) {
    setTimeConflictWarning(false);
    return;
  }
  // ... mesma logica de expansao de virtuais e verificacao de sobreposicao
  // que ja existe no handleSubmit (linhas 256-367)
  setTimeConflictWarning(hasConflict);
}, [formData.class_date, formData.time, formData.service_id, ...]);
```

Nenhum outro arquivo precisa ser alterado. A mudanca e isolada ao `ClassForm.tsx`.
