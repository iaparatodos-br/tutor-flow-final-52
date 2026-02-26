

# Correcao: Valor de Cobranca no Modal de Cancelamento

## Problema Identificado

Quando um **aluno** abre o modal de cancelamento, o valor da cobranca aparece como **R$ 0,00** em vez do valor correto (ex: R$ 10,00). A causa raiz esta na linha 229 de `CancellationModal.tsx`:

```text
const baseAmount = fetchedClassData.class_services?.price || 0;
```

O `class_services` retorna `null` porque a **politica RLS** na tabela `class_services` nao esta funcionando corretamente para alunos. A politica atual referencia `c.student_id` (coluna deprecada apos a refatoracao para `class_participants`), e o `LEFT JOIN` pode nao resolver corretamente em todos os cenarios.

## Evidencia

Os dados de rede confirmam que todas as consultas do aluno retornam `"class_services": null` nos dados das aulas, mesmo quando as aulas possuem `service_id` valido (ex: `d7908ade-...`, `793976f2-...`).

## Plano de Correcao

### 1. Atualizar a politica RLS de `class_services` (Migration SQL)

Substituir a politica existente por uma versao que dependa exclusivamente de `class_participants` (sem referenciar a coluna deprecada `c.student_id`):

```text
DROP POLICY IF EXISTS "Students can view services for their classes" ON public.class_services;

CREATE POLICY "Students can view services for their classes"
ON public.class_services
FOR SELECT
USING (
  id IN (
    SELECT c.service_id
    FROM classes c
    JOIN class_participants cp ON c.id = cp.class_id
    WHERE cp.student_id = auth.uid()
      AND c.service_id IS NOT NULL
  )
);
```

Mudancas:
- Removida referencia a `c.student_id` (coluna deprecada)
- Trocado `LEFT JOIN` por `JOIN` (mais eficiente, so precisa de participantes reais)
- Adicionado filtro `c.service_id IS NOT NULL` para performance

### 2. Adicionar fallback no CancellationModal (seguranca)

No arquivo `src/components/CancellationModal.tsx`, adicionar uma segunda tentativa de buscar o preco do servico caso o join retorne null (protecao contra RLS restritiva):

Na funcao `loadPolicyAndCalculateCharge`, apos a query principal (linha ~136), se `class_services` for null e `service_id` existir, fazer uma query direta:

```text
// Se class_services veio null (possivel RLS), buscar preco diretamente
if (!fetchedClassData.class_services && fetchedClassData.service_id) {
  const { data: serviceData } = await supabase
    .from('class_services')
    .select('price')
    .eq('id', fetchedClassData.service_id)
    .maybeSingle();
  
  if (serviceData) {
    fetchedClassData.class_services = serviceData;
  }
}
```

### 3. Atualizar o comentario desatualizado

Linha 228: trocar `// Use actual service price or default to 100` por `// Use actual service price, fallback to 0 for financial safety`.

## Arquivos Alterados

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/migrations/new_migration.sql` | Nova migration corrigindo RLS de `class_services` para alunos |
| `src/components/CancellationModal.tsx` | Fallback de busca de preco + comentario corrigido |

## Resultado Esperado

Apos a correcao, quando o aluno abrir o modal de cancelamento de uma aula fora do prazo, o sistema exibira corretamente o valor da cobranca (ex: R$ 10,00 = 50% de R$ 20,00) em vez de R$ 0,00.

