

## Consolidar configuracoes financeiras em dois menus na sidebar

### Situacao atual

As configuracoes financeiras estao espalhadas em 4 lugares:

1. **Financeiro** (`/financeiro`) - Receitas e Despesas
2. **Contas de Recebimento** (`/painel/configuracoes/negocios`) - Perfis de Negocio, Vinculos Aluno-Negocio, Relatorios Financeiros
3. **Servicos** (`/servicos`) - Servicos e Precos, Mensalidades
4. **Configuracoes > Cobranca** (`/configuracoes` aba billing) - Timing de cobranca, dia de vencimento, geracao de boleto

### Proposta de simplificacao

Reduzir para **2 menus na sidebar**, cada um com uma nova tab:

```text
SIDEBAR (antes)                    SIDEBAR (depois)
+------------------+               +------------------+
| Dashboard        |               | Dashboard        |
| Alunos           |               | Alunos           |
| Agenda           |               | Agenda           |
| Materiais        |               | Materiais        |
| Financeiro       |               | Financeiro       |  <-- +tab "Contas de Recebimento"
|                  |               | Servicos         |  <-- NOVO item na sidebar
| Historico        |               | Historico        |
| Configuracoes    |               | Configuracoes    |  <-- remove tab "Cobranca"
+------------------+               +------------------+
```

### Alteracoes detalhadas

**1. Sidebar (`src/components/AppSidebar.tsx`)**
- Adicionar item "Servicos" (`/servicos`) com icone `Package` entre "Financeiro" e "Historico"
- Remover qualquer referencia a `/painel/configuracoes/negocios` (ja nao existe na sidebar, so no Dashboard)

**2. Financeiro (`src/pages/Financeiro.tsx`)**
- Adicionar uma terceira tab "Contas de Recebimento" ao lado de "Receitas" e "Despesas" (apenas para professores)
- O conteudo dessa tab sera apenas a parte de **Perfis de Negocio** extraida de `PainelNegocios.tsx` (criar/listar/excluir perfis de negocio, pendentes e ativos)
- As tabs "Vinculos Aluno-Negocio" e "Relatorios Financeiros" serao descartadas (pouco uteis)

**3. Servicos (`src/pages/Servicos.tsx`)**
- Adicionar uma terceira tab "Configuracoes" ao lado de "Servicos" e "Mensalidades"
- O conteudo dessa tab sera o componente `BillingSettings` (ja existe e esta pronto)

**4. Configuracoes (`src/pages/Configuracoes.tsx`)**
- Remover a tab "Cobranca" e toda a logica condicional associada (`showBillingTab`)
- Remover import do `BillingSettings`
- Ajustar o calculo de `getGridClass()` (remove 1 coluna)

**5. Dashboard (`src/pages/Dashboard.tsx`)**
- Atualizar o atalho que aponta para `/painel/configuracoes/negocios` para apontar para `/financeiro` (ou remover)

**6. Rota `/painel/configuracoes/negocios` (`src/App.tsx`)**
- Manter a rota por compatibilidade mas redirecionar para `/financeiro` (ou remover se preferir)

**7. Edge Function `create-business-profile`**
- Atualizar `refresh_url` e `return_url` de `/painel/configuracoes/negocios` para `/financeiro`

**8. i18n**
- Adicionar `navigation:sidebar.services` nos arquivos de navegacao (pt: "Servicos", en: "Services")
- Adicionar traducao para a tab "Contas de Recebimento" no namespace financial

### Arquivos a serem editados

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/AppSidebar.tsx` | Adicionar item "Servicos" na sidebar |
| `src/pages/Financeiro.tsx` | Adicionar tab "Contas de Recebimento" com conteudo de Perfis de Negocio |
| `src/pages/Servicos.tsx` | Adicionar tab "Configuracoes" com BillingSettings |
| `src/pages/Configuracoes.tsx` | Remover tab "Cobranca" |
| `src/pages/Dashboard.tsx` | Atualizar link de atalho |
| `src/App.tsx` | Manter/redirecionar rota antiga |
| `supabase/functions/create-business-profile/index.ts` | Atualizar URLs de retorno |
| `src/i18n/locales/pt/navigation.json` | Adicionar "services" |
| `src/i18n/locales/en/navigation.json` | Adicionar "services" |
| `src/i18n/locales/pt/financial.json` | Adicionar traducao da tab |
| `src/i18n/locales/en/financial.json` | Adicionar traducao da tab |

### Resultado final

- **Menu Financeiro**: 3 tabs - Receitas, Despesas, Contas de Recebimento
- **Menu Servicos**: 3 tabs - Servicos, Mensalidades, Configuracoes (billing)
- **Menu Configuracoes**: sem aba Cobranca (1 tab a menos)
- Tudo relacionado a dinheiro consolidado em apenas 2 menus na sidebar

