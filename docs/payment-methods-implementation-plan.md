# Plano de Implementação: Métodos de Pagamento Configuráveis pelo Professor

> **Versão**: 2.0  
> **Data**: 2026-01-15  
> **Status**: Planejamento

---

## 1. Resumo Executivo

Permitir que professores configurem quais métodos de pagamento (Cartão, Boleto, PIX) estarão disponíveis para seus alunos, com **geração automática de boleto** quando habilitado e possibilidade do aluno alterar o método de pagamento.

### Decisões de Design v2.0

| Aspecto | Decisão |
|---------|---------|
| Configuração de métodos | Toggle individual por método (Boleto, PIX, Cartão) |
| Todos os métodos podem ser desabilitados | ✅ SIM, incluindo cartão |
| Ordem de exibição | Alfabética (Boleto → Cartão → PIX) |
| Default para novos professores | Todos habilitados |
| Exibição de taxas | Com exemplo prático |
| **Geração automática de boleto** | ✅ Se Boleto habilitado, gerar automaticamente na criação da fatura |
| **Reutilização de links** | ✅ Se existe boleto/PIX válido, mostrar opção de usar ou alterar |
| **Alteração de método pelo aluno** | ✅ Aluno pode alterar método, cancelando o anterior |
| **Invalidação ao desabilitar** | ✅ Se professor desabilita método, boletos/PIX existentes são invalidados |
| **Expiração de boleto** | Herdar de `payment_due_days` do professor |

---

## 2. Arquitetura Híbrida v2.0

A nova arquitetura combina geração automática de boleto (quando habilitado) com possibilidade de escolha do aluno:

| Cenário | Comportamento |
|---------|---------------|
| Professor tem **Boleto habilitado** | Fatura criada → Boleto gerado automaticamente |
| Professor tem **apenas PIX/Card** | Fatura criada → Nenhum pagamento gerado (aluno escolhe) |
| Aluno abre fatura com **boleto existente válido** | Modal exibe "Pagar Boleto" + opção "Alterar Método" |
| Aluno clica **"Alterar Método"** | Cancela boleto anterior → Gera PIX ou redireciona para Card |
| Pagamento PIX/Card **bem-sucedido** | Invoice marcada como paga, boleto antigo invalidado |
| Professor **desabilita Boleto** após fatura criada | Boleto existente é **invalidado** - aluno não pode usar |
| **PIX capability** não ativa no Stripe | Erro amigável: "Seu professor não possui essa opção de pagamento disponível" |

### Fluxo Visual Resumido

```
┌────────────────────────────────────────────────────────────────┐
│ PROFESSOR configura métodos em BillingSettings                 │
│ → Salva em business_profiles.enabled_payment_methods           │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ FATURA CRIADA (create-invoice / automated-billing)             │
│                                                                │
│   Boleto habilitado?  ──┬─── SIM ───▶ Gerar boleto automático  │
│                         │            (salvar boleto_expires_at)│
│                         │                                      │
│                         └─── NÃO ───▶ Não gerar nada           │
│                                       (aluno escolhe depois)   │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ ALUNO acessa Faturas.tsx                                       │
│ → Query inclui business_profile + campos de expiração          │
│ → Clica "Pagar Agora" → Abre modal PaymentOptionsCard          │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ PaymentOptionsCard analisa invoice:                            │
│                                                                │
│   1. Verifica enabled_payment_methods (invalida se desabilitado)│
│   2. hasValidBoleto()?  ─── SIM ───▶ Exibe boleto + "Alterar"  │
│   3. hasValidPix()?     ─── SIM ───▶ Exibe PIX + "Alterar"     │
│   4. Senão              ─────────▶ Exibe opções habilitadas    │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ Aluno clica "Alterar Método":                                  │
│                                                                │
│ 1. Modal de confirmação                                        │
│ 2. Chama change-payment-method → Cancela PI no Stripe          │
│ 3. Limpa campos de pagamento da invoice                        │
│ 4. Exibe opções habilitadas (exceto método atual)              │
│ 5. Gera novo pagamento via create-payment-intent-connect       │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Taxas Oficiais do Stripe Brasil

| Método | Taxa | Exemplo (R$ 200,00) |
|--------|------|---------------------|
| **Boleto** | R$ 3,49 fixo | R$ 3,49 |
| **PIX** | 1,19% | R$ 2,38 |
| **Cartão** | 3,99% + R$ 0,39 | R$ 8,37 |

> **Fonte**: [Stripe Brasil - Local Payment Methods](https://stripe.com/en-br/pricing/local-payment-methods)

---

## 4. Alterações no Banco de Dados

### 4.1 Migração SQL

```sql
-- 1. Adicionar coluna para métodos de pagamento habilitados no business_profiles
ALTER TABLE business_profiles 
ADD COLUMN IF NOT EXISTS enabled_payment_methods TEXT[] DEFAULT ARRAY['boleto', 'pix', 'card'];

