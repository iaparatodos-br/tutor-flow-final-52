

# Auditoria Final v2.7: 1 Componente Frontend Faltante + 1 Bug CSS

## Resumo

Cruzamento completo de todos os arquivos `.tsx` em `src/` e edge functions em `supabase/functions/` com o plano v2.7. Encontrei **1 arquivo frontend faltante** e **1 bug de CSS** nao relacionado a timezone.

---

## Gap: `src/pages/Legal.tsx` -- Formatacao de `published_at` sem timezone

**Linha 99**:

```typescript
format(new Date(doc.published_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
```

- `published_at` e `timestamptz` na tabela `legal_documents`
- Sem timezone, pode exibir dia anterior para usuarios em fusos negativos
- **Criticidade**: Baixa (data informativa de documentos legais)
- **Acao**: Adicionar a tabela do Passo 8 e a secao 3 (Arquivos Impactados)

---

## Bug bonus (nao timezone): Typo CSS em `Dashboard.tsx`

**Linha 208**:

```tsx
<p className="text-sm text-muted-foregoing">
```

Deveria ser `text-muted-foreground`. A classe `text-muted-foregoing` nao existe no Tailwind, fazendo o texto de descricao das politicas de cancelamento nao ter a cor correta.

**Acao**: Corrigir o typo junto com a atualizacao do documento.

---

## Alteracoes Propostas ao Documento

### 1. Tabela do Passo 8 -- Adicionar 1 linha

| Arquivo | Problema |
|---|---|
| `src/pages/Legal.tsx` | 1x `format()` sem timezone (`published_at` timestamptz) |

### 2. Secao 3 (Arquivos Impactados) -- Adicionar 1 linha

| Arquivo | Tipo de Mudanca |
|---|---|
| `src/pages/Legal.tsx` | Migrar 1x `format()` para utilitario timezone-aware |

### 3. Checklist item 7 -- Atualizar contagem

De **29 componentes** para **30 componentes** (29 + Legal.tsx).

### 4. Versao do documento

Atualizar para **v2.8** (v2.7 + Legal.tsx + correcao typo Dashboard.tsx).

