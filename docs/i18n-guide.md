# Guia de Internacionalização (i18n) - TutorFlow

## Visão Geral

O TutorFlow utiliza `react-i18next` para suporte completo a múltiplos idiomas (Português e Inglês).

## Idiomas Suportados

- 🇧🇷 **Português (pt)** - Idioma padrão
- 🇺🇸 **Inglês (en)**

## Estrutura de Arquivos

```
src/i18n/
├── index.ts                    # Configuração principal do i18n
└── locales/
    ├── pt/                     # Traduções em Português
    │   ├── common.json         # Strings comuns (botões, mensagens, placeholders)
    │   ├── navigation.json     # Menu e navegação
    │   ├── dashboard.json      # Dashboard
    │   ├── students.json       # Gestão de alunos
    │   ├── classes.json        # Aulas
    │   ├── materials.json      # Materiais didáticos
    │   ├── financial.json      # Módulo financeiro
    │   ├── settings.json       # Configurações
    │   ├── auth.json          # Autenticação
    │   ├── subscription.json   # Assinaturas e planos
    │   ├── expenses.json       # Despesas
    │   ├── notifications.json  # Notificações
    │   ├── cancellation.json   # Política de cancelamento
    │   ├── archive.json        # Arquivamento
    │   ├── billing.json        # Cobrança
    │   ├── services.json       # Serviços
    │   └── plans.json         # Planos de assinatura
    └── en/                     # Traduções em Inglês
        └── [mesmos arquivos]
```

## Como Usar

### 1. Importar o Hook

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('namespace');
  // ...
}
```

### 2. Escolher o Namespace Correto

Cada namespace agrupa traduções relacionadas:

- **common**: Strings genéricas (botões, mensagens de erro/sucesso, placeholders)
- **navigation**: Menu e navegação
- **dashboard**: Específico da página Dashboard
- **students**: Gestão de alunos
- **classes**: Gestão de aulas
- **materials**: Materiais didáticos
- **financial**: Módulo financeiro
- **settings**: Configurações
- **auth**: Login, registro, recuperação de senha
- **subscription**: Planos e assinaturas
- **expenses**: Despesas
- **notifications**: Notificações
- **cancellation**: Política de cancelamento
- **archive**: Dados arquivados
- **billing**: Cobrança
- **services**: Serviços
- **plans**: Planos de assinatura

### 3. Usar Traduções

```typescript
// Tradução simples
<h1>{t('title')}</h1>

// Tradução com namespace específico
const { t } = useTranslation('students');
<h1>{t('list.title')}</h1>

// Múltiplos namespaces
const { t } = useTranslation(['students', 'common']);
<button>{t('common:buttons.save')}</button>

// Com interpolação
<p>{t('greeting', { name: userName })}</p>
```

## Boas Práticas

### 1. **Use Sempre o Namespace Correto**

❌ **Errado:**
```typescript
const { t } = useTranslation('common');
<h1>{t('students.list.title')}</h1>
```

✅ **Correto:**
```typescript
const { t } = useTranslation('students');
<h1>{t('list.title')}</h1>
```

### 2. **Placeholders Genéricos em `common`**

Para inputs e formulários, use placeholders de `common`:

```typescript
const { t } = useTranslation(['students', 'common']);

<Input placeholder={t('common:placeholders.email')} />
<Input placeholder={t('common:placeholders.phone')} />
<Input placeholder={t('common:placeholders.fullName')} />
```

### 3. **Mensagens de Toast**

Use mensagens genéricas de `common`:

```typescript
const { t } = useTranslation('common');

toast({
  title: t('messages.saveSuccess'),
  description: t('messages.operationSuccess'),
});

toast({
  title: t('messages.error'),
  description: t('messages.genericError'),
  variant: "destructive",
});
```

### 4. **Botões Padrão**

```typescript
const { t } = useTranslation('common');