-- Comentário para documentação
COMMENT ON COLUMN business_profiles.enabled_payment_methods IS 
  'Array de métodos de pagamento habilitados pelo professor: boleto, pix, card';

-- 2. Adicionar campos de expiração em invoices
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS pix_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS boleto_expires_at TIMESTAMPTZ;

-- 3. Índices para queries de expiração (otimização)
CREATE INDEX IF NOT EXISTS idx_invoices_pix_expires 
  ON invoices(pix_expires_at) WHERE pix_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_boleto_expires 
  ON invoices(boleto_expires_at) WHERE boleto_expires_at IS NOT NULL;

-- 4. Comentários para documentação
COMMENT ON COLUMN invoices.pix_expires_at IS 'Data/hora de expiração do código PIX (24 horas após geração)';
COMMENT ON COLUMN invoices.boleto_expires_at IS 'Data/hora de expiração do boleto (baseado em payment_due_days do professor)';
```

### 4.2 Campos Afetados

| Tabela | Campo | Tipo | Default | Descrição |
|--------|-------|------|---------|-----------|
| `business_profiles` | `enabled_payment_methods` | `TEXT[]` | `['boleto', 'pix', 'card']` | Métodos habilitados |
| `invoices` | `pix_expires_at` | `TIMESTAMPTZ` | `null` | Expiração do PIX |
| `invoices` | `boleto_expires_at` | `TIMESTAMPTZ` | `null` | Expiração do boleto |

### 4.3 Regeneração de Tipos

Após a migração, regenerar os tipos do Supabase:

```bash
npx supabase gen types typescript --project-id nwgomximjevgczwuyqcx > src/integrations/supabase/types.ts
```

---

## 5. Constantes de Taxas e Utilitários

### 5.1 Arquivo: `src/utils/stripe-fees.ts`

```typescript
/**
 * Stripe fee calculation utilities for all payment methods
 * Updated: 2026-01-15
 * Source: https://stripe.com/en-br/pricing/local-payment-methods
 */

// Constantes existentes (manter)
export const STRIPE_BOLETO_FEE = 3.49;
export const MINIMUM_BOLETO_AMOUNT = 5.00;
export const MAXIMUM_BOLETO_AMOUNT = 49999.99;

// Valores mínimos por método de pagamento
export const MINIMUM_PAYMENT_AMOUNTS = {
  boleto: 5.00,
  pix: 1.00,
  card: 0.50
} as const;

// Taxas do Stripe Brasil
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
    fee: STRIPE_FEES.boleto,
    description: 'Boletos são gerados automaticamente nas faturas',
    descriptionKey: 'billing.paymentMethods.methods.boleto.description'
  },
  card: {
    id: 'card',
    name: 'Cartão de Crédito',
    nameKey: 'billing.paymentMethods.methods.card.name',
    icon: 'CreditCard',
    fee: STRIPE_FEES.card,
    description: 'Pagamento processado pelo Stripe Checkout',
    descriptionKey: 'billing.paymentMethods.methods.card.description'
  },
  pix: {
    id: 'pix',
    name: 'PIX',
    nameKey: 'billing.paymentMethods.methods.pix.name',
    icon: 'QrCode',
    fee: STRIPE_FEES.pix,
    description: 'Código expira em 24 horas',
    descriptionKey: 'billing.paymentMethods.methods.pix.description'
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
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL' 
  }).format(fee);
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

/**
 * Verifica se um valor atende ao mínimo para um método
 */
export const meetsMinimumAmount = (method: PaymentMethodType, amount: number): boolean => {
  return amount >= MINIMUM_PAYMENT_AMOUNTS[method];
};

/**
 * Filtra métodos disponíveis baseado no valor da fatura
 */
export const getAvailableMethodsForAmount = (
  enabledMethods: PaymentMethodType[], 
  amount: number
): PaymentMethodType[] => {
  return enabledMethods.filter(method => meetsMinimumAmount(method, amount));
};
```

---

## 6. Backend - Geração Condicional de Boleto

### 6.1 Arquivo: `supabase/functions/create-invoice/index.ts`

**Alterações necessárias:**

1. Buscar `enabled_payment_methods` do `business_profile`
2. Verificar se `boleto` está habilitado antes de gerar automaticamente
3. Buscar `payment_due_days` do professor para definir expiração

```typescript
// Após criar a invoice, verificar se deve gerar boleto automaticamente

