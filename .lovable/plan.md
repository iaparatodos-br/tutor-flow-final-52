

# Fix: Preservar dados fiscais no smart-delete-student

## Problema identificado

A funcao `smart-delete-student` deleta registros de `invoice_classes` e `class_participants` mesmo quando existem faturas pagas associadas. Isso causa perda de dados fiscais essenciais para auditoria, comprovantes e historico financeiro.

Alem disso, ao deletar o usuario via `auth.admin.deleteUser`, o perfil (nome, email, CPF) tambem e perdido, impossibilitando a identificacao do aluno em faturas historicas.

## Solucao proposta

Alterar a logica de exclusao para **preservar registros vinculados a faturas pagas/concluidas**, deletando apenas os que nao tem vinculo fiscal.

### Alteracoes em `supabase/functions/smart-delete-student/index.ts`

#### 1. Preservar `invoice_classes` de faturas pagas

Antes de deletar `invoice_classes`, filtrar para manter os que estao vinculados a faturas com status `paga` ou `concluida`:

```text
ANTES (linha 551-552):
  if (studentParticipantIds.length > 0) {
    await supabaseAdmin.from('invoice_classes').delete().in('participant_id', studentParticipantIds);
  }

DEPOIS:
  if (studentParticipantIds.length > 0) {
    // Buscar invoice_classes vinculados a faturas NAO pagas
    const { data: deletableInvoiceClasses } = await supabaseAdmin
      .from('invoice_classes')
      .select('id, invoice_id, invoices!inner(status)')
      .in('participant_id', studentParticipantIds)
      .not('invoices.status', 'in', '("paga","concluida")');

    const deletableIds = (deletableInvoiceClasses || []).map(ic => ic.id);
    if (deletableIds.length > 0) {
      await supabaseAdmin.from('invoice_classes').delete().in('id', deletableIds);
    }
  }
```

A mesma logica sera aplicada na secao de dependentes (linhas 515-517).

#### 2. Preservar `class_participants` vinculados a faturas pagas

Em vez de deletar todos os `class_participants`, preservar aqueles cujo `id` aparece em `invoice_classes` de faturas pagas:

```text
ANTES (linha 554):
  await supabaseAdmin.from('class_participants').delete().eq('student_id', student_id);

DEPOIS:
  // Buscar participant_ids que tem invoice_classes em faturas pagas
  const { data: billedParticipants } = await supabaseAdmin
    .from('invoice_classes')
    .select('participant_id, invoices!inner(status)')
    .in('participant_id', studentParticipantIds)
    .in('invoices.status', ['paga', 'concluida']);

  const preserveIds = [...new Set((billedParticipants || []).map(bp => bp.participant_id).filter(Boolean))];

  if (preserveIds.length > 0) {
    // Deletar apenas os NAO vinculados a faturas pagas
    const toDelete = studentParticipantIds.filter(id => !preserveIds.includes(id));
    if (toDelete.length > 0) {
      await supabaseAdmin.from('class_participants').delete().in('id', toDelete);
    }
  } else {
    await supabaseAdmin.from('class_participants').delete().eq('student_id', student_id);
  }
```

#### 3. Soft-delete do perfil em vez de hard-delete (quando ha faturas pagas)

Quando o aluno tem faturas pagas, em vez de deletar via `auth.admin.deleteUser`, manter o perfil mas anonimizar dados sensiveis:

```text
// Verificar se tem faturas pagas
const { count: paidInvoicesCount } = await supabaseAdmin
  .from('invoices')
  .select('id', { count: 'exact', head: true })
  .eq('student_id', student_id)
  .in('status', ['paga', 'concluida']);

if (paidInvoicesCount && paidInvoicesCount > 0) {
  // Soft-delete: manter perfil mas marcar como inativo
  await supabaseAdmin
    .from('profiles')
    .update({
      role: 'deleted',
      email: `deleted_${student_id}@removed.local`,
      name: profiles.name, // preservar nome para faturas
      updated_at: new Date().toISOString()
    })
    .eq('id', student_id);
  // NAO deletar auth user - manter para integridade referencial
} else {
  // Hard-delete normal (sem faturas pagas)
  await supabaseAdmin.auth.admin.deleteUser(student_id);
}
```

### Mesma logica para dependentes

Aplicar o mesmo tratamento nas funcoes `deleteDependentsCascade` (linhas 200-299) e no bloco de exclusao completa de dependentes (linhas 500-532).

## Arquivo impactado

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/smart-delete-student/index.ts` | Preservar invoice_classes, class_participants e perfil quando ha faturas pagas |

## Resultado esperado

- Aluno removido da lista ativa do professor (relationship deletado)
- Aluno nao aparece mais na UI
- Faturas pagas (`invoices`) continuam intactas com todos os itens (`invoice_classes`)
- Participacoes vinculadas a faturas pagas permanecem para rastreabilidade
- Nome do aluno preservado no perfil para exibicao em faturas historicas
- Alunos sem faturas pagas continuam sendo deletados completamente (comportamento atual)
