
Objetivo: corrigir definitivamente o caso “Aula confirmada não cobrada virtual” exibindo alerta pré-pago (amber) em vez de “Política + Aula Gratuita” (emerald).

Diagnóstico confirmado no código atual

1) O problema não está no modal em si; está no dado que chega nele para aulas virtuais.
- Em `CancellationModal.tsx`, o amber só aparece quando:
  - `classData.charge_timing === 'prepaid'` e
  - `classData.is_paid_class === true`.
- Para aula não cobrada, deveria chegar `is_paid_class === false` e aí aparece o emerald.

2) No fluxo de aluno em `Agenda.tsx`, as queries de `classes` não selecionam `is_paid_class`.
- Blocos de query do aluno (materializadas, templates, grupo, dependentes) selecionam `id`, `class_date`, `status`, etc., mas não `is_paid_class`.
- Resultado: templates/instâncias virtuais chegam com `is_paid_class` indefinido.

3) Em `handleRecurringClassCancel`, o `virtualData` usa fallback que transforma indefinido em pago:
- `is_paid_class: classToCancel.is_paid_class ?? true`
- Como o professor está em `charge_timing = prepaid`, o modal interpreta como pré-paga e mostra amber.

4) Evidência de dados de negócio:
- Templates recorrentes desse professor estão `is_paid_class = false`.
- Portanto, o alerta esperado é emerald, não amber.

Plano de correção

1) Incluir `is_paid_class` em todas as queries de aluno no `loadClasses` da `Agenda.tsx`
Arquivo: `src/pages/Agenda.tsx`

Adicionar `is_paid_class` nos `select` de:
- Query 1: aulas materializadas individuais
- Query 2: aulas materializadas em grupo
- Query 3: templates individuais
- Query 4: templates em grupo
- Query 5: aulas materializadas de dependentes
- Query 6: templates de dependentes

Resultado esperado desta etapa:
- `ClassWithParticipants` passa a carregar `is_paid_class` corretamente para templates e virtuais.

2) Ajustar fallback de `is_paid_class` no cancelamento virtual para evitar falso-positivo de pré-paga
Arquivo: `src/pages/Agenda.tsx` (bloco `handleRecurringClassCancel`)

Trocar:
- `is_paid_class: classToCancel.is_paid_class ?? true`
por fallback seguro para recorrência:
- `is_paid_class: classToCancel.is_paid_class ?? false`

Justificativa:
- Recorrência pré-paga paga é bloqueada por regra de negócio; portanto, em ausência de dado, o default “true” cria erro de UX.
- Esse ajuste elimina a classificação indevida como pré-paga quando houver qualquer lacuna de carregamento.

3) Manter o fluxo atual do modal (sem alterar regras de negócio de cobrança)
Arquivo: `src/components/CancellationModal.tsx`

Nenhuma mudança de regra necessária:
- A lógica já está correta se `is_paid_class` vier corretamente.
- Com os dados corrigidos, o modal exibirá:
  - Política + emerald para virtual não cobrada.
  - Amber somente quando realmente pré-paga e paga.

Validação (checklist de aceite)

1) Caso reportado pelo usuário (principal)
- Aula virtual recorrente confirmada, não cobrada (`is_paid_class=false`), professor com `charge_timing=prepaid`.
- Esperado:
  - Exibir bloco de política.
  - Exibir alerta emerald “Aula Gratuita”.
  - Não exibir alerta amber.

2) Regressão de cenários próximos
- Virtual confirmada pós-paga paga: dentro do prazo => green; fora do prazo => red (se módulo financeiro ativo).
- Virtual confirmada pré-paga paga (se existir por legado/dado manual): amber.
- Virtual experimental: violeta.
- Não virtual pendente: azul exclusivo.

3) Verificação técnica rápida
- Conferir no Network da query `classes` (fluxo aluno) que o `select` agora inclui `is_paid_class`.
- Conferir no objeto `classToCancel` e no `virtualData` que `is_paid_class` chega booleano correto antes de abrir o modal.

Riscos e mitigação

- Risco baixo: alteração é pontual em `select` e fallback do virtualData.
- Mitigação:
  - Não mexer na lógica financeira do backend/edge.
  - Validar explicitamente os cenários acima antes de concluir.

Escopo final de implementação
- `src/pages/Agenda.tsx`:
  - adicionar `is_paid_class` nos selects do fluxo de aluno.
  - ajustar fallback de `is_paid_class` no `virtualData` do cancelamento recorrente.
- `src/components/CancellationModal.tsx`:
  - sem alteração funcional (apenas validação comportamental pós-correção).