// 1. Buscar business_profile com métodos habilitados
const { data: businessProfile } = await supabase
  .from('business_profiles')
  .select('id, enabled_payment_methods')
  .eq('id', businessProfileId)
  .single();

const enabledMethods = businessProfile?.enabled_payment_methods || ['boleto', 'pix', 'card'];

// 2. Buscar payment_due_days do professor para expiração do boleto
const { data: teacherProfile } = await supabase
  .from('profiles')
  .select('payment_due_days')
  .eq('id', teacherId)
  .single();

const paymentDueDays = teacherProfile?.payment_due_days || 7;

// 3. Gerar boleto automaticamente APENAS se habilitado E valor >= mínimo
if (enabledMethods.includes('boleto') && amount >= MINIMUM_BOLETO_AMOUNT) {
  logStep('Boleto habilitado - gerando automaticamente');
  
  const { data: paymentResult, error: paymentError } = await supabase.functions.invoke(
    'create-payment-intent-connect',
    {
      body: { 
        invoice_id: invoiceId, 
        payment_method: 'boleto',
        expires_after_days: paymentDueDays
      }
    }
  );
  
  if (!paymentError && paymentResult) {
    // Atualizar invoice com dados do boleto
    const boletoExpiresAt = new Date();
    boletoExpiresAt.setDate(boletoExpiresAt.getDate() + paymentDueDays);
    
    await supabase.from('invoices').update({
      boleto_url: paymentResult.boleto_url,
      linha_digitavel: paymentResult.linha_digitavel,
      barcode: paymentResult.barcode,
      boleto_expires_at: boletoExpiresAt.toISOString(),
      payment_method: 'boleto'
    }).eq('id', invoiceId);
  }
} else {
  logStep('Boleto não habilitado ou valor abaixo do mínimo - aluno escolherá método');
}
```

### 6.2 Arquivo: `supabase/functions/automated-billing/index.ts`

**Mesma lógica do `create-invoice`**: Verificar `enabled_payment_methods` antes de gerar boleto automaticamente.

---

## 7. Backend - Salvar Expiração e Validação

### 7.1 Arquivo: `supabase/functions/create-payment-intent-connect/index.ts`

**Alterações necessárias:**

#### 7.1.1 Incluir `enabled_payment_methods` na query de invoice

```typescript
// Atualizar query da invoice (linha ~46-48)
const { data: invoice, error: invoiceError } = await supabaseClient
  .from('invoices')
  .select(`
    *,
    student:profiles!invoices_student_id_fkey(name, email, cpf, address_street, address_city, address_state, address_postal_code),
    business_profile:business_profiles!invoices_business_profile_id_fkey(
      id, business_name, stripe_connect_id, enabled_payment_methods
    )
  `)
  .eq('id', invoice_id)
  .single();
```

#### 7.1.2 Validar método está habilitado

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
      error: 'Seu professor não possui essa opção de pagamento disponível',
      errorCode: 'METHOD_NOT_ENABLED'
    }),
    { status: 400, headers: corsHeaders }
  );
}
```

#### 7.1.3 Verificar PIX capability (antes de processar PIX)

```typescript
// Antes de processar PIX, verificar capability
if (payment_method === 'pix') {
  const account = await stripe.accounts.retrieve(stripeConnectId);
  const pixCapability = account.capabilities?.pix_payments;
  
  if (pixCapability !== 'active') {
    logStep('❌ PIX capability não ativa', { pixCapability });
    
    return new Response(
      JSON.stringify({ 
        error: 'Seu professor não possui essa opção de pagamento disponível',
        errorCode: 'PIX_NOT_ENABLED'
      }),
      { status: 400, headers: corsHeaders }
    );
  }
}
```

#### 7.1.4 Salvar timestamps de expiração

```typescript
// Ao criar PIX - expiração em 24 horas
const pixExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
await supabase.from('invoices').update({
  pix_qr_code: data.pix_qr_code,
  pix_copy_paste: data.pix_copy_paste,
  pix_expires_at: pixExpiresAt,
  payment_method: 'pix',
  // Limpar boleto anterior
  boleto_url: null,
  linha_digitavel: null,
  barcode: null,
  boleto_expires_at: null
}).eq('id', invoice_id);

// Ao criar Boleto - expiração baseada em payment_due_days
const paymentDueDays = expires_after_days || 7;
const boletoExpiresAt = new Date();
boletoExpiresAt.setDate(boletoExpiresAt.getDate() + paymentDueDays);

await supabase.from('invoices').update({
  boleto_url: data.boleto_url,
  linha_digitavel: data.linha_digitavel,
  barcode: data.barcode,
  boleto_expires_at: boletoExpiresAt.toISOString(),
  payment_method: 'boleto',
  // Limpar PIX anterior
  pix_qr_code: null,
  pix_copy_paste: null,
  pix_expires_at: null
}).eq('id', invoice_id);
```

