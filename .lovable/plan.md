
Diagnóstico confirmado:
- O erro real continua sendo `23505` na tabela `student_monthly_subscriptions` (índice único `idx_unique_active_subscription_per_relationship`).
- Pela requisição capturada, o app está tentando inserir novamente `relationship_id`s que já estão ativos na mesma mensalidade (`subscription_id = aaaa5501...`), então o conflito é esperado.
- Isso ocorre porque a lista “disponível” ainda considera alunos já vinculados à mensalidade atual como elegíveis.

Plano de correção (sem alterar banco/migration):
1) Corrigir a origem da lista de alunos disponíveis  
- Arquivo: `src/hooks/useMonthlySubscriptions.ts`  
- Ajustar `useAvailableStudentsForSubscription` para não excluir a mensalidade atual na checagem de ativo (remover `p_exclude_subscription_id` nessa consulta).  
- Resultado: aluno com mensalidade ativa (inclusive na mensalidade atual) não aparece como “disponível”.

2) Adicionar defesa na camada de tela (evitar reenvio de já vinculados)  
- Arquivo: `src/components/MonthlySubscriptionsManager.tsx`  
- Ao passar `availableStudents` para `StudentSubscriptionSelect`, também excluir os `relationship_id` que já estão ativos em `assignedStudents`.  
- Isso protege a UI mesmo com cache/stale momentâneo.

3) Tornar mutação em lote idempotente e resiliente  
- Arquivo: `src/hooks/useMonthlySubscriptions.ts`  
- No `useBulkAssignStudents`, antes de inserir, consultar vínculos ativos dos `toAdd` e remover da inserção os que já estão ativos.  
- Inserir apenas os realmente novos.  
- Se nada novo restar, finalizar sem erro (no-op controlado), evitando 409 desnecessário.

4) Eliminar erro “Uncaught (in promise)” no modal  
- Arquivo: `src/components/StudentSubscriptionSelect.tsx`  
- Envolver `await onAssign(...)` em `try/catch` no `handleAssign` para não estourar exceção no console quando a mutação falhar (o toast já cobre feedback de erro).

5) Ajustar feedback de usuário (opcional, recomendado)  
- Arquivos:  
  - `src/i18n/locales/pt/monthlySubscriptions.json`  
  - `src/i18n/locales/en/monthlySubscriptions.json`  
- Adicionar mensagem para caso “nenhum aluno novo para vincular” (ex.: já vinculados), evitando silêncio quando o usuário clica em salvar e nada muda.

Validação após implementação:
- Abrir `/servicos` → Mensalidades → “Ver Alunos” → “Vincular Alunos”.
- Confirmar que alunos já vinculados não aparecem mais na lista de seleção.
- Tentar “Selecionar todos” e salvar: não deve ocorrer `409` nem `Uncaught (in promise)`.
- Confirmar atualização correta de toasts e atualização da lista após salvar.
