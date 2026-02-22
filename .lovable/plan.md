
## Ocultar badge de status na lista de aulas do dependente em telas pequenas

### Problema
Na lista de aulas dentro do card do dependente (linha 850), o badge de status (ex: "Aguardando Pagamento") ocupa muito espaco horizontal e estoura para fora do card em telas estreitas.

### Solucao
Adicionar a classe `hidden sm:block` no badge de status **apenas** na lista de aulas do dependente. Isso oculta o badge em telas pequenas (< 640px) e o exibe quando ha espaco suficiente. O icone de status (linha 836) ja indica visualmente o estado da aula, entao nenhuma informacao critica e perdida.

### Detalhes tecnicos

**Arquivo**: `src/pages/PerfilAluno.tsx`, linha 850

```
- {getStatusBadge(cls.status)}
+ <span className="hidden sm:inline-flex">{getStatusBadge(cls.status)}</span>
```

Apenas essa linha e alterada. As demais chamadas a `getStatusBadge` (aulas do aluno na linha 917, faturas na linha 972) permanecem inalteradas.
