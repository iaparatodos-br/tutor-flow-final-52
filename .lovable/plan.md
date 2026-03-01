
## Corrigir aviso incorreto de “aula pendente” no cancelamento de aula virtual

### Diagnóstico do problema
O ajuste anterior corrigiu apenas a regra de cobrança (`classStatus`), mas o aviso visual no modal continua usando `classData.status`.

Hoje, no fluxo de aula virtual em `CancellationModal.tsx`, existe este trecho:
- `setClassData(... status: 'pendente')` para aulas virtuais.

Depois, a UI decide qual bloco mostrar com:
- `classData?.status === 'pendente'` → mostra alerta de aula pendente
- `classData?.status !== 'pendente'` → mostra política normal

Resultado: mesmo com cobrança calculada como “confirmada”, a interface ainda exibe “pendente”.

---

### Objetivo
Garantir que aulas virtuais sejam tratadas como **confirmadas** também na camada visual do modal (não só no cálculo da cobrança), removendo o alerta incorreto de pendência.

---

### Implementação proposta

1. **Unificar fonte de verdade do status no modal**
   - Em `src/components/CancellationModal.tsx`, criar um status resolvido para virtual:
     - usar `virtualClassData.status` quando disponível
     - fallback para `'confirmada'` em aulas virtuais
     - manter `fetchedClassData.status` para aulas materializadas (não virtuais)

2. **Corrigir `setClassData` no ramo virtual**
   - Trocar `status: 'pendente'` por status resolvido de virtual (confirmada por padrão).
   - Isso corrige diretamente os alertas condicionais do JSX.

3. **Evitar divergência entre cálculo e UI**
   - Reaproveitar o mesmo status resolvido no bloco de cálculo de cobrança (onde hoje já foi alterado para `'confirmada'`).
   - Assim, cálculo e renderização passam a usar a mesma regra e não entram em conflito novamente.

4. **(Recomendado para robustez) Passar status real da Agenda**
   - Em `src/pages/Agenda.tsx`, no objeto `virtualData` enviado ao modal, incluir `status: classToCancel.status`.
   - Em `CancellationModal.tsx`, adicionar `status?: ...` na interface `VirtualClassData`.
   - Benefício: se no futuro houver outra variação de status virtual, o modal seguirá o status de origem sem hardcode.

---

### Arquivos impactados
- `src/components/CancellationModal.tsx` (obrigatório)
- `src/pages/Agenda.tsx` (recomendado para robustez e consistência de tipagem)

---

### Critérios de aceite
- Ao cancelar aula virtual recorrente, **não** aparece mais alerta de “aula pendente”.
- O modal exibe os alertas corretos de política (cobrança/grátis/prepaid/experimental/unpaid) conforme regras atuais.
- Aulas realmente pendentes (não virtuais, quando aplicável) continuam exibindo alerta de pendência normalmente.

---

### Validação sugerida (manual)
1. Abrir uma aula virtual recorrente no calendário e clicar em cancelar.
2. Confirmar que o alerta de “pendente” não aparece.
3. Validar cenário dentro e fora da janela de cobrança para aluno.
4. Validar que os cenários especials continuam corretos:
   - experimental
   - unpaid
   - prepaid
   - aula pendente real (não virtual)

---

### Riscos e mitigação
- **Risco:** alterar status visual e quebrar lógica de pendência real.
- **Mitigação:** manter condição de pendência baseada no status real somente para aulas não virtuais/materializadas; usar status resolvido unificado para virtual com fallback seguro.
