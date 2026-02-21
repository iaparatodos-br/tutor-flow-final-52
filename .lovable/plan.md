
## Correcao: Valor de Cobranca de Cancelamento Mostrando R$ 100,00 em Vez do Valor Real

### Problema Identificado
Ao cancelar uma aula recorrente (virtual), o aviso de cancelamento exibe "Valor da cobranca: R$ 100,00" em vez do valor real do servico (R$ 46,84). Isso acontece porque o preco do servico nao esta sendo passado para o modal de cancelamento.

### Causa Raiz
O bug ocorre em **dois pontos** que se conectam:

1. **`src/pages/Agenda.tsx` (linha 1746)**: Ao preparar os dados de uma aula virtual para cancelamento, o campo `service_price` e explicitamente definido como `null`, mesmo tendo o `service_id` disponivel e a lista de servicos (`services`) ja carregada em memoria.

2. **`src/components/CancellationModal.tsx` (linha 229)**: Quando `class_services?.price` e `null` ou `undefined`, o codigo usa um fallback de R$ 100,00:
   ```
   const baseAmount = fetchedClassData.class_services?.price || 100;
   ```

### Solucao

**Arquivo 1: `src/pages/Agenda.tsx`**
- Na funcao `handleRecurringClassCancel`, buscar o preco do servico a partir da lista `services` ja disponivel em memoria, usando o `service_id` da aula.
- Mudar de `service_price: null` para buscar o preco real.

**Arquivo 2: `src/components/CancellationModal.tsx`**
- Remover o fallback perigoso de `|| 100` na linha 229. Se nao houver preco definido, o valor deve ser `0`, nao `100`.
- Isso garante que, mesmo em cenarios inesperados, o sistema nunca exiba um valor falso de R$ 100,00.

### Detalhes Tecnicos

**Mudanca em Agenda.tsx (linha ~1746):**
```
// ANTES:
service_price: null, // Will be fetched from service if needed

// DEPOIS:
service_price: fullClassData.service_id
  ? services.find(s => s.id === fullClassData.service_id)?.price || 0
  : 0,
```

**Mudanca em CancellationModal.tsx (linha ~229):**
```
// ANTES:
const baseAmount = fetchedClassData.class_services?.price || 100;

// DEPOIS:
const baseAmount = fetchedClassData.class_services?.price || 0;
```

Com o fallback em `0`, se por algum motivo o preco nao for encontrado, o alerta de cobranca simplesmente mostrara R$ 0,00 (sem cobranca), o que e muito mais seguro do que inventar um valor de R$ 100,00.

### Impacto
- Corrige o valor exibido no aviso de cancelamento para aulas recorrentes/virtuais
- Elimina o risco de cobrar valores incorretos baseados em fallback arbitrario
- Nenhuma mudanca em logica de backend ou banco de dados necessaria
