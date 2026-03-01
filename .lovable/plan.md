

## Adicionar verificacao e cascata ao desativar mensalidade com alunos

### Problema
Quando o professor desativa uma mensalidade pelo modal de edicao (Switch "Ativo"), o sistema apenas atualiza o campo `is_active` da mensalidade sem:
1. Exibir um aviso de confirmacao informando que alunos vinculados serao removidos
2. Executar a desativacao em cascata dos registros em `student_monthly_subscriptions`

### Solucao
Adicionar um dialog de confirmacao intermediario quando o professor tenta salvar uma mensalidade com `is_active = false` e ela possui alunos vinculados, e garantir que a mutation desative os alunos automaticamente.

### Alteracoes

**1. `src/components/MonthlySubscriptionsManager.tsx`**
- No `handleSubmit`, antes de chamar `updateMutation`, verificar se `is_active` esta sendo alterado de `true` para `false` e se `editingSubscription.students_count > 0`
- Se sim, exibir um AlertDialog de confirmacao (reutilizar as traducoes existentes `confirm.deactivate` e `confirm.deactivateDescription`)
- Adicionar state `pendingDeactivation` para armazenar os dados do form enquanto aguarda confirmacao
- Ao confirmar, prosseguir com o update

**2. `src/hooks/useMonthlySubscriptions.ts`**
- No `useUpdateMonthlySubscription`, quando `is_active = false`, apos atualizar a mensalidade, executar um update em `student_monthly_subscriptions` setando `is_active = false` e `ends_at = hoje` para todos os registros ativos daquela mensalidade
- Invalidar tambem as queries de `subscription-students` e `available-students-for-subscription`

### Detalhes tecnicos

No `useUpdateMonthlySubscription`:
```
// Apos o update da mensalidade, se is_active = false, desativar alunos
if (formData.is_active === false) {
  await supabase
    .from('student_monthly_subscriptions')
    .update({ is_active: false, ends_at: new Date().toISOString().split('T')[0] })
    .eq('subscription_id', id)
    .eq('is_active', true);
}
```

No `MonthlySubscriptionsManager`, novo state e AlertDialog:
- `pendingDeactivation: MonthlySubscriptionFormSchema | null`
- Quando o usuario salva com `is_active = false` e ha alunos, setar `pendingDeactivation` e abrir o dialog
- Ao confirmar, chamar o `updateMutation` com os dados pendentes
- Ao cancelar, limpar o state sem fechar o modal de edicao
