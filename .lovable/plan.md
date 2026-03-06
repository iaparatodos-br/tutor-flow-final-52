

# Cleanup: Remover sistema de class_exceptions (codigo morto)

## Contexto

O sistema de `class_exceptions` foi planejado para permitir editar/cancelar ocorrencias individuais de aulas recorrentes, mas essa funcionalidade nunca foi integrada na UI e nao faz parte do fluxo atual. Todos os componentes e Edge Functions relacionados sao codigo morto.

## O que sera removido

### Frontend (3 arquivos)
- `src/components/ClassExceptionForm.tsx` — formulario de excecao individual (nunca importado)
- `src/components/FutureClassExceptionForm.tsx` — formulario de excecao futura (nunca importado)
- `src/components/RecurringClassActionModal.tsx` — modal de escolha "esta" vs "esta e futuras" (nunca importado)

### Edge Functions (2 arquivos)
- `supabase/functions/manage-class-exception/index.ts` — cria excecoes individuais (nunca invocado)
- `supabase/functions/manage-future-class-exceptions/index.ts` — cria excecoes em lote (nunca invocado)

### Ajustes em Edge Functions existentes (2 arquivos)
- `supabase/functions/end-recurrence/index.ts` — remover a linha que deleta `class_exceptions` (linha 153)
- `supabase/functions/archive-old-data/index.ts` — remover a linha que deleta `class_exceptions` (linha 203)

### Banco de dados
- Migrar para **dropar** a tabela `class_exceptions` (inclui RLS policies e foreign keys)

## O que NAO sera removido
- A tabela `class_exceptions` no banco so sera dropada apos confirmar que nao ha dados nela. A migracao verificara isso.

