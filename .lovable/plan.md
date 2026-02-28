

# Fix: Aulas somem do calendario apos cancelar aula virtual

## Problema

Ao cancelar uma aula virtual e fechar o modal, todas as aulas desaparecem do calendario. O problema ocorre porque o `onCancellationComplete` passa `loadClasses` sem argumentos:

```
onCancellationComplete={loadClasses}
```

Quando `loadClasses()` e chamado sem argumentos, ele usa um fallback de `new Date()` ate `now + 1 mes`, ignorando o `visibleRange` atual do calendario. Se o usuario esta visualizando um mes diferente do atual, as aulas carregadas nao correspondem ao que o calendario exibe, e o resultado e um calendario vazio.

## Correcao

### `src/pages/Agenda.tsx` - Passar visibleRange ao recarregar

Alterar a linha 1863 para usar uma callback que passa o `visibleRange` atual:

```typescript
// ANTES:
onCancellationComplete={loadClasses}

// DEPOIS:
onCancellationComplete={() => {
  if (visibleRange) {
    loadClasses(visibleRange.start, visibleRange.end);
  } else {
    loadClasses();
  }
}}
```

Isso garante que, apos o cancelamento, as aulas sejam recarregadas exatamente para o intervalo de datas que o usuario esta visualizando no calendario.

## Verificacao adicional

Existem outros locais no arquivo que chamam `loadClasses` sem argumentos apos acoes (como concluir aula, confirmar, etc.). Vou verificar se ha outros pontos com o mesmo problema e corrigi-los na mesma alteracao.

## Arquivo impactado

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Agenda.tsx` | Passar `visibleRange` no `onCancellationComplete` e em outros callbacks similares |

