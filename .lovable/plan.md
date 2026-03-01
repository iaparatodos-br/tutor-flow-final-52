

## Adicionar gerenciamento de categorias de materiais

### Problema
Na pagina de Materiais (`/materiais`), o professor consegue criar categorias via `CategoryModal`, mas nao consegue visualizar, editar ou excluir categorias existentes. O botao "Nova Categoria" apenas abre o modal de criacao.

### Solucao
Criar um componente `MaterialCategoryManager` (seguindo o padrao do `ExpenseCategoryManager` ja implementado para despesas) e integra-lo na pagina de Materiais.

### Alteracoes

**1. Novo componente: `src/components/MaterialCategoryManager.tsx`**
- Dialog que lista todas as categorias de material do professor (tabela `material_categories`)
- Botao de editar cada categoria (abre `CategoryModal` com dados preenchidos)
- Botao de excluir cada categoria com `AlertDialog` de confirmacao
- Botao para criar nova categoria
- Ao excluir, remove da tabela `material_categories` (materiais existentes com essa categoria terao `category_id` como referencia orfao, mas isso e aceitavel)

**2. Atualizar `src/pages/Materiais.tsx`**
- Substituir o botao "Nova Categoria" por um botao "Gerenciar Categorias" (icone `Settings`) que abre o `MaterialCategoryManager`
- Adicionar state `categoryManagerOpen`
- Passar callback `loadData` para recarregar apos alteracoes
- Remover import direto do `CategoryModal` (sera usado internamente pelo Manager)

**3. Adicionar traducoes em `src/i18n/locales/pt/materials.json` e `src/i18n/locales/en/materials.json`**
- Chaves para o gerenciador: `categoryManager.title`, `categoryManager.newCategory`, `categoryManager.deleted`, `categoryManager.deleteError`, `categoryManager.confirmDeleteTitle`, `categoryManager.confirmDeleteDescription`, `categoryManager.deleteAction`, `categoryManager.noCategories`