---

## 8. Backend - Nova Função: change-payment-method

### 8.1 Arquivo: `supabase/functions/change-payment-method/index.ts`

**Propósito**: Permitir que o aluno troque o método de pagamento, cancelando o anterior.

**Diferença do `cancel-payment-intent`**:
- `cancel-payment-intent`: Marca fatura como paga manualmente (usado pelo professor)
- `change-payment-method`: Limpa dados de pagamento, mantém status pendente (usado pelo aluno)

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const { invoice_id } = await req.json();

    // Buscar invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        business_profile:business_profiles!invoices_business_profile_id_fkey(
          stripe_connect_id
        )
      `)
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ error: 'Fatura não encontrada' }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Validar que usuário é o dono da fatura
    if (invoice.student_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Você não tem permissão para alterar esta fatura' }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Validar que fatura está pendente
    if (invoice.status !== 'pendente') {
      return new Response(
        JSON.stringify({ error: 'Apenas faturas pendentes podem ter o método alterado' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Cancelar Payment Intent no Stripe (se existir)
    if (invoice.stripe_payment_intent_id && invoice.business_profile?.stripe_connect_id) {
      try {
        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
          apiVersion: '2023-10-16',
        });

        await stripe.paymentIntents.cancel(
          invoice.stripe_payment_intent_id,
          { stripeAccount: invoice.business_profile.stripe_connect_id }
        );
      } catch (stripeError) {
        console.log('Erro ao cancelar PI (pode já estar cancelado):', stripeError);
        // Continuar mesmo se falhar - PI pode já estar cancelado
      }
    }

    // Limpar campos de pagamento da invoice (manter status pendente)
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        boleto_url: null,
        linha_digitavel: null,
        barcode: null,
        boleto_expires_at: null,
        pix_qr_code: null,
        pix_copy_paste: null,
        pix_expires_at: null,
        stripe_payment_intent_id: null,
        payment_method: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', invoice_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Erro ao limpar dados de pagamento' }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Método de pagamento alterado. Escolha um novo método.' 
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: corsHeaders }
    );
  }
});
```

---

## 9. Frontend - BillingSettings (Professor)

### 9.1 Arquivo: `src/components/Settings/BillingSettings.tsx`

**Alterações necessárias:**

1. **Carregar de `business_profiles`** (não `profiles`)
2. **Adicionar seção de toggles** para Boleto/PIX/Card
3. **Validar mínimo 1 método** habilitado
4. **Exibir taxas e exemplos**
5. **Indicar que boleto é gerado automaticamente**

#### Layout Proposto

```
┌──────────────────────────────────────────────────────────────────┐
│ Métodos de Pagamento Disponíveis                                  │
│ Selecione quais formas de pagamento seus alunos poderão          │
│ utilizar. As taxas são cobradas pela Stripe.                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ 🎫 Boleto Bancário                                    [TOGGLE ✓] │
│    Taxa: R$ 3,49 por transação                                   │
│    Exemplo: Em R$ 200,00 = R$ 3,49 de taxa                       │
│    ⚡ Boletos são gerados automaticamente nas faturas            │
│                                                                  │
│ 💳 Cartão de Crédito                                  [TOGGLE ✓] │
│    Taxa: 3,99% + R$ 0,39                                         │
│    Exemplo: Em R$ 200,00 = R$ 8,37 de taxa                       │
│                                                                  │
│ ⚡ PIX                                                 [TOGGLE ✓] │
│    Taxa: 1,19%                                                   │
│    Exemplo: Em R$ 200,00 = R$ 2,38 de taxa                       │
│                                                                  │
│ ⚠️ Pelo menos um método deve estar habilitado                     │
│                                                                  │
│                              [Salvar Configurações]              │
└──────────────────────────────────────────────────────────────────┘
```

#### Componente Sugerido: `PaymentMethodToggle`

```typescript
interface PaymentMethodToggleProps {
  method: PaymentMethodType;
  enabled: boolean;
  onToggle: (method: PaymentMethodType, enabled: boolean) => void;
  disabled?: boolean; // Para impedir desabilitar o último método
  exampleAmount?: number; // Default: 200
  showAutoGenerate?: boolean; // Para boleto
}
```

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
        {t('billing.paymentMethods.noBusinessProfile')}
        <Link to="/painel-negocios">{t('billing.paymentMethods.configureNow')}</Link>
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

---