<Button>{t('buttons.save')}</Button>
<Button>{t('buttons.cancel')}</Button>
<Button>{t('buttons.delete')}</Button>
```

### 5. **Estrutura de Keys**

Organize as keys de forma hierárquica:

```json
{
  "list": {
    "title": "Lista de Alunos",
    "empty": "Nenhum aluno encontrado"
  },
  "form": {
    "title": "Novo Aluno",
    "fields": {
      "name": "Nome",
      "email": "Email"
    }
  }
}
```

## Placeholders Disponíveis em `common`

```typescript
// Exemplos de placeholders genéricos
t('common:placeholders.email')          // "email@exemplo.com"
t('common:placeholders.phone')          // "(11) 99999-9999"
t('common:placeholders.cpf')            // "000.000.000-00"
t('common:placeholders.cep')            // "00000-000"
t('common:placeholders.address')        // "Rua das Flores, 123"
t('common:placeholders.city')           // "São Paulo"
t('common:placeholders.state')          // "SP"
t('common:placeholders.fullName')       // "Nome completo"
t('common:placeholders.search')         // "Buscar..."
t('common:placeholders.selectStudent')  // "Selecione um aluno"
t('common:placeholders.selectCategory') // "Selecione uma categoria"
t('common:placeholders.description')    // "Descrição (opcional)"
t('common:placeholders.observations')   // "Observações..."
t('common:placeholders.value')          // "0,00"
```

## Mensagens Comuns

```typescript
// Mensagens de sucesso
t('common:messages.saveSuccess')
t('common:messages.updateSuccess')
t('common:messages.deleteSuccess')
t('common:messages.createSuccess')

// Mensagens de erro
t('common:messages.loadError')
t('common:messages.saveError')
t('common:messages.updateError')
t('common:messages.deleteError')
t('common:messages.genericError')

// Estados de loading
t('common:messages.loading')
t('common:messages.processing')
t('common:messages.saving')
t('common:messages.updating')
t('common:messages.deleting')
```

## Botões Padrão

```typescript
t('common:buttons.save')      // "Salvar"
t('common:buttons.cancel')    // "Cancelar"
t('common:buttons.delete')    // "Excluir"
t('common:buttons.edit')      // "Editar"
t('common:buttons.add')       // "Adicionar"
t('common:buttons.create')    // "Criar"
t('common:buttons.update')    // "Atualizar"
t('common:buttons.remove')    // "Remover"
t('common:buttons.close')     // "Fechar"
t('common:buttons.back')      // "Voltar"
t('common:buttons.confirm')   // "Confirmar"
```

## Seletor de Idioma

O componente `LanguageSelector` está disponível no menu principal e permite alternar entre Português e Inglês. A preferência é salva no localStorage.

## Debugging

### Ver Keys Faltando

No ambiente de desenvolvimento, keys faltando são logadas no console:

```
🌐 Missing translation: [students] list.title for language en
```

### Testar Traduções

1. Abra o seletor de idioma
2. Alterne entre PT e EN
3. Navegue pela aplicação verificando se todas as strings foram traduzidas

## Adicionando Novas Traduções

### 1. Escolha o namespace apropriado ou crie um novo

### 2. Adicione a key em AMBOS os idiomas:

**pt/students.json:**
```json
{
  "newFeature": {
    "title": "Novo Recurso",
    "description": "Descrição do recurso"
  }
}
```

**en/students.json:**
```json
{
  "newFeature": {
    "title": "New Feature",
    "description": "Feature description"
  }
}
```

### 3. Se criou um novo namespace, registre em `src/i18n/index.ts`:

```typescript
// Importar as traduções
import ptNewNamespace from './locales/pt/new-namespace.json';
import enNewNamespace from './locales/en/new-namespace.json';

// Adicionar aos resources
const resources = {
  pt: {
    // ...
    newNamespace: ptNewNamespace,
  },
  en: {
    // ...
    newNamespace: enNewNamespace,
  },
};

// Adicionar ao array de namespaces
i18n.init({
  // ...
  ns: ['common', 'navigation', /* ... */, 'newNamespace'],
});
```

### 4. Use no componente:

```typescript
const { t } = useTranslation('students');
<h1>{t('newFeature.title')}</h1>
```

## Checklist para Novos Componentes

- [ ] Importar `useTranslation` com namespace correto
- [ ] Substituir todas strings hard-coded por `t()`
- [ ] Usar placeholders de `common` para inputs
- [ ] Usar mensagens de toast de `common`
- [ ] Adicionar traduções em PT **e** EN
- [ ] Testar alternando idiomas

## Status Atual

✅ **Completo (100%)**
- ✅ Infraestrutura i18n
- ✅ Namespaces principais
- ✅ Páginas críticas (Auth, Planos, Configurações)
- ✅ Componentes principais
- ✅ LanguageSelector
- ✅ Placeholders genéricos
- ✅ Mensagens de toast genéricas
- ✅ Fallback para keys inexistentes

## Contribuindo

Ao adicionar novas features:
1. **SEMPRE** adicione traduções para PT e EN
2. Use namespaces existentes quando possível
3. Adicione mensagens genéricas em `common` se aplicável
4. Teste em ambos os idiomas antes do commit

---

**Última atualização:** 2025-10-13  
**Idiomas:** Português (pt), English (en)  
**Framework:** react-i18next v15.7.3
