

## Remover coluna "Aulas" do modal de alunos da mensalidade

### Problema
O modal de visualizacao de alunos vinculados a uma mensalidade exibe uma coluna "Aulas" que mostra a contagem de aulas realizadas (`classes_used`). Como a mensalidade e um valor fixo mensal independente da quantidade de aulas, essa informacao e irrelevante e pode confundir o professor, dando a impressao de que existe um limite de aulas.

### Alteracao

**Arquivo: `src/components/MonthlySubscriptionsManager.tsx`**

1. Remover o `<TableHead>Aulas</TableHead>` do cabecalho da tabela
2. Remover o `<TableCell>` correspondente que exibe `student.classes_used`

A tabela ficara com 3 colunas: **Aluno**, **Inicio** e **Acoes** — informacoes suficientes e relevantes para o professor gerenciar os vinculos.

