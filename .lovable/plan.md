
## Corrigir cor do toast de cancelamento com cobranca

### Problema
Quando o cancelamento gera uma cobranca, o toast de sucesso usa `variant: "destructive"` (vermelho), o que confunde o usuario pois parece um erro.

### Alteracao

**`src/components/CancellationModal.tsx`** (linha ~287)

Remover a logica condicional do variant do toast, mantendo sempre `"default"`:

```text
// De:
variant: data.charged ? "destructive" : "default",

// Para:
variant: "default",
```

Isso eh uma mudanca de 1 linha no metodo `handleCancel`.
