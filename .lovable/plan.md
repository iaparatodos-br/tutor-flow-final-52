
# Aulas Pendentes: Sem Cobranca no Cancelamento

## Problema
Quando uma aula esta com status "pendente" (ainda nao confirmada pelo professor), o modal de cancelamento pode mostrar cobranca ao aluno mesmo que nao devesse. Aulas pendentes nunca devem gerar cobranca de cancelamento.

## Alteracoes

### 1. CancellationModal.tsx

**Receber e buscar o status da aula:**
- Adicionar `status` ao state `classData` (tipo `string`)
- Na query de classes (linha ~126), adicionar `status` ao SELECT
- Para classes virtuais (`virtualClassData`), considerar o status como `'pendente'` (classes virtuais sao templates nao confirmados)
- Adicionar checagem antes do calculo de cobranca: se `status === 'pendente'`, forcar `willBeCharged = false` e `chargeAmount = 0`

**Exibir alerta especifico:**
- Adicionar um novo bloco `Alert` (cor azul/indigo) quando `classData?.status === 'pendente'` e o aluno nao e professor, informando que nao havera cobranca porque a aula ainda esta pendente

### 2. Arquivos i18n (pt e en)

**PT - cancellation.json:** Adicionar em `alert`:
```text
"pending": {
  "title": "Aula Pendente",
  "noCharge": "Esta aula ainda nao foi confirmada pelo professor. Cancelamentos de aulas pendentes nao geram cobranca."
}
```

**EN - cancellation.json:** Adicionar em `alert`:
```text
"pending": {
  "title": "Pending Class",
  "noCharge": "This class has not yet been confirmed by the teacher. Cancellations of pending classes are not subject to charges."
}
```

### 3. Detalhes Tecnicos

- Na funcao `loadPolicyAndCalculateCharge`, a checagem do status `pendente` sera adicionada logo apos a checagem de `is_experimental`, antes da checagem de `is_paid_class`
- O alerta verde de "Cancelamento Gratuito" tambem sera suprimido quando o status for pendente (pois o alerta especifico de pendente ja cobre isso)
- Para `virtualClassData`, o status sera inferido como `'pendente'` pois classes virtuais sao por definicao nao-materializadas

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/CancellationModal.tsx` | Adicionar status ao state, fetch e logica de no-charge para pendente + novo Alert |
| `src/i18n/locales/pt/cancellation.json` | Adicionar `alert.pending` |
| `src/i18n/locales/en/cancellation.json` | Adicionar `alert.pending` |
