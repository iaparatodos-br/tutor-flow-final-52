
# Remover Opção de "Aula Experimental" do Formulário

## Contexto

Atualmente o formulário de agendar aula (`ClassForm.tsx`) exibe duas opções que se sobrepõem:
1. **Checkbox "Aula Experimental (gratuita)"** — marca `is_experimental = true` e `is_paid_class = false`
2. **Switch "Aula Cobrada"** — controla `is_paid_class` diretamente

Ambas controlam se a aula sera cobrada ou nao. O usuario quer manter apenas o Switch "Aula Cobrada".

## O Que Sera Feito

### Arquivo: `src/components/ClassForm/ClassForm.tsx`

1. **Remover o card "Tipo de Aula" inteiro** (linhas 461-531) — o card que contem o checkbox de aula experimental, incluindo o seletor de duracao que aparecia quando experimental era marcado.

2. **Mover o Switch "Aula Cobrada" para sempre visivel** (linhas 533-556) — remover a condicao `!formData.is_experimental` que hoje esconde o switch quando experimental esta marcado. O switch ficara sempre visivel.

3. **Garantir que `is_experimental` sempre seja `false`** — o campo continua existindo no `formData` (para compatibilidade com o banco de dados e toda a logica de cancelamento/billing), mas nunca sera marcado como `true` pelo formulario.

4. **Quando `is_paid_class = false`, mostrar o seletor de duracao customizada** — hoje a duracao customizada so aparecia para aulas experimentais. Agora, quando a aula nao for cobrada, o professor podera escolher a duracao manualmente (caso nenhum servico seja selecionado).

5. **Tornar o servico opcional quando `is_paid_class = false`** — aulas nao cobradas nao precisam de um servico vinculado (assim como as experimentais nao precisavam).

## Detalhes Tecnicos

### Mudancas no `formData` e `resetForm`:
- Remover a logica que seta `is_experimental` baseado no checkbox
- `is_experimental` permanece no tipo `ClassFormData` como `false` fixo
- A validacao de `service_id` passa a checar `!formData.is_paid_class` ao inves de `formData.is_experimental`

### Mudancas na validacao (`handleSubmit`):
- Onde hoje tem `!formData.is_experimental && !formData.service_id`, trocar para `formData.is_paid_class && !formData.service_id`
- Onde hoje tem `formData.is_experimental ? formData.duration_minutes : 60`, trocar para `!formData.is_paid_class && !formData.service_id ? formData.duration_minutes : serviceDuration`

### Mudanca no bloqueio de recorrencia:
- Linha 132: `const isRecurrenceBlocked = chargeTiming === 'prepaid' && formData.is_paid_class && !formData.is_experimental;`
- Simplifica para: `const isRecurrenceBlocked = chargeTiming === 'prepaid' && formData.is_paid_class;`

### Condicional do seletor de servico:
- Onde hoje tem `!formData.is_experimental`, trocar para `formData.is_paid_class` — o card de selecao de servico so aparece quando a aula e cobrada.

### Seletor de duracao para aulas gratuitas:
- Quando `is_paid_class = false` e nenhum servico selecionado, mostrar o campo de duracao customizada (o mesmo que aparecia para experimental).

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| `src/components/ClassForm/ClassForm.tsx` | Remover card experimental, ajustar condicoes, mover switch |

## O Que NAO Sera Alterado

- O campo `is_experimental` no banco de dados permanece (compatibilidade retroativa)
- A logica de cancelamento em `CancellationModal.tsx` continua verificando `is_experimental` (para aulas antigas)
- Badges de "Experimental" no calendario continuam funcionando para aulas historicas
- Nenhuma migration SQL necessaria
