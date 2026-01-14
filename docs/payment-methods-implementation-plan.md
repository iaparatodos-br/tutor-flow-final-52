# Plano de Implementação: Métodos de Pagamento Configuráveis pelo Professor

> **Versão**: 1.1  
> **Data**: 2026-01-14  
> **Status**: Planejamento

---

## 1. Resumo Executivo

Permitir que professores configurem quais métodos de pagamento (Cartão, Boleto, PIX) estarão disponíveis para seus alunos, com total transparência sobre as taxas de cada método. Quando apenas um método estiver habilitado, o aluno é direcionado diretamente ao Stripe.

### Decisões de Design

| Aspecto | Decisão |
|---------|---------|
| Configuração de métodos | Toggle individual por método |
| Ordem de exibição | Alfabética (Boleto → Cartão → PIX) |
| Default para novos professores | Todos habilitados |
| Exibição de taxas | Com exemplo prático |

---

## 2. Taxas Oficiais do Stripe Brasil

| Método | Taxa | Exemplo (R$ 200,00) |
|--------|------|---------------------|
| **Boleto** | R$ 3,49 fixo | R$ 3,49 |
| **PIX** | 1,19% | R$ 2,38 |
| **Cartão** | 3,99% + R$ 0,39 | R$ 8,37 |