## 10. Frontend - PaymentOptionsCard (Aluno)

### 10.1 Arquivo: `src/components/PaymentOptionsCard.tsx`

**Alterações necessárias:**

1. **Atualizar interface Invoice** com campos de expiração e business_profile
2. **Funções de validação** (`hasValidBoleto`, `hasValidPix`)
3. **Verificar `enabled_payment_methods`** para invalidar boletos/PIX de métodos desabilitados
4. **UI condicional** (pagamento existente vs opções)
5. **Modal de confirmação** para alterar método
6. **Chamar nova função** `change-payment-method`

#### Nova Interface Invoice

```typescript
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
  stripe_payment_intent_id: string | null;
  payment_method: string | null;
  // NOVOS campos
  pix_expires_at: string | null;
  boleto_expires_at: string | null;
  business_profile?: {
    id: string;
    business_name: string;
    enabled_payment_methods: string[] | null;
  } | null;
}
```

#### Funções de Validação

```typescript
// Verifica se boleto está válido E habilitado
const hasValidBoleto = (): boolean => {
  if (!invoice.boleto_url) return false;
  
  // Verificar se método está habilitado (CRÍTICO: invalida se professor desabilitou)
  const enabledMethods = invoice.business_profile?.enabled_payment_methods || ['boleto', 'pix', 'card'];
  if (!enabledMethods.includes('boleto')) return false;
  
  // Verificar expiração
  if (!invoice.boleto_expires_at) return true; // Sem expiração = válido
  return new Date(invoice.boleto_expires_at) > new Date();
};

// Verifica se PIX está válido E habilitado
const hasValidPix = (): boolean => {
  if (!invoice.pix_qr_code) return false;
  
  // Verificar se método está habilitado
  const enabledMethods = invoice.business_profile?.enabled_payment_methods || ['boleto', 'pix', 'card'];
  if (!enabledMethods.includes('pix')) return false;
  
  // Verificar expiração
  if (!invoice.pix_expires_at) return true;
  return new Date(invoice.pix_expires_at) > new Date();
};

// Verifica se existe algum pagamento válido
const hasExistingPayment = (): boolean => hasValidBoleto() || hasValidPix();

// Calcula tempo restante para expiração
const getExpirationTime = (expiresAt: string | null): string | null => {
  if (!expiresAt) return null;
  
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  
  if (diff <= 0) return null;
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days} dia${days > 1 ? 's' : ''}`;
  return `${hours} hora${hours > 1 ? 's' : ''}`;
};

// Obtém métodos disponíveis (habilitados + valor mínimo)
const getAvailableMethods = (): PaymentMethodType[] => {
  const enabledMethods = invoice.business_profile?.enabled_payment_methods || ['boleto', 'pix', 'card'];
  const amount = parseFloat(invoice.amount);
  
  return sortPaymentMethods(
    (enabledMethods as PaymentMethodType[]).filter(method => 
      meetsMinimumAmount(method, amount)
    )
  );
};
```

#### Layout - Boleto Existente Válido

```
┌──────────────────────────────────────────────────────────────┐
│ Fatura - Mensalidade Janeiro         [Badge: Pendente]       │
│ Valor: R$ 200,00    Vencimento: 15/02/2026                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ ✓ Boleto disponível                                    │   │
│ │   Expira em 2 dias                                     │   │
│ │                                                        │   │
│ │ [   📥 Baixar Boleto PDF   ]  [   Alterar Método   ]   │   │
│ │                                                        │   │
│ │ Linha digitável:                                       │   │
│ │ 12345.67890.12345.678901.23456.789012.3.12340000020000 │   │
│ │                                        [📋 Copiar]     │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                              │
│                    [   Verificar Pagamento   ]               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Layout - PIX Existente Válido

```
┌──────────────────────────────────────────────────────────────┐
│ Fatura - Mensalidade Janeiro         [Badge: Pendente]       │
│ Valor: R$ 200,00    Vencimento: 15/02/2026                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ ✓ PIX disponível                                       │   │
│ │   Expira em 18 horas                                   │   │
│ │                                                        │   │
│ │       [QR CODE]                                        │   │
│ │                                                        │   │
│ │ [   📋 Copiar Código PIX   ]  [   Alterar Método   ]   │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                              │
│                    [   Verificar Pagamento   ]               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Layout - Sem Pagamento Existente (Escolha)

```
┌──────────────────────────────────────────────────────────────┐
│ Fatura - Mensalidade Janeiro         [Badge: Pendente]       │
│ Valor: R$ 200,00    Vencimento: 15/02/2026                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Escolha a forma de pagamento:                                │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ 🎫 Boleto Bancário                     [Gerar Boleto]  │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ 💳 Cartão de Crédito                        [Pagar]    │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ ⚡ PIX                                   [Gerar PIX]    │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 10.2 Modal de Confirmação - Alterar Método

