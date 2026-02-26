
Objetivo: corrigir de forma definitiva o scroll do seletor de horas no modal de agendamento, já que trocar `ScrollArea` por `div overflow-y-auto` não resolveu no contexto real do `Dialog`.

Diagnóstico confirmado
- O `TimePicker` está dentro de `ClassForm`, que roda dentro de `DialogContent`.
- O dropdown de horas/minutos usa `PopoverContent` portaled para `body`.
- Esse cenário é um conflito conhecido do Radix (`Dialog` + `Popover` portaled + `react-remove-scroll`): o conteúdo abre, mas o wheel/touch scroll em áreas com overflow pode ser bloqueado ou “roubado” pelo container do modal.
- Evidência no replay: há abertura do popover, mas os eventos de scroll efetivos aparecem no container do modal (`Dialog`) e não na lista interna do seletor.

Implementação proposta

1) Tornar `PopoverContent` compatível com portal customizado
- Arquivo: `src/components/ui/popover.tsx`
- Adicionar suporte opcional de `container` no `PopoverContent` (prop do `PopoverPrimitive.Portal`).
- Comportamento:
  - Se `container` for informado, renderizar o portal nesse container.
  - Se não for, manter comportamento atual (portal no `body`).
- Resultado: permite “ancorar” o popover dentro do subtree do `Dialog`, evitando conflito com scroll lock.

2) Ajustar `TimePicker` para usar container do próprio dialog
- Arquivo: `src/components/ui/time-picker.tsx`
- Adicionar `ref` no wrapper do campo e identificar, ao abrir, o ancestral mais próximo com `role="dialog"` (ou fallback para `null`).
- Passar esse elemento como `container` para `PopoverContent`.
- Manter toda a UX existente (digitação manual + lista de horas/minutos), sem regressão funcional.

3) Blindar o scroll interno das colunas
- Arquivo: `src/components/ui/time-picker.tsx`
- Nas colunas de hora/minuto (`div` com `overflow-y-auto`):
  - adicionar `overscroll-contain`;
  - adicionar `onWheelCapture={(e) => e.stopPropagation()}` para impedir que o wheel suba para o scroll do modal.
- Objetivo: garantir que, ao rolar sobre as colunas, o movimento fique nelas.

4) Pequeno cleanup
- Arquivo: `src/components/ui/time-picker.tsx`
- Remover import não utilizado (`Input`) para manter qualidade de código.

Validação (obrigatória)
1. Abrir `/agenda` > modal “Agendar aula”.
2. Abrir `TimePicker`.
3. Rolar com mouse wheel/trackpad na coluna “Hora” e “Min”.
4. Confirmar que:
   - as colunas rolam;
   - o modal por trás não rola enquanto o cursor está nas colunas;
   - seleção por clique continua funcionando;
   - digitação manual (`1430` => `14:30`) continua funcionando.
5. Testar também em viewport mobile no preview (toque/arrasto vertical nas colunas).

Risco e fallback
- Risco baixo, mudança localizada em `Popover` + `TimePicker`.
- Se algum ambiente ainda apresentar bloqueio raro, fallback imediato: renderizar o popover do `TimePicker` sem portal apenas para esse componente (não global), preservando os demais popovers do sistema.

Arquivos impactados
- `src/components/ui/popover.tsx`
- `src/components/ui/time-picker.tsx`
