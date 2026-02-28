

# Auditoria: Correções na exclusão de aluno (smart-delete-student)

## Resumo da Avaliação

A lógica de preservação fiscal (invoice_classes, class_participants, soft-delete de perfil) está **correta**. Porém, há **3 tabelas com dados do aluno direto que não são limpas**, podendo causar registros órfãos ou falhas de FK ao fazer hard-delete.

## Problemas Identificados

### 1. `class_report_feedbacks` do aluno direto -- NAO limpas
A função limpa feedbacks apenas para `dependent_id IN dependentIds`, mas nunca limpa feedbacks onde `student_id = student_id` do aluno principal. Quando ocorre hard-delete (sem faturas pagas), esses registros ficam com referência quebrada.

### 2. `material_access` do aluno direto -- NAO limpa
Mesma situação: só limpa para dependentes, nunca para `student_id = student_id`. Registros de compartilhamento de materiais ficam órfãos.

### 3. `class_notifications` -- NUNCA limpas
A tabela `class_notifications` tem coluna `student_id` e nunca é tratada na exclusão. Notificações do aluno permanecem após remoção.

## O que está CORRETO (não precisa mudar)

- Preservação de `invoice_classes` de faturas pagas/concluídas
- Preservação de `class_participants` vinculados a faturas pagas
- Soft-delete do perfil quando há faturas pagas (nome preservado, email anonimizado)
- Hard-delete do auth quando não há faturas pagas
- Exclusão de `student_monthly_subscriptions` antes do relationship
- Cascade delete de dependentes com mesma lógica de preservação fiscal
- Atualização do Stripe subscription quantity

## Correções Propostas

### Arquivo: `supabase/functions/smart-delete-student/index.ts`

Adicionar 3 etapas de limpeza **antes** da exclusão do relationship (na seção de "delete completely", por volta da linha 599):

1. **Deletar `class_report_feedbacks`** do aluno direto:
```
await supabaseAdmin.from('class_report_feedbacks').delete().eq('student_id', student_id);
```

2. **Deletar `material_access`** do aluno direto:
```
await supabaseAdmin.from('material_access').delete().eq('student_id', student_id);
```

3. **Deletar `class_notifications`** do aluno:
```
await supabaseAdmin.from('class_notifications').delete().eq('student_id', student_id);
```

Essas 3 linhas devem ser adicionadas logo antes do bloco que busca `class_participants` do aluno (linha 600), e também no fluxo de "unlink" (antes da linha 456) para o caso de desvinculação, filtrando apenas aulas do professor em questão.

### Observação sobre o fluxo "unlink"

No caso de desvinculação (aluno tem outros professores), as limpezas de `class_report_feedbacks`, `material_access` e `class_notifications` devem ser filtradas apenas para aulas daquele professor específico (via join com `classes.teacher_id`), para não apagar dados de outros professores.

## Resultado Esperado

- Nenhum registro órfão após exclusão completa do aluno
- Dados fiscais (faturas pagas, itens, participações) continuam preservados
- Limpeza segura no caso de unlink (apenas dados do professor em questão)