```
┌──────────────────────────────────────────────────────────────┐
│ Alterar Forma de Pagamento?                                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Você já possui um boleto gerado que ainda está válido.       │
│ Ao alterar, o boleto anterior será cancelado.                │
│                                                              │
│       [  Manter Boleto  ]    [  Confirmar Alteração  ]       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Lógica de Alteração

```typescript
const handleChangeMethod = async () => {
  setChangingMethod(true);
  
  try {
    const { data, error } = await supabase.functions.invoke('change-payment-method', {
      body: { invoice_id: invoice.id }
    });
    
    if (error) throw error;
    
    toast.success(t('billing.paymentMethods.methodChanged'));
    setShowChangeConfirmation(false);
    onPaymentMethodChanged?.(); // Callback para recarregar dados
    
  } catch (error) {
    toast.error(t('billing.paymentMethods.errors.changeMethodFailed'));
  } finally {
    setChangingMethod(false);
  }
};
```

---

## 11. Frontend - Queries Atualizadas

### 11.1 Arquivo: `src/pages/Faturas.tsx`

**Query atualizada:**

```typescript
const { data: invoicesData } = await supabase
  .from('invoices')
  .select(`
    id, created_at, due_date, amount, status, description, invoice_type,
    boleto_url, linha_digitavel, barcode,
    pix_qr_code, pix_copy_paste,
    stripe_payment_intent_id, payment_method,
    pix_expires_at, boleto_expires_at,
    business_profile:business_profiles!invoices_business_profile_id_fkey(
      id, business_name, enabled_payment_methods
    )
  `)
  .eq('student_id', user.id)
  .order('created_at', { ascending: false });
```

### 11.2 Arquivo: `src/pages/Financeiro.tsx`

**Query atualizada (para professor ver faturas):**

```typescript
const { data: invoicesData } = await supabase
  .from('invoices')
  .select(`
    *,
    student:profiles!invoices_student_id_fkey(name, email),
    monthly_subscription:monthly_subscriptions(name),
    business_profile:business_profiles!invoices_business_profile_id_fkey(
      id, business_name, enabled_payment_methods
    )
  `)
  .eq('teacher_id', effectiveTeacherId);
```

**Alerta de taxas completo:**

```jsx
<Alert>
  <AlertCircle className="h-4 w-4" />
  <AlertDescription>
    <p className="mb-2">{t('billing.feesWarning')}</p>
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div>⚡ PIX: 1,19%</div>
      <div>🎫 Boleto: R$ 3,49</div>
      <div>💳 Cartão: 3,99% + R$0,39</div>
    </div>
  </AlertDescription>
</Alert>
```

---

## 12. Internacionalização (i18n)

### 12.1 Português: `src/i18n/locales/pt/billing.json`

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
    "saveSettings": "Salvar Configurações",
    "methods": {
      "boleto": {
        "name": "Boleto Bancário",
        "fee": "R$ 3,49 por transação",
        "action": "Gerar Boleto",
        "description": "Boletos são gerados automaticamente nas faturas"
      },
      "card": {
        "name": "Cartão de Crédito",
        "fee": "3,99% + R$ 0,39",
        "action": "Pagar",
        "description": "Pagamento processado pelo Stripe Checkout"
      },
      "pix": {
        "name": "PIX",
        "fee": "1,19%",
        "action": "Gerar PIX",
        "description": "Código expira em 24 horas"
      }
    },
    "singleMethodButton": "Pagar com {{method}}",
    "chooseMethod": "Escolha a forma de pagamento",
    "existingPayment": {
      "boletoAvailable": "Boleto disponível",
      "pixAvailable": "PIX disponível",
      "expiresIn": "Expira em {{time}}",
      "downloadBoleto": "Baixar Boleto PDF",
      "copyPixCode": "Copiar Código PIX",
      "changeMethod": "Alterar Método"
    },
    "changeMethodModal": {
      "title": "Alterar Forma de Pagamento?",
      "boletoWarning": "Você já possui um boleto gerado que ainda está válido. Ao alterar, o boleto anterior será cancelado.",
      "pixWarning": "Você já possui um código PIX gerado que ainda está válido. Ao alterar, o PIX anterior será cancelado.",
      "keepCurrent": "Manter Atual",
      "confirmChange": "Confirmar Alteração"
    },
    "methodChanged": "Método de pagamento alterado. Escolha um novo método.",
    "errors": {
      "pixNotEnabled": "Seu professor não possui essa opção de pagamento disponível",
      "methodNotAllowed": "Este método de pagamento não está disponível.",
      "changeMethodFailed": "Erro ao alterar método de pagamento. Tente novamente."
    }
  }
}
```

