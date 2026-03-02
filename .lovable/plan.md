
Objetivo: corrigir o cancelamento feito por responsável em aula em grupo com 2 dependentes (mesmo `student_id` + `dependent_id` diferentes), para que os dois participantes sejam cancelados e o status da aula mude para `cancelada`.

Resumo do diagnóstico (confirmado em logs e dados):
1) O erro atual não está mais na materialização; ela está funcionando:
- `materialize-virtual-class` cria a aula materializada e copia os 2 participantes corretamente.
2) A falha ocorre no `process-cancellation` durante validação de permissão:
- logs mostram: `Você não tem permissão para cancelar esta aula`.
- no banco, a aula materializada tem 2 linhas em `class_participants` com o mesmo `student_id` (responsável) e `dependent_id` distintos.
3) Causa raiz:
- em `supabase/functions/process-cancellation/index.ts`, a validação usa `.maybeSingle()` para buscar participação por `class_id + student_id`.
- quando existem 2 dependentes, a query retorna múltiplas linhas (PGRST116), cai no branch de erro e bloqueia o cancelamento.
4) Efeito observado:
- nenhum participante é atualizado para `cancelada`, então a trigger não altera `classes.status`, que permanece `confirmada`.

Implementação proposta:

1) Corrigir validação de permissão no `process-cancellation`
Arquivo:
- `supabase/functions/process-cancellation/index.ts`

Mudança:
- substituir validação com `.maybeSingle()` por estratégia tolerante a múltiplas linhas:
  - usar `.limit(1)` (ou `.select(...).eq(...);` e checar `length > 0`).
- regra: para `cancelled_by_type === 'student'`, validar existência de pelo menos 1 participação do `safeCancelledBy` na aula, mesmo quando houver `dependent_id`.

Resultado esperado:
- responsável com múltiplos dependentes na mesma aula passa na autorização sem erro de “multiple rows”.

2) Endurecer segurança/consistência da validação de aluno
Arquivo:
- `supabase/functions/process-cancellation/index.ts`

Mudança:
- remover o “skip” implícito da validação quando `dependent_id` existe.
- manter validação de responsável do dependente, mas também exigir participação real na aula (`class_id + student_id`).
- evita sucesso falso para requisições malformadas.

3) Garantir que houve atualização de participantes antes de retornar sucesso
Arquivo:
- `supabase/functions/process-cancellation/index.ts`

Mudança:
- no update do cenário “student leaving group class”, coletar linhas afetadas (ex.: com `select('id')` após update) e validar `updated.length > 0`.
- se 0 linhas, lançar erro de domínio (“nenhum participante elegível para cancelamento”).

Resultado esperado:
- evita resposta “sucesso” quando nenhuma linha foi alterada.

4) Corrigir tratamento de erro no frontend para não mascarar falhas da edge function
Arquivo:
- `src/components/CancellationModal.tsx`

Mudança:
- após `supabase.functions.invoke('process-cancellation')`, além de `if (error) throw error;`, validar `if (!data?.success) throw new Error(data?.error || ...)`.
- manter toast destrutivo no catch e não fechar modal quando houver erro.

Resultado esperado:
- usuário vê erro real quando backend falhar; não haverá falso positivo de cancelamento.

5) Limpeza técnica pequena (sem alterar comportamento)
Arquivo:
- `supabase/functions/process-cancellation/index.ts`

Mudança:
- remover variável morta `participantFilter` (não usada após refatoração anterior), para reduzir confusão.

Sequência de execução recomendada:
1. Ajustar validação de permissão no `process-cancellation` (passo crítico).
2. Ajustar verificação de linhas afetadas no update.
3. Ajustar frontend (`CancellationModal`) para checar `data.success`.
4. Testar cenário principal e regressões.

Plano de testes (foco no seu caso):
1) E2E principal (obrigatório):
- logar como responsável;
- cancelar aula em grupo com 2 dependentes;
- validar no calendário: aula vira `cancelada`;
- validar no banco: os 2 `class_participants.status = 'cancelada'`.
2) Regressão A:
- aula em grupo com famílias diferentes: cancelar por 1 responsável deve cancelar só os próprios participantes e manter aula ativa se ainda houver outros confirmados.
3) Regressão B:
- cancelamento por professor continua cancelando aula inteira.
4) Regressão C:
- simular erro no backend e validar que modal não fecha e mostra toast de erro.

Riscos e mitigação:
- Risco: alterar sem querer regra de negócio para grupo multi-família.
  - Mitigação: filtro de update permanece por `student_id = safeCancelledBy` no fluxo de aluno.
- Risco: resposta 200 com `success:false` continuar invisível ao usuário.
  - Mitigação: checagem explícita de `data.success` no frontend.

Arquivos impactados:
- `supabase/functions/process-cancellation/index.ts`
- `src/components/CancellationModal.tsx`
