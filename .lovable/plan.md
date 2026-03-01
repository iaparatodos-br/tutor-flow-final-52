
## Corrigir status de aulas virtuais no modal de cancelamento

### Problema
Na linha 219 de `CancellationModal.tsx`, aulas virtuais (geradas a partir de templates recorrentes) sao sempre tratadas como `'pendente'`:

```typescript
const classStatus = virtualClassData ? 'pendente' : fetchedClassData.status;
```

Isso faz com que o modal exiba o alerta "Aula Pendente - cancelamentos de aulas pendentes nao geram cobranca", quando na verdade aulas virtuais de series recorrentes ja estao confirmadas e deveriam respeitar a politica de cancelamento normalmente.

### Solucao
Alterar a linha 219 para considerar aulas virtuais como `'confirmada'` em vez de `'pendente'`, ja que elas sao geradas a partir de templates de aulas recorrentes que ja foram confirmadas.

### Alteracao

**Arquivo: `src/components/CancellationModal.tsx`** (linha 219)

Trocar:
```typescript
const classStatus = virtualClassData ? 'pendente' : fetchedClassData.status;
```

Por:
```typescript
const classStatus = virtualClassData ? 'confirmada' : fetchedClassData.status;
```

Isso garante que a logica de cobranca por cancelamento tardio seja aplicada corretamente a aulas virtuais, respeitando a politica de cancelamento do professor.
