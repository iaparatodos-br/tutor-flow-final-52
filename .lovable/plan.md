
## Simplificar alertas do modal de cancelamento para professores

### Problema
Quando o professor abre o modal de cancelamento, ele ve diferentes alertas dependendo do tipo de aula (experimental, prepaid, gratuita, etc). O comportamento correto eh sempre mostrar o mesmo alert verde simples:

**"Cancelamento Gratuito -- Como professor, voce pode cancelar a qualquer momento sem custos"**

### Alteracao

**`src/components/CancellationModal.tsx`** -- Bloco de alertas (linhas ~390-510)

Reorganizar a logica de renderizacao para que, quando `isProfessor` for `true`, exiba **apenas** o alert verde de cancelamento gratuito, ignorando todos os outros (pending, experimental, prepaid, unpaid, group class, charge). A secao de politica de cancelamento e horas ate a aula tambem sera ocultada para o professor, ja que nao se aplica.

Estrutura simplificada:

```text
{isProfessor ? (
  // Professor: sempre mostra apenas o alert verde de cancelamento gratuito
  <Alert verde>
    Cancelamento Gratuito
    Como professor, voce pode cancelar a qualquer momento sem custos
  </Alert>
) : (
  // Aluno: logica atual com todos os alertas condicionais (pending, charge, experimental, etc)
  ...codigo existente...
)}
```

Isso remove toda a complexidade condicional para o professor e garante uma experiencia consistente.
