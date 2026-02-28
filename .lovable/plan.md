

# Fix: Aulas virtuais nao herdam `is_paid_class` do template

## Causa raiz

A funcao RPC `get_classes_with_participants` **nao inclui o campo `is_paid_class`** no SELECT. Quando o frontend carrega os templates via essa RPC, o campo vem como `undefined`. Ao gerar instancias virtuais com `...templateClass`, o `is_paid_class` continua `undefined`. Na materializacao (INSERT no banco), o campo `undefined` viola a constraint NOT NULL da coluna `is_paid_class`.

O template esta sendo criado corretamente com `is_paid_class = true` no banco, mas a informacao se perde no caminho de volta ao frontend.

## Correcao

### 1. Migracao: Atualizar a RPC `get_classes_with_participants`

Adicionar `c.is_paid_class` ao SELECT de ambas as queries (materializadas e templates) na funcao RPC.

### 2. `src/pages/Agenda.tsx` - Fallback defensivo na materializacao

Manter o fallback `?? false` na linha 1312 como camada de seguranca adicional, caso templates antigos no banco tenham `is_paid_class = NULL` (improvavel mas defensivo):

```text
is_paid_class: virtualClass.is_paid_class ?? false,
```

## Impacto

| Componente | Alteracao |
|------------|-----------|
| RPC `get_classes_with_participants` | Adicionar `c.is_paid_class` nos dois SELECTs |
| `src/pages/Agenda.tsx` | Fallback `?? false` no `materializeVirtualClass` |

Com essa correcao, o fluxo completo fica:
1. Template criado com `is_paid_class = true` (ja funciona)
2. RPC retorna `is_paid_class` do template (correcao)
3. Virtual herda via spread (ja funciona)
4. Materializacao insere o valor correto (correcao + fallback)