> **Fonte**: [Stripe Brasil - Local Payment Methods](https://stripe.com/en-br/pricing/local-payment-methods)

---

## 3. Alterações no Banco de Dados

### 3.1 Migração SQL

```sql
-- Adicionar coluna para métodos de pagamento habilitados
ALTER TABLE business_profiles 
ADD COLUMN enabled_payment_methods TEXT[] DEFAULT ARRAY['boleto', 'pix', 'card'];

-- Comentário para documentação
COMMENT ON COLUMN business_profiles.enabled_payment_methods IS 
  'Array de métodos de pagamento habilitados pelo professor: boleto, pix, card';
```

### 3.2 Campos Afetados

| Tabela | Campo | Tipo | Default | Descrição |
|--------|-------|------|---------|-----------|
| `business_profiles` | `enabled_payment_methods` | `TEXT[]` | `['boleto', 'pix', 'card']` | Métodos habilitados |

### 3.3 Regeneração de Tipos

Após a migração, regenerar os tipos do Supabase:

```bash
npx supabase gen types typescript --project-id nwgomximjevgczwuyqcx > src/integrations/supabase/types.ts
```

---

## 4. Constantes de Taxas

### 4.1 Arquivo: `src/utils/stripe-fees.ts`

```typescript
/**
 * Stripe fee calculation utilities for all payment methods
 * Updated: 2026-01-14
 * Source: https://stripe.com/en-br/pricing/local-payment-methods
 */

// Constantes existentes (manter)
export const STRIPE_BOLETO_FEE = 3.49;
export const MINIMUM_BOLETO_AMOUNT = 5.00;
export const MAXIMUM_BOLETO_AMOUNT = 49999.99;

// Taxas do Stripe Brasil - NOVAS
export const STRIPE_FEES = {
  boleto: {
    type: 'fixed' as const,
    value: 3.49,
    label: 'R$ 3,49 por transação',
    labelKey: 'billing.paymentMethods.methods.boleto.fee'
  },
  pix: {
    type: 'percentage' as const,
    value: 1.19,
    label: '1,19%',
    labelKey: 'billing.paymentMethods.methods.pix.fee'
  },
  card: {
    type: 'percentage_plus_fixed' as const,
    percentage: 3.99,
    fixed: 0.39,
    label: '3,99% + R$ 0,39',
    labelKey: 'billing.paymentMethods.methods.card.fee'
  }
} as const;

export type PaymentMethodType = keyof typeof STRIPE_FEES;

export const PAYMENT_METHOD_ORDER: PaymentMethodType[] = ['boleto', 'card', 'pix'];

export const PAYMENT_METHOD_CONFIG = {
  boleto: {
    id: 'boleto',
    name: 'Boleto Bancário',
    nameKey: 'billing.paymentMethods.methods.boleto.name',
    icon: 'Receipt',
    fee: STRIPE_FEES.boleto
  },
  card: {
    id: 'card',
    name: 'Cartão de Crédito',
    nameKey: 'billing.paymentMethods.methods.card.name',
    icon: 'CreditCard',
    fee: STRIPE_FEES.card
  },
  pix: {
    id: 'pix',
    name: 'PIX',
    nameKey: 'billing.paymentMethods.methods.pix.name',
    icon: 'QrCode',
    fee: STRIPE_FEES.pix
  }
} as const;

/**
 * Calcula a taxa para um valor específico
 */
export const calculateFee = (method: PaymentMethodType, amount: number): number => {
  const config = STRIPE_FEES[method];
  if (!config) return 0;
  
  switch (config.type) {
    case 'fixed':
      return config.value;
    case 'percentage':
      return (amount * config.value) / 100;
    case 'percentage_plus_fixed':
      return (amount * config.percentage / 100) + config.fixed;
    default:
      return 0;
  }
};

/**
 * Formata a taxa calculada para exibição
 */
export const formatFeeExample = (method: PaymentMethodType, amount: number): string => {
  const fee = calculateFee(method, amount);
  return formatCurrency(fee);
};

/**
 * Ordena métodos alfabeticamente (Boleto → Cartão → PIX)
 */
export const sortPaymentMethods = (methods: PaymentMethodType[]): PaymentMethodType[] => {
  return [...methods].sort((a, b) => {
    const nameA = PAYMENT_METHOD_CONFIG[a].name;
    const nameB = PAYMENT_METHOD_CONFIG[b].name;
    return nameA.localeCompare(nameB, 'pt-BR');
  });
};

/**
 * Valida se pelo menos um método está habilitado
 */
export const validateEnabledMethods = (methods: PaymentMethodType[]): boolean => {
  return methods.length > 0;
};
```

---

## 5. Interface do Professor - Configurações de Cobrança

### 5.1 Arquivo: `src/components/Settings/BillingSettings.tsx`

#### ⚠️ IMPORTANTE: Adaptação Necessária

O componente atual (`BillingSettings.tsx`) carrega e salva dados da tabela `profiles`. Para a nova funcionalidade de métodos de pagamento, precisamos:

1. **Carregar `business_profiles`** do professor (não `profiles`)
2. **Verificar se existe** um `business_profile` antes de exibir a seção
3. **Salvar `enabled_payment_methods`** em `business_profiles`

#### Lógica de Carregamento

```typescript
// Carregar business_profile do professor
const { data: businessProfile } = await supabase
  .from('business_profiles')
  .select('id, enabled_payment_methods')
  .eq('user_id', user.id)
  .maybeSingle();

// Se não existe business_profile, mostrar alerta
if (!businessProfile) {
  return (
    <Alert variant="warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        Você precisa configurar um perfil de negócios antes de gerenciar métodos de pagamento.
        <Link to="/painel-negocios">Configurar agora</Link>
      </AlertDescription>
    </Alert>
  );
}

// Usar métodos habilitados ou default
const enabledMethods = businessProfile.enabled_payment_methods || ['boleto', 'pix', 'card'];
```

#### Lógica de Salvamento

```typescript
const onSavePaymentMethods = async (methods: PaymentMethodType[]) => {
  if (!validateEnabledMethods(methods)) {
    toast.error(t('billing.paymentMethods.atLeastOne'));
    return;
  }

  const { error } = await supabase
    .from('business_profiles')
    .update({ enabled_payment_methods: methods })
    .eq('user_id', user.id);

  if (error) {
    toast.error(t('common.errorSaving'));
  } else {
    toast.success(t('common.saved'));
  }
};
```

#### Layout Proposto

```
┌─────────────────────────────────────────────────────────────┐
│ Métodos de Pagamento Disponíveis                            │
│ Selecione quais formas de pagamento seus alunos poderão    │
│ utilizar. As taxas são cobradas pela Stripe.                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 🎫 Boleto Bancário                               [TOGGLE ✓]│
│    Taxa: R$ 3,49 por transação                              │
│    Exemplo: Em R$ 200,00 = R$ 3,49 de taxa                  │
│                                                             │
│ 💳 Cartão de Crédito                             [TOGGLE ✓]│
│    Taxa: 3,99% + R$ 0,39                                    │
│    Exemplo: Em R$ 200,00 = R$ 8,37 de taxa                  │
│                                                             │
│ ⚡ PIX                                            [TOGGLE ✓]│
│    Taxa: 1,19%                                              │
│    Exemplo: Em R$ 200,00 = R$ 2,38 de taxa                  │
│                                                             │
│ ⚠️ Pelo menos um método deve estar habilitado               │
│                                                             │
│                              [Salvar Configurações]         │
└─────────────────────────────────────────────────────────────┘
```

#### Componente Sugerido: `PaymentMethodToggle`

```typescript
interface PaymentMethodToggleProps {
  method: PaymentMethodType;
  enabled: boolean;
  onToggle: (method: PaymentMethodType, enabled: boolean) => void;
  disabled?: boolean; // Para impedir desabilitar o último método
  exampleAmount?: number; // Default: 200
}
```

#### Lógica de Validação

1. Carregar `enabled_payment_methods` do `business_profiles` do professor
2. Se professor não tiver `business_profile`, mostrar alerta para criar um primeiro
3. Não permitir desabilitar todos os métodos (mínimo 1)
4. Salvar alterações ao clicar em "Salvar Configurações"

---

## 6. Interface do Aluno - PaymentOptionsCard

### 6.1 Arquivo: `src/components/PaymentOptionsCard.tsx`

#### ⚠️ IMPORTANTE: Atualização da Interface Invoice

A interface `Invoice` atual (linhas 27-39) **NÃO inclui** `business_profile`. Precisamos atualizar:

```typescript
// Interface ATUAL (incompleta)
interface Invoice {
  id: string;
  amount: string;
  due_date: string;
  description: string;
  status: string;
  boleto_url: string | null;
  barcode: string | null;
  linha_digitavel: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  stripe_hosted_invoice_url: string | null;
}

// Interface ATUALIZADA (nova)
interface Invoice {
  id: string;
  amount: string;
  due_date: string;
  description: string;
  status: string;
  boleto_url: string | null;
  barcode: string | null;
  linha_digitavel: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  stripe_hosted_invoice_url: string | null;
  // NOVO: Informações do business_profile
  business_profile?: {
    id: string;
    business_name: string;
    enabled_payment_methods: string[] | null;
  } | null;
}
```

### 6.2 Alterações Necessárias

1. **Atualizar interface Invoice**: Incluir `business_profile`
2. **Buscar métodos habilitados**: Consultar `business_profiles.enabled_payment_methods` via invoice
3. **Filtrar métodos**: Mostrar apenas os habilitados pelo professor
4. **Ordenar alfabeticamente**: Boleto → Cartão → PIX
5. **Lógica de método único**: Se apenas 1 método, redirecionar direto ao Stripe

### 6.3 Pseudo-código da Lógica

```typescript
const enabledMethods = invoice.business_profile?.enabled_payment_methods || ['boleto', 'pix', 'card'];
const sortedMethods = sortPaymentMethods(enabledMethods as PaymentMethodType[]);

// Se apenas 1 método habilitado, redirecionar direto
if (sortedMethods.length === 1) {
  const [onlyMethod] = sortedMethods;
  
  // Mostrar botão único
  return (
    <Button onClick={() => createPaymentIntent(onlyMethod)}>
      {t('billing.paymentMethods.singleMethodButton', { 
        method: t(`billing.paymentMethods.methods.${onlyMethod}.name`) 
      })}
    </Button>
  );
}

// Se múltiplos, mostrar opções
return (
  <div>
    {sortedMethods.map(method => (
      <PaymentMethodOption 
        key={method}
        method={method}
        onSelect={() => createPaymentIntent(method)}
      />
    ))}
  </div>
);
```

### 6.4 Layout - Múltiplos Métodos

```
┌──────────────────────────────────────────────────────────────┐
│ Fatura - Mensalidade Janeiro         [Badge: Pendente]       │
│ Valor: R$ 200,00    Vencimento: 15/02/2026                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ⚡ Escolha a forma de pagamento                              │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ 🎫 Boleto Bancário                     [Gerar Boleto]  │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ 💳 Cartão de Crédito                        [Pagar]    │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ ⚡ PIX                                   [Gerar PIX]    │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.5 Layout - Método Único

```
┌──────────────────────────────────────────────────────────────┐
│ Fatura - Mensalidade Janeiro         [Badge: Pendente]       │
│ Valor: R$ 200,00    Vencimento: 15/02/2026                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    [   Pagar com PIX   ]                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. Query de Invoices - Financeiro.tsx

### 7.1 Arquivo: `src/pages/Financeiro.tsx`

#### ⚠️ PROBLEMA IDENTIFICADO

A query atual de invoices **NÃO busca `business_profiles`**, apenas faz um JOIN vazio ou não inclui o relacionamento. Precisamos garantir que a query inclua `enabled_payment_methods`.

#### Query Atual (Exemplo - linha ~200)

```typescript
const { data: invoicesData } = await supabase
  .from('invoices')
  .select(`
    *,
    student:profiles!invoices_student_id_fkey(name, email),
    monthly_subscription:monthly_subscriptions(name)
  `)
  .eq('teacher_id', effectiveTeacherId);
```

#### Query Corrigida

```typescript
const { data: invoicesData } = await supabase
  .from('invoices')
  .select(`
    *,
    student:profiles!invoices_student_id_fkey(name, email),
    monthly_subscription:monthly_subscriptions(name),
    business_profile:business_profiles!invoices_business_profile_id_fkey(
      id,
      business_name,
      enabled_payment_methods
    )
  `)
  .eq('teacher_id', effectiveTeacherId);
```

### 7.2 Verificar Outros Locais de Query de Invoice

Procurar por todas as queries de `invoices` no projeto e garantir que incluam `business_profile`:

- `src/pages/Financeiro.tsx`
- `src/pages/StudentDashboard.tsx` (se aplicável)
- Qualquer outro componente que exiba faturas para alunos

---

## 8. Backend - Validação e Segurança

### 8.1 Arquivo: `supabase/functions/create-payment-intent-connect/index.ts`

#### Validação de Método Permitido

```typescript
// Após buscar invoice, validar método permitido
const enabledMethods = invoice.business_profile?.enabled_payment_methods || ['boleto', 'pix', 'card'];

if (!enabledMethods.includes(payment_method)) {
  logStep('❌ Método não permitido', { 
    requested: payment_method, 
    enabled: enabledMethods 
  });
  
  return new Response(
    JSON.stringify({ 
      error: `Método de pagamento "${payment_method}" não está habilitado para este negócio` 
    }),
    { status: 400, headers: corsHeaders }
  );
}
```

#### Query da Invoice - Incluir Métodos

Modificar a query de invoice para incluir `enabled_payment_methods`:

```typescript
// Linha ~46-48, alterar de:
business_profile:business_profiles!invoices_business_profile_id_fkey(
  id, business_name, stripe_connect_id
)

// Para:
business_profile:business_profiles!invoices_business_profile_id_fkey(
  id, business_name, stripe_connect_id, enabled_payment_methods
)
```

### 8.2 Verificação de PIX Capability

#### ⚠️ PROBLEMA IDENTIFICADO

Antes de exibir PIX como opção ao aluno, devemos verificar se a conta Stripe do professor tem a capability `pix_payments` ativa. Caso contrário, o aluno verá erro ao tentar usar PIX.

#### Solução Proposta

1. **Verificação no Backend**: Adicionar check de capabilities no `create-payment-intent-connect`
2. **Endpoint de Verificação**: Criar endpoint para verificar capabilities disponíveis

```typescript
// Em create-payment-intent-connect/index.ts
// Antes de processar PIX, verificar capability

if (payment_method === 'pix') {
  const account = await stripe.accounts.retrieve(stripeConnectId);
  const pixCapability = account.capabilities?.pix_payments;
  
  if (pixCapability !== 'active') {
    return new Response(
      JSON.stringify({ 
        error: 'PIX não está habilitado para esta conta. Entre em contato com o professor.',
        errorCode: 'PIX_NOT_ENABLED'
      }),
      { status: 400, headers: corsHeaders }
    );
  }
}
```

#### Filtro Proativo no Frontend (Opcional - Fase 2)

Para evitar exibir opções que falharão, podemos criar um endpoint que retorna os métodos realmente disponíveis (combinando `enabled_payment_methods` com capabilities do Stripe):

```typescript
// Possível endpoint futuro: check-available-payment-methods
// Retorna apenas métodos que: 1) estão habilitados pelo professor E 2) estão ativos no Stripe

// Por ora, tratamos erro no backend e exibimos mensagem amigável ao aluno
```

---

## 9. Tratamento de Múltiplos Business Profiles

### 9.1 Contexto

Um professor pode ter **múltiplos** `business_profiles` (múltiplas contas Stripe Connect). Cada invoice está associada a um `business_profile_id` específico.

### 9.2 Considerações

- A query de invoice já traz o `business_profile_id` correto via FK
- O JOIN com `business_profiles` deve usar esse ID específico
- Não precisamos buscar "todos os business_profiles do professor"

### 9.3 Verificação

Garantir que a query use o relacionamento correto:

```typescript
// ✅ Correto - usa FK da invoice
business_profile:business_profiles!invoices_business_profile_id_fkey(
  id, business_name, enabled_payment_methods
)

// ❌ Errado - buscaria todos os profiles do usuário
// NÃO fazer isso
```

---

## 10. Notificação de Invoice (send-invoice-notification)

### 10.1 Arquivo: `supabase/functions/send-invoice-notification/index.ts`

#### Consideração

Ao enviar email de fatura, como apresentar as opções de pagamento?

#### Abordagens Possíveis

1. **Link Genérico**: Email contém link para página de pagamento onde aluno vê opções habilitadas
   - ✅ Mais simples
   - ✅ Sempre mostra opções atualizadas
   
2. **Listar Métodos no Email**: Incluir texto com métodos disponíveis
   - ❌ Mais complexo
   - ❌ Pode ficar desatualizado se professor mudar configuração

#### Decisão

Manter **Link Genérico** (abordagem atual). O email direciona para a página de pagamento que exibe dinamicamente as opções habilitadas.

---

## 11. Internacionalização (i18n)

### 11.1 Português: `src/i18n/locales/pt/billing.json`

```json
{
  "paymentMethods": {
    "title": "Métodos de Pagamento Disponíveis",
    "subtitle": "Selecione quais formas de pagamento seus alunos poderão utilizar. As taxas são cobradas pela Stripe.",
    "atLeastOne": "Pelo menos um método de pagamento deve estar habilitado",
    "feeLabel": "Taxa",
    "exampleLabel": "Exemplo",
    "exampleFormat": "Em {{amount}} = {{fee}} de taxa",
    "noBusinessProfile": "Você precisa configurar um perfil de negócios antes de gerenciar métodos de pagamento.",
    "configureNow": "Configurar agora",
    "methods": {
      "boleto": {
        "name": "Boleto Bancário",
        "fee": "R$ 3,49 por transação",
        "action": "Gerar Boleto"
      },
      "card": {
        "name": "Cartão de Crédito",
        "fee": "3,99% + R$ 0,39",
        "action": "Pagar"
      },
      "pix": {
        "name": "PIX",
        "fee": "1,19%",
        "action": "Gerar PIX"
      }
    },
    "singleMethodButton": "Pagar com {{method}}",
    "chooseMethod": "Escolha a forma de pagamento",
    "errors": {
      "pixNotEnabled": "PIX não está habilitado para esta conta. Entre em contato com o professor.",
      "methodNotAllowed": "Este método de pagamento não está disponível."
    }
  }
}
```

### 11.2 Inglês: `src/i18n/locales/en/billing.json`

```json
{
  "paymentMethods": {
    "title": "Available Payment Methods",
    "subtitle": "Select which payment methods your students can use. Fees are charged by Stripe.",
    "atLeastOne": "At least one payment method must be enabled",
    "feeLabel": "Fee",
    "exampleLabel": "Example",
    "exampleFormat": "On {{amount}} = {{fee}} fee",
    "noBusinessProfile": "You need to set up a business profile before managing payment methods.",
    "configureNow": "Configure now",
    "methods": {
      "boleto": {
        "name": "Boleto Bancário",
        "fee": "R$ 3.49 per transaction",
        "action": "Generate Boleto"
      },
      "card": {
        "name": "Credit Card",
        "fee": "3.99% + R$ 0.39",
        "action": "Pay"
      },
      "pix": {
        "name": "PIX",
        "fee": "1.19%",
        "action": "Generate PIX"
      }
    },
    "singleMethodButton": "Pay with {{method}}",
    "chooseMethod": "Choose payment method",
    "errors": {
      "pixNotEnabled": "PIX is not enabled for this account. Please contact the teacher.",
      "methodNotAllowed": "This payment method is not available."
    }
  }
}
```

---

## 12. Arquivos a Modificar/Criar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migração SQL | **CRIAR** | Adicionar coluna `enabled_payment_methods` |
| `src/utils/stripe-fees.ts` | **MODIFICAR** | Adicionar taxas de todos métodos + funções auxiliares |
| `src/components/Settings/BillingSettings.tsx` | **MODIFICAR** | Adicionar seção de métodos de pagamento (buscar de `business_profiles`) |
| `src/components/PaymentOptionsCard.tsx` | **MODIFICAR** | Atualizar interface Invoice + filtrar métodos + lógica de redirecionamento |
| `src/pages/Financeiro.tsx` | **MODIFICAR** | Atualizar query de invoices para incluir `business_profile.enabled_payment_methods` |
| `supabase/functions/create-payment-intent-connect/index.ts` | **MODIFICAR** | Validar método permitido + verificar PIX capability + incluir campo na query |
| `src/i18n/locales/pt/billing.json` | **MODIFICAR** | Adicionar textos em português |
| `src/i18n/locales/en/billing.json` | **MODIFICAR** | Adicionar textos em inglês |

---

## 13. Fluxo Completo

```
┌─────────────────────┐
│   PROFESSOR         │
│ (Configurações)     │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ BillingSettings: Carrega de business_profiles                   │
│ - Verifica se existe business_profile                           │
│ - Toggles para Boleto/Cartão/PIX                                │
│ - Mostra taxa de cada método                                    │
│ - Mostra exemplo prático (em R$ 200 = X de taxa)                │
│ - Salva em business_profiles.enabled_payment_methods            │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐
│      ALUNO          │
│ (Ver Fatura)        │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ Financeiro.tsx: Query inclui business_profile.enabled_methods   │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ PaymentOptionsCard: Interface Invoice inclui business_profile   │
│ - Filtra métodos habilitados                                    │
│ - Ordena alfabeticamente                                        │
│                                                                 │
│   ┌─── Apenas 1 método? ───┐                                    │
│   │                        │                                    │
│   ▼                        ▼                                    │
│ [Botão direto]      [Mostra opções]                             │
│ "Pagar com PIX"     Boleto | Cartão | PIX                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ create-payment-intent-connect:                                  │
│ - Valida método está em enabled_payment_methods                 │
│ - Verifica PIX capability se método = pix                       │
│ - Processa pagamento                                            │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐
│   STRIPE            │
│ (Checkout/Payment)  │
└─────────────────────┘
```

---

## 14. Considerações Técnicas

### 14.1 PIX no Stripe Connect

O PIX já está implementado no backend (`create-payment-intent-connect/index.ts`, linhas 343-423), mas pode exigir que o professor habilite o método no Dashboard do Stripe da conta conectada.

**Ação necessária**: 
1. Verificar capability `pix_payments` antes de processar
2. Documentar para o professor como habilitar PIX no Stripe Dashboard

### 14.2 Compatibilidade Retroativa

Professores existentes sem a configuração terão todos os métodos habilitados por default (array padrão da coluna).

### 14.3 Segurança

- **Backend**: Validação impede que alunos tentem usar métodos não habilitados
- **Frontend**: Filtragem de métodos evita exibição de opções inválidas
- **Stripe**: Verificação de capabilities evita erros em runtime

### 14.4 Performance

- Query de invoice já faz JOIN com `business_profiles`
- Adição de um campo array não impacta performance significativamente
- Verificação de capabilities pode ser cacheada (considerar para fase 2)

---

## 15. Checklist de Implementação

### Fase 1: Database
- [ ] Criar migração SQL para `enabled_payment_methods`
- [ ] Testar migração em ambiente de desenvolvimento
- [ ] Aplicar migração em produção
- [ ] Regenerar tipos Supabase

### Fase 2: Backend
- [ ] Atualizar `src/utils/stripe-fees.ts` com novas constantes e funções
- [ ] Modificar query de invoice em `create-payment-intent-connect` para incluir `enabled_payment_methods`
- [ ] Adicionar validação de método permitido
- [ ] Adicionar verificação de PIX capability
- [ ] Testar edge function

### Fase 3: Frontend - Professor
- [ ] Adicionar i18n para português (`billing.json`)
- [ ] Adicionar i18n para inglês (`billing.json`)
- [ ] Modificar `BillingSettings.tsx` para carregar de `business_profiles`
- [ ] Implementar seção de toggles de métodos de pagamento
- [ ] Implementar validação (mínimo 1 método)
- [ ] Testar configuração de métodos
- [ ] Testar cenário sem business_profile

### Fase 4: Frontend - Aluno
- [ ] Atualizar interface `Invoice` em `PaymentOptionsCard.tsx`
- [ ] Modificar query em `Financeiro.tsx` para incluir `business_profile`
- [ ] Implementar filtro e ordenação de métodos
- [ ] Implementar lógica de método único (redirecionamento direto)
- [ ] Adicionar tratamento de erro para PIX não habilitado
- [ ] Testar fluxo de pagamento com diferentes configurações

### Fase 5: Testes e Validação
- [ ] Testar professor sem business_profile
- [ ] Testar todos os métodos habilitados
- [ ] Testar apenas 1 método habilitado (cada método)
- [ ] Testar validação de backend (método não permitido)
- [ ] Testar PIX capability não ativa
- [ ] Teste de regressão geral
- [ ] Testar múltiplos business_profiles

---

## 16. Estimativa de Tempo

| Tarefa | Estimativa |
|--------|------------|
| Migração SQL + regenerar tipos | 20 min |
| Atualizar stripe-fees.ts | 30 min |
| BillingSettings (carregar de business_profiles + toggles) | 2 horas |
| PaymentOptionsCard (interface + lógica) | 1.5 horas |
| Financeiro.tsx (query) | 30 min |
| Backend validation + PIX capability | 1 hora |
| i18n | 30 min |
| Testes e ajustes | 1.5 horas |
| **Total** | **~8 horas** |

---

## 17. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| PIX não habilitado na conta Stripe do professor | Alta | Médio | Verificar capability antes de processar + mensagem clara |
| Professor desabilita todos os métodos | Baixa | Alto | Validação frontend + backend impede |
| Aluno tenta burlar validação frontend | Baixa | Médio | Validação backend é obrigatória |
| Query de invoice não inclui business_profile | Média | Alto | Verificar todas as queries antes de implementar |
| Interface Invoice desatualizada | Média | Alto | Atualizar interface antes de usar dados |

---

## 18. Próximos Passos

1. **Aprovação do plano**: Revisar e aprovar este documento
2. **Criação de tasks**: Criar issues/tasks para cada fase
3. **Implementação**: Seguir checklist na ordem
4. **Code Review**: Revisar código antes de merge
5. **Deploy**: Deploy em ambiente de staging → produção

---

## Histórico de Revisões

| Versão | Data | Autor | Descrição |
|--------|------|-------|-----------|
| 1.0 | 2026-01-14 | Lovable AI | Versão inicial do plano |
| 1.1 | 2026-01-14 | Lovable AI | Adicionadas lacunas identificadas: query Financeiro.tsx, interface Invoice, BillingSettings com business_profiles, verificação PIX capability, múltiplos business_profiles, i18n aluno, estimativa atualizada |
