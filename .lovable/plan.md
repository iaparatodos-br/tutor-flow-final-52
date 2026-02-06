
# Plano: Corrigir Erro ao Carregar Detalhes da Fatura

## Problema Identificado

Ao clicar em "Ver Detalhes" de uma fatura na página `/financeiro`, o sistema retorna o erro:

```
PGRST201: Could not embed because more than one relationship was found for 'class_participants' and 'profiles'
```

### Causa Raiz

A tabela `class_participants` possui **duas foreign keys** para a tabela `profiles`:
1. `class_participants_student_id_fkey` - referencia o aluno participante
2. `class_participants_cancelled_by_fkey` - referencia quem cancelou a participação

Quando a query tenta fazer join com `profiles` sem especificar qual FK usar, o PostgREST não consegue resolver a ambiguidade e retorna erro.

### Código Problemático (linha 327-342)

```typescript
const { data, error } = await supabase
  .from('invoice_classes')
  .select(`
    id,
    item_type,
    amount,
    description,
    charge_percentage,
    classes (
      id,
      class_date,
      duration_minutes
    ),
    class_participants (
      profiles (name)  // ← AMBÍGUO: qual FK usar?
    )
  `)
```

## Solução

Especificar explicitamente a foreign key a ser usada no join com `profiles`:

```typescript
class_participants (
  profiles!class_participants_student_id_fkey (name)
)
```

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Financeiro.tsx` | Corrigir query na função `loadInvoiceDetails` (linha ~339) para especificar a FK correta |

## Código Corrigido

```typescript
const { data, error } = await supabase
  .from('invoice_classes')
  .select(`
    id,
    item_type,
    amount,
    description,
    charge_percentage,
    classes (
      id,
      class_date,
      duration_minutes
    ),
    class_participants (
      profiles!class_participants_student_id_fkey (name)
    )
  `)
  .eq('invoice_id', invoice.id)
  .order('created_at', { ascending: true });
```

## Validação

Após a correção:
1. Acessar `/financeiro` como professor
2. Clicar em "Ver Detalhes" de qualquer fatura
3. O modal deve abrir sem erros e exibir os itens da fatura