### 12.2 Inglês: `src/i18n/locales/en/billing.json`

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
    "saveSettings": "Save Settings",
    "methods": {
      "boleto": {
        "name": "Boleto Bancário",
        "fee": "R$ 3.49 per transaction",
        "action": "Generate Boleto",
        "description": "Boletos are automatically generated on invoices"
      },
      "card": {
        "name": "Credit Card",
        "fee": "3.99% + R$ 0.39",
        "action": "Pay",
        "description": "Payment processed by Stripe Checkout"
      },
      "pix": {
        "name": "PIX",
        "fee": "1.19%",
        "action": "Generate PIX",
        "description": "Code expires in 24 hours"
      }
    },
    "singleMethodButton": "Pay with {{method}}",
    "chooseMethod": "Choose payment method",
    "existingPayment": {
      "boletoAvailable": "Boleto available",
      "pixAvailable": "PIX available",
      "expiresIn": "Expires in {{time}}",
      "downloadBoleto": "Download Boleto PDF",
      "copyPixCode": "Copy PIX Code",
      "changeMethod": "Change Method"
    },
    "changeMethodModal": {
      "title": "Change Payment Method?",
      "boletoWarning": "You already have a valid boleto generated. By changing, the previous boleto will be cancelled.",
      "pixWarning": "You already have a valid PIX code generated. By changing, the previous PIX will be cancelled.",
      "keepCurrent": "Keep Current",
      "confirmChange": "Confirm Change"
    },
    "methodChanged": "Payment method changed. Choose a new method.",
    "errors": {
      "pixNotEnabled": "Your teacher does not have this payment option available",
      "methodNotAllowed": "This payment method is not available.",
      "changeMethodFailed": "Error changing payment method. Please try again."
    }
  }
}
```

---

## 13. Arquivos a Modificar/Criar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migração SQL | **CRIAR** | `enabled_payment_methods`, `pix_expires_at`, `boleto_expires_at` |
| `src/utils/stripe-fees.ts` | **MODIFICAR** | Adicionar taxas, constantes e funções auxiliares |
| `supabase/functions/create-invoice/index.ts` | **MODIFICAR** | Geração condicional de boleto |
| `supabase/functions/automated-billing/index.ts` | **MODIFICAR** | Geração condicional de boleto |
| `supabase/functions/create-payment-intent-connect/index.ts` | **MODIFICAR** | Validação de método + PIX capability + expiração |
| `supabase/functions/change-payment-method/index.ts` | **CRIAR** | Nova função para aluno trocar método |
| `src/components/Settings/BillingSettings.tsx` | **MODIFICAR** | Toggles de métodos de pagamento |
| `src/components/PaymentOptionsCard.tsx` | **MODIFICAR** | Interface, validação, reutilização, modal alterar |
| `src/pages/Faturas.tsx` | **MODIFICAR** | Query com campos de expiração |
| `src/pages/Financeiro.tsx` | **MODIFICAR** | Query e alerta de taxas |
| `src/i18n/locales/pt/billing.json` | **MODIFICAR** | Strings em português |
| `src/i18n/locales/en/billing.json` | **MODIFICAR** | Strings em inglês |
| `supabase/config.toml` | **MODIFICAR** | Configurar nova edge function |

---

## 14. Checklist de Implementação

### Fase 1: Database
- [ ] Criar migração SQL para `enabled_payment_methods`
- [ ] Criar migração SQL para `pix_expires_at`, `boleto_expires_at`
- [ ] Criar índices de expiração
- [ ] Aplicar migração
- [ ] Regenerar tipos Supabase

### Fase 2: Backend - Geração Condicional
- [ ] `create-invoice`: Verificar `enabled_payment_methods` antes de gerar boleto
- [ ] `create-invoice`: Buscar `payment_due_days` para expiração
- [ ] `automated-billing`: Mesma lógica do create-invoice
- [ ] Testar geração condicional

### Fase 3: Backend - Validação e Expiração
- [ ] `create-payment-intent-connect`: Query com `enabled_payment_methods`
- [ ] `create-payment-intent-connect`: Validar método habilitado
- [ ] `create-payment-intent-connect`: Verificar PIX capability
- [ ] `create-payment-intent-connect`: Salvar timestamps de expiração
- [ ] `create-payment-intent-connect`: Limpar dados do método anterior
- [ ] Testar validações

### Fase 4: Backend - Alterar Método
- [ ] Criar `change-payment-method/index.ts`
- [ ] Configurar em `supabase/config.toml`
- [ ] Testar cancelamento de PI e limpeza de dados
- [ ] Deploy da função

### Fase 5: Frontend - stripe-fees.ts
- [ ] Adicionar `MINIMUM_PAYMENT_AMOUNTS`
- [ ] Adicionar `PAYMENT_METHOD_CONFIG` com descrições
- [ ] Adicionar funções auxiliares

### Fase 6: Frontend - Professor
- [ ] `BillingSettings`: Carregar de `business_profiles`
- [ ] `BillingSettings`: Toggles de métodos com taxas
- [ ] `BillingSettings`: Indicar geração automática de boleto
- [ ] `BillingSettings`: Validação mínimo 1 método
- [ ] Testar salvamento

### Fase 7: Frontend - Aluno
- [ ] `PaymentOptionsCard`: Atualizar interface Invoice
- [ ] `PaymentOptionsCard`: Funções `hasValidBoleto`, `hasValidPix`
- [ ] `PaymentOptionsCard`: Verificar `enabled_payment_methods` (invalidação)
- [ ] `PaymentOptionsCard`: UI condicional (existente vs opções)
- [ ] `PaymentOptionsCard`: Modal confirmação alterar método
- [ ] `PaymentOptionsCard`: Chamar `change-payment-method`
- [ ] `Faturas.tsx`: Atualizar query com campos de expiração
- [ ] `Financeiro.tsx`: Alerta de taxas completo

### Fase 8: i18n
- [ ] `pt/billing.json`: Todas as strings novas
- [ ] `en/billing.json`: Equivalentes em inglês

### Fase 9: Testes
- [ ] Professor configura métodos → Salva corretamente
- [ ] Fatura criada com boleto habilitado → Boleto gerado automaticamente
- [ ] Fatura criada sem boleto habilitado → Nenhum pagamento gerado
- [ ] Aluno vê boleto existente → Pode baixar ou alterar
- [ ] Professor desabilita boleto → Boleto existente invalidado
- [ ] Aluno altera de boleto para PIX → Boleto cancelado, PIX gerado
- [ ] Aluno tenta PIX sem capability → Erro amigável
- [ ] Validação de mínimos por método
- [ ] Múltiplos business_profiles funcionam

---

## 15. Estimativa de Tempo

| Tarefa | Tempo |
|--------|-------|
| Migração SQL + regenerar tipos | 30 min |
| Backend: Geração condicional (create-invoice, automated-billing) | 1.5 horas |
| Backend: Validação + PIX capability + expiração | 1.5 horas |
| Backend: change-payment-method | 1 hora |
| stripe-fees.ts | 30 min |
| BillingSettings | 2 horas |
| PaymentOptionsCard (reutilização + alterar) | 3 horas |
| Faturas.tsx + Financeiro.tsx | 1 hora |
| i18n | 45 min |
| Testes | 2 horas |
| **Total** | **~14 horas** |

---

## 16. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| PIX não habilitado na conta Stripe do professor | Alta | Médio | Verificar capability + mensagem amigável |
| Professor desabilita todos os métodos | Baixa | Alto | Validação frontend + backend impede |
| Aluno tenta burlar validação frontend | Baixa | Médio | Validação backend é obrigatória |
| Professor desabilita método com pagamentos pendentes | Média | Médio | Invalidar pagamentos existentes (decisão confirmada) |
| Expiração de boleto incorreta | Baixa | Médio | Usar `payment_due_days` do professor |
| Query de invoice não inclui business_profile | Média | Alto | Verificar todas as queries |

---

## 17. Histórico de Revisões

| Versão | Data | Descrição |
|--------|------|-----------|
| 1.0 | 2026-01-14 | Versão inicial do plano |
| 1.1 | 2026-01-14 | Lacunas: query Financeiro.tsx, interface Invoice, BillingSettings com business_profiles, PIX capability, múltiplos business_profiles |
| **2.0** | **2026-01-15** | **Arquitetura híbrida v2.0**: geração automática de boleto (se habilitado), campos de expiração, reutilização de links, alterar método pelo aluno, invalidação ao desabilitar método, cartão pode ser desabilitado, expiração de boleto usa `payment_due_days`, mensagem amigável para PIX capability |

---

## 18. Próximos Passos

1. ✅ **Aprovação do plano v2.0**: Revisar este documento
2. ⏳ **Criar migração SQL**: Adicionar colunas necessárias
3. ⏳ **Implementação Backend**: Edge functions
4. ⏳ **Implementação Frontend**: Componentes e páginas
5. ⏳ **Testes**: Validar todos os cenários
6. ⏳ **Deploy**: Staging → Produção
