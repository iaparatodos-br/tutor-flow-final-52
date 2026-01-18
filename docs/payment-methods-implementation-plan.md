# Plano de Implementação: Métodos de Pagamento Configuráveis pelo Professor

> **Versão**: 2.10  
> **Data**: 2026-01-18  
> **Status**: Em Implementação (Backend ~90% Concluído, Frontend ~60% Concluído)

---

## 1. Resumo Executivo

Permitir que professores configurem quais métodos de pagamento (Cartão, Boleto, PIX) estarão disponíveis para seus alunos, com **geração automática de pagamento** (prioridade: Boleto → PIX) quando habilitado e possibilidade do aluno alterar o método de pagamento.

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

### Novas Adições v2.1

| Aspecto | Decisão |
|---------|---------|
| **Validação de mínimos por método** | ✅ Frontend e backend validam: Boleto ≥ R$5, PIX ≥ R$1, Card ≥ R$0.50 |
| **PIX capability check** | ✅ Verificar em `create-payment-intent-connect` antes de processar PIX |
| **Tratamento de boleto ativo no Stripe** | ✅ Usar try/catch no `change-payment-method` (boleto PI não pode ser cancelado) |
| **config.toml para nova função** | ✅ Adicionar `[functions.change-payment-method]` com `verify_jwt = false` |
| **Limpeza de expiração no webhook** | ✅ Limpar `pix_expires_at`/`boleto_expires_at` quando pagamento sucede |

### Novas Adições v2.2

| Aspecto | Decisão |
|---------|---------|
| **Autorização de dependentes** | ✅ `change-payment-method` valida `responsible_id` além de `student_id` |
| **Status `falha_pagamento`** | ✅ Aluno pode trocar método em faturas com status `falha_pagamento` (não apenas `pendente`) |
| **Responsáveis em Faturas.tsx** | ✅ Query busca faturas do aluno OU de seus dependentes via `responsible_id` |
| **Modal em Faturas.tsx** | ✅ Substituir redirect `stripe_hosted_invoice_url` por modal com `PaymentOptionsCard` |
| **Callback `onPaymentMethodChanged`** | ✅ Adicionar prop em `PaymentOptionsCard` para recarregar dados após troca |
| **BillingSettings gerencia métodos** | ✅ Componente carrega e salva `enabled_payment_methods` de `business_profiles` |
| **Limpeza obrigatória no webhook** | ✅ Limpar `pix_qr_code`, `pix_copy_paste`, `pix_expires_at`, `boleto_url`, `boleto_expires_at`, `barcode`, `linha_digitavel` após pagamento |
| **Índices já existem** | ✅ Remover criação de `idx_invoices_pix_expires` e `idx_invoices_boleto_expires` da migração |

### Novas Adições v2.3 (CRÍTICO)

| Aspecto | Decisão |
|---------|---------|
| **`create-invoice` já gera boleto** | ✅ CONFIRMADO: `create-invoice` chama `create-payment-intent-connect` internamente |
| **Verificar `enabled_payment_methods` em `create-invoice`** | ✅ OBRIGATÓRIO: Antes de gerar boleto, verificar se está habilitado |
| **Hierarquia de geração automática** | ✅ Prioridade: 1º Boleto (se habilitado + valor ≥ R$5) → 2º PIX (se habilitado + valor ≥ R$1) → 3º Nenhum (aluno escolhe) |
| **`automated-billing` mesma lógica** | ✅ Aplicar mesma hierarquia e verificação de `enabled_payment_methods` |
| **`create-payment-intent-connect` salva `pix_expires_at`** | ✅ OBRIGATÓRIO: Ao criar PIX, salvar `pix_expires_at = now + 24h` |
| **Webhook limpa `pix_copy_paste`** | ✅ Incluir na limpeza obrigatória (estava faltando no detalhamento) |
| **`stripe-fees.ts` completo** | ✅ Adicionar todas as constantes e funções auxiliares que faltavam |
| **Consistência de tipos `amount`** | ✅ Garantir que `amount` seja `number` em toda a aplicação |

### Novas Adições v2.4 (CORREÇÕES FINAIS)

| Aspecto | Decisão |
|---------|---------|
| **`processMonthlySubscriptionBilling` hierarquia v2.3** | ✅ OBRIGATÓRIO: Aplicar mesma hierarquia (Boleto → PIX → Nenhum) ao faturamento de mensalidades mensais |
| **`PaymentOptionsCard` interface corrigida** | ✅ Alterar `amount: string` → `amount: number` para consistência |
| **`PaymentOptionsCard` campos de expiração** | ✅ Adicionar `pix_expires_at`, `boleto_expires_at`, `business_profile` à interface Invoice |
| **Correções de tipo em funções** | ✅ Corrigir `formatCurrency()` e `isBelowMinimum` para usar `number` |

### Novas Adições v2.5 (LACUNAS FINAIS)

| Aspecto | Decisão |
|---------|---------|
| **Webhook: Limpeza de campos temporários** | ✅ `payment_intent.succeeded` DEVE limpar `pix_qr_code`, `pix_copy_paste`, `pix_expires_at`, `boleto_url`, `boleto_expires_at`, `barcode`, `linha_digitavel` |
| **`create-payment-intent-connect`: Salvar `pix_expires_at`** | ✅ OBRIGATÓRIO: Ao criar PIX, salvar `pix_expires_at = now + 24h` na invoice |
| **`create-payment-intent-connect`: Validar `enabled_payment_methods`** | ✅ OBRIGATÓRIO: Buscar e validar que o método solicitado está habilitado no `business_profile` |
| **`create-payment-intent-connect`: Limpar método anterior** | ✅ OBRIGATÓRIO: Ao gerar boleto, limpar campos PIX; ao gerar PIX, limpar campos boleto; ao usar card, limpar ambos |
| **Mínimo global de R$5 para faturas** | ✅ CONFIRMADO: Manter validação de R$5 como mínimo global em `create-invoice` (comportamento atual) |

### Novas Adições v2.6 (LACUNAS IDENTIFICADAS)

| Aspecto | Decisão | Status |
|---------|---------|--------|
| **`automated-billing` hierarquia v2.3** | ✅ OBRIGATÓRIO: Aplicar hierarquia (Boleto → PIX → Nenhum) no faturamento tradicional, respeitando `enabled_payment_methods` | ❌ PENDENTE |
| **`processMonthlySubscriptionBilling` hierarquia v2.4** | ✅ OBRIGATÓRIO: Aplicar mesma hierarquia no faturamento de mensalidades mensais | ❌ PENDENTE |
| **`stripe-fees.ts` completo** | ✅ OBRIGATÓRIO: Adicionar todas as constantes e funções auxiliares (`MINIMUM_PAYMENT_AMOUNTS`, `STRIPE_FEES`, `PAYMENT_METHOD_ORDER`, `PAYMENT_METHOD_CONFIG`, `calculateFee`, `sortPaymentMethods`, `getAvailableMethodsForAmount`, etc.) | ❌ PENDENTE |
| **`Faturas.tsx` query com business_profile** | ✅ OBRIGATÓRIO: Buscar `enabled_payment_methods` do business_profile na query de faturas | ❌ PENDENTE |
| **`Faturas.tsx` campos de expiração** | ✅ OBRIGATÓRIO: Incluir `pix_expires_at` e `boleto_expires_at` na query para exibição | ❌ PENDENTE |
| **`PaymentOptionsCard` interface com `amount: number`** | ✅ RECOMENDADO: Alterar `amount: string` → `amount: number` na interface Invoice para consistência de tipos (evita `parseFloat()` workarounds) | ⚠️ PARCIALMENTE IMPLEMENTADO |
| **Audit log em `change-payment-method`** | ✅ IMPLEMENTADO: Registra old_data e new_data na tabela audit_logs | ✅ CONCLUÍDO |

### Novas Adições v2.7 (PONTAS SOLTAS)

| Aspecto | Decisão | Status |
|---------|---------|--------|
| **`PaymentOptionsCard` validação de métodos habilitados** | ✅ OBRIGATÓRIO: Filtrar botões de pagamento com base no `enabled_payment_methods` do `business_profile` (não exibir métodos desabilitados) | ❌ PENDENTE |
| **`PaymentOptionsCard` UI de expiração** | ✅ RECOMENDADO: Exibir informação de expiração (countdown/badge) para PIX e Boleto usando `pix_expires_at` e `boleto_expires_at` | ❌ PENDENTE |
| **`Faturas.tsx` UI de expiração** | ✅ RECOMENDADO: Exibir badge ou indicador de expiração na lista de faturas para PIX/Boleto pendentes | ❌ PENDENTE |

### Novas Adições v2.8 (FALHA CRÍTICA IDENTIFICADA)

| Aspecto | Decisão | Status |
|---------|---------|--------|
| **`automated-billing` query de businessProfile sem `enabled_payment_methods`** | ✅ CRÍTICO: A query na linha 132-137 busca apenas `id, business_name`. Deve incluir `enabled_payment_methods` para que a hierarquia v2.3/v2.4 funcione. Sem este campo, mesmo implementando a lógica de hierarquia, ela não terá acesso aos métodos habilitados. | ❌ PENDENTE |

### Novas Adições v2.9 (CLARIFICAÇÃO IMPORTANTE)

| Aspecto | Decisão | Status |
|---------|---------|--------|
| **`stripe-fees.ts` seção 5.1 é CÓDIGO DESEJADO** | ⚠️ IMPORTANTE: O código na seção 5.1 deste documento (`MINIMUM_PAYMENT_AMOUNTS`, `STRIPE_FEES`, `PAYMENT_METHOD_ORDER`, `PAYMENT_METHOD_CONFIG`, `getPaymentMethodLabel()`, `canGeneratePaymentMethod()`, etc.) representa o **ESTADO FINAL DESEJADO**, NÃO o código atual no repositório. O arquivo atual (`src/utils/stripe-fees.ts`) contém apenas constantes básicas de boleto. A implementação completa conforme seção 5.1 é necessária. | ❌ PENDENTE |

---

## 2. Arquitetura Híbrida v2.10

A nova arquitetura combina geração automática (prioridade: Boleto → PIX) com possibilidade de escolha do aluno:

| Cenário | Comportamento |
|---------|---------------|
| Professor tem **Boleto habilitado** + valor ≥ R$5 | Fatura criada → Boleto gerado automaticamente |
| Professor tem **apenas PIX habilitado** + valor ≥ R$1 | Fatura criada → PIX gerado automaticamente (v2.3) |
| Professor tem **apenas Card habilitado** | Fatura criada → Nenhum pagamento gerado (aluno escolhe) |
| Valor abaixo do mínimo de todos os métodos auto | Fatura criada → Nenhum pagamento gerado (v2.3) |
| Aluno abre fatura com **boleto existente válido** | Modal exibe "Pagar Boleto" + opção "Alterar Método" |
| Aluno clica **"Alterar Método"** | Cancela boleto anterior → Gera PIX ou redireciona para Card |
| Pagamento PIX/Card **bem-sucedido** | Invoice marcada como paga, boleto antigo invalidado |
| Professor **desabilita Boleto** após fatura criada | Boleto existente é **invalidado** - aluno não pode usar |
| **PIX capability** não ativa no Stripe | Erro amigável: "Seu professor não possui essa opção de pagamento disponível" |
| **Valor abaixo do mínimo** para um método | Método não exibido (frontend) + erro 400 (backend) |
| **Boleto PI ativo no Stripe** | `change-payment-method` trata erro graciosamente (não falha) |
| **Fatura com `falha_pagamento`** | ✅ v2.2: Aluno pode alterar método e tentar novamente |
| **Responsável de dependente** | ✅ v2.2: Pode ver e pagar faturas dos dependentes |
| **Mensalidade mensal** | ✅ v2.4: Mesma hierarquia de geração automática (Boleto → PIX → Nenhum) |

### Hierarquia de Geração Automática v2.10

```
┌─────────────────────────────────────────────────────────────────┐
│ PRIORIDADE DE GERAÇÃO AUTOMÁTICA                                 │
│ (create-invoice, automated-billing, processMonthlySubscription)  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 1️⃣ BOLETO habilitado + valor ≥ R$5?                             │
│    └─── SIM ───▶ Gerar Boleto (padrão atual)                    │
│    └─── NÃO ───▼                                                │
│                                                                 │
│ 2️⃣ PIX habilitado + valor ≥ R$1 + PIX capability ativa?         │
│    └─── SIM ───▶ Gerar PIX automaticamente                      │
│    └─── NÃO ───▼                                                │
│                                                                 │
│ 3️⃣ NENHUM método auto-gerável disponível                        │
│    └─── Deixar invoice sem pagamento pré-gerado                 │
│    └─── Aluno escolhe ao acessar Faturas.tsx                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo Visual Resumido

```
┌────────────────────────────────────────────────────────────────┐
│ PROFESSOR configura métodos em BillingSettings                 │
│ → Salva em business_profiles.enabled_payment_methods           │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ FATURA CRIADA (create-invoice / automated-billing /            │
│                processMonthlySubscriptionBilling)              │
│                                                                │
│   1. Buscar enabled_payment_methods do business_profile (v2.3) │
│   2. Aplicar hierarquia de geração automática:                 │
│      - Boleto habilitado + valor >= R$5? → Gerar boleto        │
│      - PIX habilitado + valor >= R$1? → Gerar PIX (v2.3)       │
│      - Senão → Não gerar nada                                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ ALUNO/RESPONSÁVEL acessa Faturas.tsx                           │
│ → Query busca faturas do aluno OU de seus dependentes (v2.2)   │
│ → Clica "Pagar Agora" → Abre modal PaymentOptionsCard (v2.2)   │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ PaymentOptionsCard analisa invoice:                            │
│                                                                │
│   1. Verifica enabled_payment_methods (invalida se desabilitado)│
│   2. Filtra métodos por valor mínimo (getAvailableMethodsForAmount)│
│   3. hasValidBoleto()?  ─── SIM ───▶ Exibe boleto + "Alterar"  │
│   4. hasValidPix()?     ─── SIM ───▶ Exibe PIX + "Alterar"     │
│   5. Senão              ─────────▶ Exibe opções habilitadas    │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ Aluno clica "Alterar Método":                                  │
│                                                                │
│ 1. Modal de confirmação                                        │
│ 2. Chama change-payment-method → Tenta cancelar PI no Stripe   │
│    (se falhar por boleto ativo, continua mesmo assim)          │
│ 3. Limpa campos de pagamento da invoice                        │
│ 4. Chama callback onPaymentMethodChanged() (v2.2)              │
│ 5. Exibe opções habilitadas (exceto método atual)              │
│ 6. Gera novo pagamento via create-payment-intent-connect       │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Taxas Oficiais do Stripe Brasil

| Método | Taxa | Exemplo (R$ 200,00) | **Valor Mínimo** |
|--------|------|---------------------|------------------|
| **Boleto** | R$ 3,49 fixo | R$ 3,49 | **R$ 5,00** |
| **PIX** | 1,19% | R$ 2,38 | **R$ 1,00** |
| **Cartão** | 3,99% + R$ 0,39 | R$ 8,37 | **R$ 0,50** |

> **Fonte**: [Stripe Brasil - Local Payment Methods](https://stripe.com/en-br/pricing/local-payment-methods)

---

## 4. Alterações no Banco de Dados

### 4.1 Status dos Campos (v2.2)

> ⚠️ **IMPORTANTE**: As colunas E os índices já existem no banco de dados. Nenhuma migração necessária.

| Tabela | Campo | Status | Descrição |
|--------|-------|--------|-----------|
| `business_profiles` | `enabled_payment_methods` | ✅ EXISTE | `TEXT[] DEFAULT ['boleto', 'pix', 'card']` |
| `invoices` | `pix_expires_at` | ✅ EXISTE | `TIMESTAMPTZ` |
| `invoices` | `boleto_expires_at` | ✅ EXISTE | `TIMESTAMPTZ` |
| `invoices` | `boleto_url` | ✅ EXISTE | `TEXT` |
| `invoices` | `pix_qr_code` | ✅ EXISTE | `TEXT` |
| `invoices` | `payment_method` | ✅ EXISTE | `TEXT` |
| `invoices` | `barcode` | ✅ EXISTE | `TEXT` |
| Índice `idx_invoices_pix_expires` | ✅ EXISTE | - |
| Índice `idx_invoices_boleto_expires` | ✅ EXISTE | - |

### 4.2 Migração SQL

> **v2.2**: Nenhuma migração necessária. Todos os campos e índices já existem.

### 4.3 Regeneração de Tipos

Após qualquer migração, regenerar os tipos do Supabase:

```bash
npx supabase gen types typescript --project-id nwgomximjevgczwuyqcx > src/integrations/supabase/types.ts
```

---

## 5. Constantes de Taxas e Utilitários

### 5.1 Arquivo: `src/utils/stripe-fees.ts`

> ⚠️ **ATENÇÃO v2.9**: O código abaixo representa o **ESTADO FINAL DESEJADO** para `stripe-fees.ts`.  
> O arquivo atual no repositório contém apenas constantes básicas de boleto (`STRIPE_BOLETO_FEE`, `MINIMUM_BOLETO_AMOUNT`, `MAXIMUM_BOLETO_AMOUNT`).  
> **TODO**: Implementar o código completo abaixo para suportar todos os métodos de pagamento.

```typescript
/**
 * Stripe fee calculation utilities for all payment methods
 * Updated: 2026-01-16 (v2.4)
 * Source: https://stripe.com/en-br/pricing/local-payment-methods
 */

// Constantes existentes (manter)
export const STRIPE_BOLETO_FEE = 3.49;
export const MINIMUM_BOLETO_AMOUNT = 5.00;
export const MAXIMUM_BOLETO_AMOUNT = 49999.99;

// Valores mínimos por método de pagamento (v2.1 - CRÍTICO)
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
    descriptionKey: 'billing.paymentMethods.methods.boleto.description',
    minimumAmount: MINIMUM_PAYMENT_AMOUNTS.boleto
  },
  card: {
    id: 'card',
    name: 'Cartão de Crédito',
    nameKey: 'billing.paymentMethods.methods.card.name',
    icon: 'CreditCard',
    fee: STRIPE_FEES.card,
    description: 'Pagamento processado pelo Stripe Checkout',
    descriptionKey: 'billing.paymentMethods.methods.card.description',
    minimumAmount: MINIMUM_PAYMENT_AMOUNTS.card
  },
  pix: {
    id: 'pix',
    name: 'PIX',
    nameKey: 'billing.paymentMethods.methods.pix.name',
    icon: 'QrCode',
    fee: STRIPE_FEES.pix,
    description: 'Código expira em 24 horas',
    descriptionKey: 'billing.paymentMethods.methods.pix.description',
    minimumAmount: MINIMUM_PAYMENT_AMOUNTS.pix
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
 * Verifica se um valor atende ao mínimo para um método (v2.1 - CRÍTICO)
 */
export const meetsMinimumAmount = (method: PaymentMethodType, amount: number): boolean => {
  return amount >= MINIMUM_PAYMENT_AMOUNTS[method];
};

/**
 * Filtra métodos disponíveis baseado no valor da fatura (v2.1 - CRÍTICO)
 * Usado tanto no frontend (PaymentOptionsCard) quanto no backend (validação)
 */
export const getAvailableMethodsForAmount = (
  enabledMethods: PaymentMethodType[], 
  amount: number
): PaymentMethodType[] => {
  return enabledMethods.filter(method => meetsMinimumAmount(method, amount));
};

/**
 * Retorna mensagem de erro para valor abaixo do mínimo (v2.1)
 */
export const getMinimumAmountError = (method: PaymentMethodType): string => {
  const min = MINIMUM_PAYMENT_AMOUNTS[method];
  const formatted = new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL' 
  }).format(min);
  return `Valor mínimo para ${PAYMENT_METHOD_CONFIG[method].name}: ${formatted}`;
};
```

---

## 6. Backend - Geração Condicional com Hierarquia v2.6

### 6.1 Arquivo: `supabase/functions/create-invoice/index.ts`

**Alterações necessárias (v2.3 - CRÍTICO):**

1. Buscar `enabled_payment_methods` do `business_profile`
2. Aplicar **hierarquia de geração automática**: Boleto → PIX → Nenhum
3. Buscar `payment_due_days` do professor para definir expiração de boleto
4. Verificar PIX capability antes de gerar PIX automaticamente
5. Verificar valores mínimos para cada método

> ⚠️ **IMPORTANTE**: `create-invoice` **já chama** `create-payment-intent-connect` internamente.
> O problema atual é que **sempre gera boleto**, ignorando `enabled_payment_methods`.

```typescript
// ============================================================
// CÓDIGO ATUAL (PROBLEMÁTICO) - linhas ~359-439
// ============================================================
// O código atual sempre tenta gerar boleto, sem verificar
// se o método está habilitado no business_profile.

// ============================================================
// CÓDIGO CORRIGIDO (v2.3) - Inserir ANTES de chamar create-payment-intent-connect
// ============================================================

// Constantes de valores mínimos
const MINIMUM_AMOUNTS = {
  boleto: 5.00,
  pix: 1.00,
  card: 0.50
};

// 1. Buscar enabled_payment_methods do business_profile
const { data: businessProfile } = await supabase
  .from('business_profiles')
  .select('id, enabled_payment_methods, stripe_connect_id')
  .eq('id', businessProfileId)
  .single();

const enabledMethods: string[] = businessProfile?.enabled_payment_methods || ['boleto', 'pix', 'card'];
logStep('Métodos habilitados', { enabledMethods });

// 2. Buscar payment_due_days do professor para expiração do boleto
const { data: teacherProfile } = await supabase
  .from('profiles')
  .select('payment_due_days')
  .eq('id', teacherId)
  .single();

const paymentDueDays = teacherProfile?.payment_due_days || 7;

// 3. Aplicar hierarquia de geração automática (v2.3)
let autoGeneratedMethod: string | null = null;

// Prioridade 1: Boleto
if (enabledMethods.includes('boleto') && amount >= MINIMUM_AMOUNTS.boleto) {
  autoGeneratedMethod = 'boleto';
  logStep('Hierarquia v2.3: Gerando boleto automaticamente', { amount, minBoleto: MINIMUM_AMOUNTS.boleto });
}
// Prioridade 2: PIX (se boleto não disponível)
else if (enabledMethods.includes('pix') && amount >= MINIMUM_AMOUNTS.pix) {
  // Verificar PIX capability antes de tentar gerar
  // (será validado novamente em create-payment-intent-connect)
  autoGeneratedMethod = 'pix';
  logStep('Hierarquia v2.3: Gerando PIX automaticamente (boleto não disponível)', { 
    amount, 
    minPix: MINIMUM_AMOUNTS.pix,
    boletoEnabled: enabledMethods.includes('boleto')
  });
}
// Prioridade 3: Nenhum método auto-gerável
else {
  logStep('Hierarquia v2.3: Nenhum método auto-gerável disponível', {
    enabledMethods,
    amount,
    boletoEnabled: enabledMethods.includes('boleto'),
    pixEnabled: enabledMethods.includes('pix'),
    minBoleto: MINIMUM_AMOUNTS.boleto,
    minPix: MINIMUM_AMOUNTS.pix
  });
}

// 4. Gerar pagamento automaticamente se houver método disponível
if (autoGeneratedMethod) {
  try {
    const { data: paymentResult, error: paymentError } = await supabase.functions.invoke(
      'create-payment-intent-connect',
      {
        body: { 
          invoice_id: invoiceId, 
          payment_method: autoGeneratedMethod,
          expires_after_days: autoGeneratedMethod === 'boleto' ? paymentDueDays : undefined
        }
      }
    );
    
    if (paymentError) {
      logStep(`⚠️ Erro ao gerar ${autoGeneratedMethod} automaticamente`, { error: paymentError });
      // Não falhar a criação da invoice por causa disso
      // Aluno poderá escolher método manualmente
    } else if (paymentResult) {
      logStep(`✓ ${autoGeneratedMethod} gerado automaticamente`, { 
        hasUrl: !!paymentResult.boleto_url || !!paymentResult.pix_qr_code
      });
      
      // Dados são atualizados pelo próprio create-payment-intent-connect
    }
  } catch (autoGenError) {
    logStep(`⚠️ Exceção ao gerar ${autoGeneratedMethod}`, { error: String(autoGenError) });
    // Continuar mesmo assim - invoice foi criada
  }
}
```

### 6.2 Arquivo: `supabase/functions/automated-billing/index.ts` - Faturamento Tradicional

**Mesma lógica do `create-invoice` (v2.3)**:

1. Buscar `enabled_payment_methods` do business_profile
2. Aplicar hierarquia: Boleto → PIX → Nenhum
3. Verificar valores mínimos antes de gerar

```typescript
// Aplicar a mesma lógica de hierarquia v2.3 descrita acima
// Copiar o bloco de código da seção 6.1
```

### 6.3 Arquivo: `supabase/functions/automated-billing/index.ts` - `processMonthlySubscriptionBilling` (v2.4 - NOVO)

**v2.4 - CRÍTICO**: A função `processMonthlySubscriptionBilling` atualmente SEMPRE tenta gerar boleto, ignorando `enabled_payment_methods`. Deve aplicar a **mesma hierarquia v2.3**.

#### Código Atual (Problemático) - Linhas ~847-879

```typescript
// PROBLEMA: Sempre tenta gerar boleto, ignorando enabled_payment_methods
if (!skipBoletoGeneration) {
  try {
    const { data: paymentResult } = await supabaseAdmin.functions.invoke(
      'create-payment-intent-connect',
      { body: { invoice_id: invoiceId, payment_method: 'boleto' } }
    );
    // ... salvar boleto_url ...
  }
}
```

#### Código Corrigido (v2.4)

```typescript
// v2.4: Aplicar hierarquia de geração automática (Boleto → PIX → Nenhum)
// Igual à lógica em create-invoice (seção 6.1 do documento)

// Constantes de valores mínimos
const MINIMUM_AMOUNTS = {
  boleto: 5.00,
  pix: 1.00,
  card: 0.50
};

// 1. Buscar enabled_payment_methods do business_profile
const { data: businessProfile } = await supabaseAdmin
  .from('business_profiles')
  .select('enabled_payment_methods')
  .eq('id', studentInfo.business_profile_id)
  .single();

const enabledMethods: string[] = businessProfile?.enabled_payment_methods || ['boleto', 'pix', 'card'];

// 2. Aplicar hierarquia de geração automática
let autoGeneratedMethod: string | null = null;

// Prioridade 1: Boleto (se habilitado + valor >= R$5)
if (enabledMethods.includes('boleto') && totalAmount >= MINIMUM_AMOUNTS.boleto) {
  autoGeneratedMethod = 'boleto';
  logStep('Hierarquia v2.4: Gerando boleto para mensalidade', { 
    totalAmount, 
    minBoleto: MINIMUM_AMOUNTS.boleto 
  });
}
// Prioridade 2: PIX (se boleto não disponível + PIX habilitado + valor >= R$1)
else if (enabledMethods.includes('pix') && totalAmount >= MINIMUM_AMOUNTS.pix) {
  autoGeneratedMethod = 'pix';
  logStep('Hierarquia v2.4: Gerando PIX para mensalidade (boleto não disponível)', { 
    totalAmount, 
    minPix: MINIMUM_AMOUNTS.pix,
    boletoEnabled: enabledMethods.includes('boleto')
  });
}
// Prioridade 3: Nenhum método auto-gerável
else {
  logStep('Hierarquia v2.4: Nenhum método auto-gerável para mensalidade', {
    enabledMethods,
    totalAmount,
    minBoleto: MINIMUM_AMOUNTS.boleto,
    minPix: MINIMUM_AMOUNTS.pix
  });
}

// 3. Gerar pagamento automaticamente se houver método disponível
if (autoGeneratedMethod) {
  try {
    const { data: paymentResult, error: paymentError } = await supabaseAdmin.functions.invoke(
      'create-payment-intent-connect',
      {
        body: {
          invoice_id: invoiceId,
          payment_method: autoGeneratedMethod,
          expires_after_days: autoGeneratedMethod === 'boleto' 
            ? studentInfo.payment_due_days 
            : undefined
        }
      }
    );

    if (!paymentError && paymentResult) {
      // Atualizar campos baseado no método gerado
      const updateFields: any = {
        stripe_payment_intent_id: paymentResult.payment_intent_id,
        payment_method: autoGeneratedMethod
      };

      if (autoGeneratedMethod === 'boleto' && paymentResult.boleto_url) {
        updateFields.stripe_hosted_invoice_url = paymentResult.boleto_url;
        updateFields.boleto_url = paymentResult.boleto_url;
        updateFields.linha_digitavel = paymentResult.linha_digitavel;
        
        logStep(`💳 Boleto generated for monthly subscription`, { invoiceId });
      } else if (autoGeneratedMethod === 'pix' && paymentResult.pix_qr_code) {
        updateFields.pix_qr_code = paymentResult.pix_qr_code;
        updateFields.pix_copy_paste = paymentResult.pix_copy_paste;
        // pix_expires_at já é salvo pelo create-payment-intent-connect (v2.3)
        
        logStep(`⚡ PIX generated for monthly subscription`, { invoiceId });
      }

      await supabaseAdmin
        .from('invoices')
        .update(updateFields)
        .eq('id', invoiceId);
    } else {
      logStep(`⚠️ Failed to generate ${autoGeneratedMethod} for monthly subscription`, { 
        error: paymentError 
      });
    }
  } catch (paymentError) {
    logStep(`⚠️ Exception generating ${autoGeneratedMethod} for monthly subscription`, paymentError);
    // Continue without failing - invoice was created
  }
}
```

---

## 7. Backend - Validação, PIX Capability, Expiração e Limpeza v2.6

### 7.1 Arquivo: `supabase/functions/create-payment-intent-connect/index.ts`

**Alterações necessárias (v2.5 - CRÍTICO):**

> ⚠️ **LACUNAS IDENTIFICADAS v2.5**: O código atual NÃO:
> 1. Busca/valida `enabled_payment_methods` do business_profile
> 2. Salva `pix_expires_at` ao criar PIX
> 3. Limpa dados do método anterior ao gerar novo método

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

#### 7.1.3 Validar valor mínimo (v2.1 - NOVO)

```typescript
// Valores mínimos por método
const MINIMUM_AMOUNTS = {
  boleto: 5.00,
  pix: 1.00,
  card: 0.50
};

const amount = invoice.amount;
const minimumForMethod = MINIMUM_AMOUNTS[payment_method] || 0;

if (amount < minimumForMethod) {
  logStep('❌ Valor abaixo do mínimo', { 
    amount, 
    method: payment_method, 
    minimum: minimumForMethod 
  });
  
  return new Response(
    JSON.stringify({ 
      error: `Valor mínimo para ${payment_method} é R$ ${minimumForMethod.toFixed(2)}`,
      errorCode: 'AMOUNT_BELOW_MINIMUM'
    }),
    { status: 400, headers: corsHeaders }
  );
}
```

#### 7.1.4 Verificar PIX capability (v2.1 - CRÍTICO)

```typescript
// Antes de processar PIX, verificar capability
if (payment_method === 'pix') {
  const account = await stripe.accounts.retrieve(stripeConnectId);
  const pixCapability = account.capabilities?.pix_payments;
  
  if (pixCapability !== 'active') {
    logStep('❌ PIX capability não ativa', { 
      pixCapability,
      accountId: stripeConnectId
    });
    
    return new Response(
      JSON.stringify({ 
        error: 'Seu professor não possui essa opção de pagamento disponível',
        errorCode: 'PIX_NOT_ENABLED'
      }),
      { status: 400, headers: corsHeaders }
    );
  }
  
  logStep('✓ PIX capability ativa');
}
```

#### 7.1.5 Salvar timestamps de expiração e limpar método anterior (v2.5 - CRÍTICO)

> ⚠️ **LACUNA v2.5**: O código atual de `create-payment-intent-connect` NÃO salva `pix_expires_at` ao criar PIX nem limpa dados do método anterior.

```typescript
// ============================================================
// v2.5 - OBRIGATÓRIO: Ao criar PIX, salvar pix_expires_at E limpar boleto
// ============================================================
const pixExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

await supabase.from('invoices').update({
  pix_qr_code: data.pix_qr_code,
  pix_copy_paste: data.pix_copy_paste,
  pix_expires_at: pixExpiresAt, // v2.5 - CRÍTICO: DEVE ser salvo
  payment_method: 'pix',
  stripe_payment_intent_id: paymentIntent.id,
  // v2.5 - CRÍTICO: Limpar dados do boleto anterior
  boleto_url: null,
  linha_digitavel: null,
  barcode: null,
  boleto_expires_at: null,
  stripe_hosted_invoice_url: null // Limpar URL do boleto também
}).eq('id', invoice_id);

logStep('✓ PIX criado e pix_expires_at salvo', { pixExpiresAt });

// ============================================================
// v2.5 - OBRIGATÓRIO: Ao criar Boleto, salvar boleto_expires_at E limpar PIX
// ============================================================
const paymentDueDays = expires_after_days || 7;
const boletoExpiresAt = new Date();
boletoExpiresAt.setDate(boletoExpiresAt.getDate() + paymentDueDays);

await supabase.from('invoices').update({
  boleto_url: data.boleto_url,
  linha_digitavel: data.linha_digitavel,
  barcode: data.barcode,
  stripe_hosted_invoice_url: data.boleto_url, // Para compatibilidade
  boleto_expires_at: boletoExpiresAt.toISOString(),
  payment_method: 'boleto',
  stripe_payment_intent_id: paymentIntent.id,
  // v2.5 - CRÍTICO: Limpar dados do PIX anterior
  pix_qr_code: null,
  pix_copy_paste: null,
  pix_expires_at: null
}).eq('id', invoice_id);

logStep('✓ Boleto criado e boleto_expires_at salvo', { boletoExpiresAt: boletoExpiresAt.toISOString() });

// ============================================================
// v2.5 - OBRIGATÓRIO: Ao usar Card (checkout session), limpar ambos
// ============================================================
await supabase.from('invoices').update({
  payment_method: 'card',
  // v2.5 - CRÍTICO: Limpar boleto E PIX anteriores
  boleto_url: null,
  linha_digitavel: null,
  barcode: null,
  boleto_expires_at: null,
  stripe_hosted_invoice_url: null,
  pix_qr_code: null,
  pix_copy_paste: null,
  pix_expires_at: null
}).eq('id', invoice_id);

logStep('✓ Card iniciado e campos temporários limpos');
```

---

## 8. Backend - Nova Função: change-payment-method

### 8.1 Arquivo: `supabase/functions/change-payment-method/index.ts`

**Propósito**: Permitir que o aluno troque o método de pagamento, cancelando o anterior.

**Diferença do `cancel-payment-intent`**:
- `cancel-payment-intent`: Marca fatura como paga manualmente (usado pelo professor)
- `change-payment-method`: Limpa dados de pagamento, mantém status pendente (usado pelo aluno)

**v2.1 - Tratamento de boleto ativo**: Boletos confirmados no Stripe não podem ser cancelados. O código trata esse erro graciosamente.

**v2.2 - Autorização de dependentes**: Valida `responsible_id` além de `student_id`.

**v2.2 - Status `falha_pagamento`**: Permite troca de método também para faturas com falha.

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  console.log(`[change-payment-method] ${step}`, details ? JSON.stringify(details) : '');
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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { invoice_id } = await req.json();
    logStep('Iniciando alteração de método', { invoice_id, user_id: user.id });

    // Buscar invoice com dados do aluno para verificar responsible_id (v2.2)
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        business_profile:business_profiles!invoices_business_profile_id_fkey(
          stripe_connect_id
        ),
        student:profiles!invoices_student_id_fkey(
          id,
          name
        )
      `)
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      logStep('❌ Fatura não encontrada', { invoiceError });
      return new Response(
        JSON.stringify({ error: 'Fatura não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // v2.2: Verificar se é o aluno OU o responsável de um dependente
    // Buscar relationship para verificar responsible_id
    const { data: relationship } = await supabase
      .from('teacher_student_relationships')
      .select('student_id, student_guardian_email')
      .eq('student_id', invoice.student_id)
      .eq('teacher_id', invoice.teacher_id)
      .single();

    // Buscar dependents onde o usuário é o responsável
    const { data: dependentsAsResponsible } = await supabase
      .from('dependents')
      .select('id, responsible_id')
      .eq('responsible_id', user.id);

    const isStudent = invoice.student_id === user.id;
    const isResponsible = dependentsAsResponsible?.some(dep => dep.responsible_id === user.id) || false;
    
    // Também verificar se o usuário é guardião na relationship
    const { data: guardianRelationship } = await supabase
      .from('teacher_student_relationships')
      .select('id')
      .eq('student_id', invoice.student_id)
      .eq('student_guardian_email', user.email)
      .single();
    
    const isGuardian = !!guardianRelationship;

    if (!isStudent && !isResponsible && !isGuardian) {
      logStep('❌ Usuário não autorizado', { 
        student_id: invoice.student_id, 
        user_id: user.id,
        isStudent,
        isResponsible,
        isGuardian
      });
      return new Response(
        JSON.stringify({ error: 'Você não tem permissão para alterar esta fatura' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // v2.2: Validar que fatura está pendente OU com falha de pagamento
    const allowedStatuses = ['pendente', 'falha_pagamento'];
    if (!allowedStatuses.includes(invoice.status)) {
      logStep('❌ Status inválido', { status: invoice.status });
      return new Response(
        JSON.stringify({ error: 'Apenas faturas pendentes ou com falha podem ter o método alterado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tentar cancelar Payment Intent no Stripe (se existir)
    // v2.1: Tratar graciosamente se for boleto ativo (não pode ser cancelado)
    let stripeCancelled = false;
    if (invoice.stripe_payment_intent_id && invoice.business_profile?.stripe_connect_id) {
      try {
        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
          apiVersion: '2023-10-16',
        });

        await stripe.paymentIntents.cancel(
          invoice.stripe_payment_intent_id,
          { stripeAccount: invoice.business_profile.stripe_connect_id }
        );
        
        stripeCancelled = true;
        logStep('✓ Payment Intent cancelado no Stripe');
        
      } catch (stripeError: any) {
        // v2.1: Tratamento específico para boleto ativo
        // Boletos confirmados não podem ser cancelados no Stripe
        const errorMessage = stripeError?.message || '';
        
        if (errorMessage.includes('cannot be canceled') || 
            errorMessage.includes('already succeeded') ||
            errorMessage.includes('already canceled')) {
          logStep('⚠️ PI não pode ser cancelado (provavelmente boleto ativo)', { 
            errorMessage,
            paymentIntentId: invoice.stripe_payment_intent_id
          });
          // Continuar mesmo assim - vamos limpar os dados localmente
        } else {
          logStep('⚠️ Erro ao cancelar PI no Stripe', { errorMessage });
          // Continuar mesmo assim para limpar dados localmente
        }
      }
    }

    // Limpar campos de pagamento da invoice (manter status pendente)
    // v2.2: Limpar também status para 'pendente' se estava em 'falha_pagamento'
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
        status: 'pendente', // v2.2: Resetar para pendente
        updated_at: new Date().toISOString()
      })
      .eq('id', invoice_id);

    if (updateError) {
      logStep('❌ Erro ao limpar dados de pagamento', { updateError });
      return new Response(
        JSON.stringify({ error: 'Erro ao limpar dados de pagamento' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logStep('✓ Método de pagamento alterado com sucesso', { stripeCancelled });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Método de pagamento alterado. Escolha um novo método.',
        stripeCancelled
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### 8.2 Configuração: `supabase/config.toml` (v2.1 - CRÍTICO)

Adicionar a seguinte configuração no arquivo `supabase/config.toml`:

```toml
[functions.change-payment-method]
verify_jwt = false
```

---

## 9. Backend - Webhook: Limpeza Obrigatória ao Pagar (v2.5 - CRÍTICO)

### 9.1 Arquivo: `supabase/functions/webhook-stripe-connect/index.ts`

> ⚠️ **LACUNA IDENTIFICADA v2.5**: O código atual de `webhook-stripe-connect` no evento `payment_intent.succeeded` NÃO limpa os campos temporários de pagamento após o pagamento ser confirmado. Isso causa dados "órfãos" na invoice.

**v2.5 - Alteração OBRIGATÓRIA**: Limpar TODOS os campos temporários de pagamento quando pagamento é bem-sucedido.

```typescript
// No handler de payment_intent.succeeded

case 'payment_intent.succeeded': {
  const paymentIntent = event.data.object;
  
  logStep('Payment Intent succeeded', { 
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount
  });
  
  // v2.5: Atualizar invoice para 'pago' E limpar TODOS os campos temporários (OBRIGATÓRIO)
  const { error: updateError } = await supabaseAdmin
    .from('invoices')
    .update({
      status: 'pago',
      updated_at: new Date().toISOString(),
      // v2.5 - CRÍTICO: Limpeza COMPLETA de campos temporários
      pix_qr_code: null,
      pix_copy_paste: null,
      pix_expires_at: null,
      boleto_url: null,
      linha_digitavel: null,
      barcode: null,
      boleto_expires_at: null,
      stripe_hosted_invoice_url: null // Limpar URL do boleto também
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);
    
  if (updateError) {
    logStep('Erro ao atualizar invoice', { error: updateError });
    // Não falhar o webhook por isso - pagamento foi processado
  } else {
    logStep('✓ Invoice atualizada e TODOS os campos temporários limpos (v2.5)');
  }
  
  break;
}
```

---

## 10. Frontend - BillingSettings (Professor)

### 10.1 Arquivo: `src/components/Settings/BillingSettings.tsx`

**Alterações necessárias (v2.2 - CRÍTICO):**

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
│    ℹ️ Valor mínimo: R$ 5,00                                      │
│                                                                  │
│ 💳 Cartão de Crédito                                  [TOGGLE ✓] │
│    Taxa: 3,99% + R$ 0,39                                         │
│    Exemplo: Em R$ 200,00 = R$ 8,37 de taxa                       │
│    ℹ️ Valor mínimo: R$ 0,50                                      │
│                                                                  │
│ ⚡ PIX                                                 [TOGGLE ✓] │
│    Taxa: 1,19%                                                   │
│    Exemplo: Em R$ 200,00 = R$ 2,38 de taxa                       │
│    ℹ️ Valor mínimo: R$ 1,00                                      │
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
  showMinimumAmount?: boolean; // v2.1: Exibir valor mínimo
}
```

#### Lógica de Carregamento (v2.2 - ATUALIZADA)

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

#### Lógica de Salvamento (v2.2)

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

## 11. Frontend - PaymentOptionsCard (Aluno)

### 11.1 Arquivo: `src/components/PaymentOptionsCard.tsx`

**Alterações necessárias:**

1. **Atualizar interface Invoice** com campos de expiração e business_profile
2. **Funções de validação** (`hasValidBoleto`, `hasValidPix`)
3. **Verificar `enabled_payment_methods`** para invalidar boletos/PIX de métodos desabilitados
4. **v2.1: Filtrar métodos por valor mínimo** (`getAvailableMethodsForAmount`)
5. **UI condicional** (pagamento existente vs opções)
6. **Modal de confirmação** para alterar método
7. **Chamar nova função** `change-payment-method`
8. **v2.2: Adicionar callback `onPaymentMethodChanged`**
9. **v2.4: Corrigir tipo de `amount` para `number`**

#### Nova Interface Invoice (v2.4 - ATUALIZADA)

```typescript
interface Invoice {
  id: string;
  amount: number; // v2.4: CORRIGIDO - era string, agora é number
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
  pix_expires_at: string | null; // v2.4: Adicionado
  boleto_expires_at: string | null; // v2.4: Adicionado
  business_profile?: { // v2.4: Adicionado
    id: string;
    business_name: string;
    enabled_payment_methods: string[] | null;
  } | null;
}
```

#### Interface de Props (v2.2)

```typescript
interface PaymentOptionsCardProps {
  invoice: Invoice;
  onPaymentSuccess?: () => void;
  onPaymentMethodChanged?: () => void; // v2.2: Novo callback
}
```

#### Funções de Validação (v2.4 - Atualizadas)

```typescript
import { 
  PaymentMethodType, 
  meetsMinimumAmount, 
  sortPaymentMethods,
  getAvailableMethodsForAmount,
  MINIMUM_BOLETO_AMOUNT
} from '@/utils/stripe-fees';

// v2.4: Função formatCurrency corrigida para usar number
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(amount);
};

// v2.4: isBelowMinimum corrigido para não usar parseFloat
const isBelowMinimum = invoice.amount < MINIMUM_BOLETO_AMOUNT;

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

// v2.4: Obtém métodos disponíveis (habilitados + valor mínimo) - sem parseFloat
const getAvailableMethods = (): PaymentMethodType[] => {
  const enabledMethods = invoice.business_profile?.enabled_payment_methods || ['boleto', 'pix', 'card'];
  const amount = invoice.amount; // v2.4: Já é number, não precisa parseFloat
  
  // Filtrar por métodos habilitados E que atendem ao valor mínimo
  return sortPaymentMethods(
    getAvailableMethodsForAmount(enabledMethods as PaymentMethodType[], amount)
  );
};

// v2.1: Verificar se há métodos disponíveis
const hasAvailableMethods = (): boolean => {
  return getAvailableMethods().length > 0;
};
```

#### Lógica de Alteração (v2.2)

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
    onPaymentMethodChanged?.(); // v2.2: Callback para recarregar dados
    
  } catch (error) {
    toast.error(t('billing.paymentMethods.errors.changeMethodFailed'));
  } finally {
    setChangingMethod(false);
  }
};
```

---

## 12. Frontend - Queries Atualizadas

### 12.1 Arquivo: `src/pages/Faturas.tsx` (v2.2 - CRÍTICO)

**Query atualizada para suportar dependentes:**

```typescript
// v2.2: Query busca faturas do aluno OU de seus dependentes
const fetchStudentInvoices = async () => {
  if (!user?.id) return [];
  
  // Primeiro, buscar IDs de dependentes onde o usuário é responsável
  const { data: dependents } = await supabase
    .from('dependents')
    .select('id, responsible_id')
    .eq('responsible_id', user.id);
  
  // Buscar relationships onde o usuário é guardião
  const { data: guardianRelationships } = await supabase
    .from('teacher_student_relationships')
    .select('student_id')
    .eq('student_guardian_email', user.email);
  
  // Coletar todos os student_ids que o usuário pode ver
  const studentIds = [user.id];
  if (guardianRelationships) {
    guardianRelationships.forEach(rel => {
      if (!studentIds.includes(rel.student_id)) {
        studentIds.push(rel.student_id);
      }
    });
  }
  
  // Buscar faturas
  const { data: invoicesData, error } = await supabase
    .from('invoices')
    .select(`
      id, created_at, due_date, amount, status, description, invoice_type,
      boleto_url, linha_digitavel, barcode,
      pix_qr_code, pix_copy_paste,
      stripe_payment_intent_id, payment_method,
      pix_expires_at, boleto_expires_at,
      student:profiles!invoices_student_id_fkey(id, name),
      business_profile:business_profiles!invoices_business_profile_id_fkey(
        id, business_name, enabled_payment_methods
      )
    `)
    .in('student_id', studentIds)
    .order('created_at', { ascending: false });
    
  if (error) throw error;
  return invoicesData || [];
};
```

**v2.2: Substituir redirect por modal:**

```tsx
// ANTES (NÃO USAR)
<Button onClick={() => window.open(invoice.stripe_hosted_invoice_url)}>
  Pagar
</Button>

// DEPOIS (v2.2)
const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

// Na tabela
<Button onClick={() => setSelectedInvoice(invoice)}>
  Pagar
</Button>

// Modal
<Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>{t('financial.payInvoice')}</DialogTitle>
    </DialogHeader>
    {selectedInvoice && (
      <PaymentOptionsCard 
        invoice={selectedInvoice}
        onPaymentSuccess={() => {
          setSelectedInvoice(null);
          refetch();
        }}
        onPaymentMethodChanged={() => refetch()} // v2.2
      />
    )}
  </DialogContent>
</Dialog>
```

### 12.2 Arquivo: `src/pages/Financeiro.tsx`

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

**Alerta de taxas completo (v2.1 - todos os métodos):**

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

## 13. Internacionalização (i18n)

### 13.1 Português: `src/i18n/locales/pt/billing.json`

```json
{
  "paymentMethods": {
    "title": "Métodos de Pagamento Disponíveis",
    "subtitle": "Selecione quais formas de pagamento seus alunos poderão utilizar. As taxas são cobradas pela Stripe.",
    "atLeastOne": "Pelo menos um método de pagamento deve estar habilitado",
    "feeLabel": "Taxa",
    "exampleLabel": "Exemplo",
    "exampleFormat": "Em {{amount}} = {{fee}} de taxa",
    "minimumLabel": "Valor mínimo",
    "noBusinessProfile": "Você precisa configurar um perfil de negócios antes de gerenciar métodos de pagamento.",
    "configureNow": "Configurar agora",
    "saveSettings": "Salvar Configurações",
    "methods": {
      "boleto": {
        "name": "Boleto Bancário",
        "fee": "R$ 3,49 por transação",
        "action": "Gerar Boleto",
        "description": "Boletos são gerados automaticamente nas faturas",
        "minimum": "R$ 5,00"
      },
      "card": {
        "name": "Cartão de Crédito",
        "fee": "3,99% + R$ 0,39",
        "action": "Pagar",
        "description": "Pagamento processado pelo Stripe Checkout",
        "minimum": "R$ 0,50"
      },
      "pix": {
        "name": "PIX",
        "fee": "1,19%",
        "action": "Gerar PIX",
        "description": "Código expira em 24 horas",
        "minimum": "R$ 1,00"
      }
    },
    "singleMethodButton": "Pagar com {{method}}",
    "chooseMethod": "Escolha a forma de pagamento",
    "noMethodsAvailable": "Valor abaixo do mínimo para pagamento online",
    "noMethodsDescription": "O valor desta fatura está abaixo do mínimo aceito pelos métodos de pagamento disponíveis. Entre em contato com seu professor para outras formas de pagamento.",
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
      "failedPaymentInfo": "O pagamento anterior falhou. Você pode tentar com outro método.",
      "keepCurrent": "Manter Atual",
      "confirmChange": "Confirmar Alteração"
    },
    "methodChanged": "Método de pagamento alterado. Escolha um novo método.",
    "errors": {
      "pixNotEnabled": "Seu professor não possui essa opção de pagamento disponível",
      "methodNotAllowed": "Este método de pagamento não está disponível.",
      "changeMethodFailed": "Erro ao alterar método de pagamento. Tente novamente.",
      "amountBelowMinimum": "Valor abaixo do mínimo para este método de pagamento"
    }
  }
}
```

### 13.2 Inglês: `src/i18n/locales/en/billing.json`

```json
{
  "paymentMethods": {
    "title": "Available Payment Methods",
    "subtitle": "Select which payment methods your students can use. Fees are charged by Stripe.",
    "atLeastOne": "At least one payment method must be enabled",
    "feeLabel": "Fee",
    "exampleLabel": "Example",
    "exampleFormat": "On {{amount}} = {{fee}} fee",
    "minimumLabel": "Minimum amount",
    "noBusinessProfile": "You need to set up a business profile before managing payment methods.",
    "configureNow": "Configure now",
    "saveSettings": "Save Settings",
    "methods": {
      "boleto": {
        "name": "Boleto Bancário",
        "fee": "R$ 3.49 per transaction",
        "action": "Generate Boleto",
        "description": "Boletos are automatically generated on invoices",
        "minimum": "R$ 5.00"
      },
      "card": {
        "name": "Credit Card",
        "fee": "3.99% + R$ 0.39",
        "action": "Pay",
        "description": "Payment processed by Stripe Checkout",
        "minimum": "R$ 0.50"
      },
      "pix": {
        "name": "PIX",
        "fee": "1.19%",
        "action": "Generate PIX",
        "description": "Code expires in 24 hours",
        "minimum": "R$ 1.00"
      }
    },
    "singleMethodButton": "Pay with {{method}}",
    "chooseMethod": "Choose payment method",
    "noMethodsAvailable": "Amount below minimum for online payment",
    "noMethodsDescription": "The amount of this invoice is below the minimum accepted by available payment methods. Contact your teacher for other payment options.",
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
      "failedPaymentInfo": "The previous payment failed. You can try with another method.",
      "keepCurrent": "Keep Current",
      "confirmChange": "Confirm Change"
    },
    "methodChanged": "Payment method changed. Choose a new method.",
    "errors": {
      "pixNotEnabled": "Your teacher does not have this payment option available",
      "methodNotAllowed": "This payment method is not available.",
      "changeMethodFailed": "Error changing payment method. Please try again.",
      "amountBelowMinimum": "Amount below minimum for this payment method"
    }
  }
}
```

---

## 14. Arquivos a Modificar/Criar (v2.6 - ATUALIZADO)

| Arquivo | Ação | Descrição | Status v2.6 |
|---------|------|-----------|-------------|
| `src/utils/stripe-fees.ts` | **MODIFICAR** | Adicionar taxas, constantes, valores mínimos e funções auxiliares | ❌ PENDENTE |
| `supabase/functions/create-invoice/index.ts` | **MODIFICAR** | Geração condicional com hierarquia v2.3 + fallback PIX | ✅ CONCLUÍDO |
| `supabase/functions/automated-billing/index.ts` | **MODIFICAR** | Geração condicional (tradicional) + **hierarquia v2.4 em `processMonthlySubscriptionBilling`** | ❌ PENDENTE |
| `supabase/functions/create-payment-intent-connect/index.ts` | **MODIFICAR** | v2.5: Validar `enabled_payment_methods`, salvar `pix_expires_at`, limpar método anterior + PIX capability + valor mínimo | ✅ CONCLUÍDO |
| `supabase/functions/change-payment-method/index.ts` | **CRIAR** | Nova função para aluno trocar método (v2.2: autorização dependentes + status falha) + audit log | ✅ CONCLUÍDO |
| `supabase/config.toml` | **MODIFICAR** | Adicionar `[functions.change-payment-method]` | ✅ CONCLUÍDO |
| `supabase/functions/webhook-stripe-connect/index.ts` | **MODIFICAR** | v2.5: Limpeza COMPLETA de campos temporários ao pagar (CRÍTICO) | ✅ CONCLUÍDO |
| `src/components/Settings/BillingSettings.tsx` | **MODIFICAR** | Toggles de métodos de pagamento + carregar de business_profiles (v2.2) | ✅ CONCLUÍDO |
| `src/components/PaymentOptionsCard.tsx` | **MODIFICAR** | v2.4: Interface Invoice (`amount: number` + campos expiração), callback onPaymentMethodChanged (v2.2), modal alterar | ⚠️ PARCIAL |
| `src/pages/Faturas.tsx` | **MODIFICAR** | Query dependentes (v2.2) + modal ao invés de URL (v2.2) + **v2.6: campos expiração + business_profile** | ❌ PENDENTE |
| `src/pages/Financeiro.tsx` | **MODIFICAR** | Query e alerta de taxas completo (todos os métodos) | ⚠️ A VERIFICAR |
| `src/i18n/locales/pt/billing.json` | **MODIFICAR** | Strings em português + valores mínimos + erros | ✅ CONCLUÍDO |
| `src/i18n/locales/en/billing.json` | **MODIFICAR** | Strings em inglês + valores mínimos + erros | ✅ CONCLUÍDO |

---

## 15. Checklist de Implementação (v2.6 - ATUALIZADO COM PROGRESSO)

### Fase 1: Database
- [x] Verificar se índices de expiração existem (v2.2: JÁ EXISTEM)
- [x] Verificar se colunas existem (v2.2: JÁ EXISTEM)
- [ ] Regenerar tipos Supabase (se necessário)

### Fase 2: Backend - Geração Condicional com Hierarquia v2.3/v2.4
- [x] `create-invoice`: Buscar `enabled_payment_methods` do business_profile (v2.3) ✅
- [x] `create-invoice`: Implementar hierarquia de geração: Boleto → PIX → Nenhum (v2.3) ✅
- [x] `create-invoice`: Verificar valor mínimo antes de gerar cada método (v2.3) ✅
- [x] `create-invoice`: Buscar `payment_due_days` para expiração de boleto ✅
- [x] `create-invoice`: Implementar fallback para PIX se boleto falhar ✅
- [ ] **v2.6**: `automated-billing` (tradicional): Mesma lógica de hierarquia v2.3 ❌ PENDENTE
- [ ] **v2.6**: `processMonthlySubscriptionBilling`: Buscar `enabled_payment_methods` do business_profile ❌ PENDENTE
- [ ] **v2.6**: `processMonthlySubscriptionBilling`: Implementar hierarquia Boleto → PIX → Nenhum ❌ PENDENTE
- [ ] **v2.6**: `processMonthlySubscriptionBilling`: Verificar valor mínimo antes de gerar ❌ PENDENTE
- [ ] Testar geração condicional com diferentes configurações

### Fase 3: Backend - Validação, Expiração e Limpeza (v2.5 - CONCLUÍDO)
- [x] `create-payment-intent-connect`: Query com `enabled_payment_methods` do business_profile ✅
- [x] `create-payment-intent-connect`: Validar método habilitado antes de processar ✅
- [x] `create-payment-intent-connect`: Validar valor mínimo por método (v2.1) ✅
- [x] `create-payment-intent-connect`: Verificar PIX capability (v2.1) ✅
- [x] `create-payment-intent-connect`: Salvar `pix_expires_at` ao criar PIX ✅
- [x] `create-payment-intent-connect`: Limpar dados do método anterior ao gerar novo ✅
- [x] `create-payment-intent-connect`: Tentar cancelar PaymentIntent anterior ✅
- [x] Testar validações ✅

### Fase 4: Backend - Alterar Método (CONCLUÍDO)
- [x] Criar `change-payment-method/index.ts` ✅
- [x] Implementar tratamento de boleto ativo (v2.1) ✅
- [x] Implementar autorização de dependentes (v2.2) ✅
- [x] Implementar status `falha_pagamento` (v2.2) ✅
- [x] Implementar status `open` (v2.6) ✅
- [x] Implementar audit log (v2.6) ✅
- [x] Configurar em `supabase/config.toml` (v2.1) ✅
- [x] Deploy da função ✅

### Fase 5: Backend - Webhook (v2.5 - CONCLUÍDO)
- [x] `webhook-stripe-connect`: Limpeza COMPLETA de campos temporários ao pagar ✅
- [x] Incluir `stripe_hosted_invoice_url` na limpeza além dos outros campos ✅

### Fase 6: Frontend - stripe-fees.ts (v2.6 - PENDENTE)
- [ ] **v2.6**: Adicionar `MINIMUM_PAYMENT_AMOUNTS` ❌ PENDENTE
- [ ] **v2.6**: Adicionar `STRIPE_FEES` com todas as configurações ❌ PENDENTE
- [ ] **v2.6**: Adicionar `PAYMENT_METHOD_ORDER` ❌ PENDENTE
- [ ] **v2.6**: Adicionar `PAYMENT_METHOD_CONFIG` com descrições, icons e mínimos ❌ PENDENTE
- [ ] **v2.6**: Adicionar `calculateFee()`, `formatFeeExample()` ❌ PENDENTE
- [ ] **v2.6**: Adicionar `sortPaymentMethods()`, `validateEnabledMethods()` ❌ PENDENTE
- [ ] **v2.6**: Adicionar `meetsMinimumAmount()`, `getAvailableMethodsForAmount()`, `getMinimumAmountError()` ❌ PENDENTE

### Fase 7: Frontend - Professor (CONCLUÍDO)
- [x] `BillingSettings`: Carregar de `business_profiles` (v2.2) ✅
- [x] `BillingSettings`: Toggles de métodos com taxas ✅
- [x] `BillingSettings`: Exibir valores mínimos por método (v2.1) ✅
- [x] `BillingSettings`: Indicar geração automática de boleto ✅
- [x] `BillingSettings`: Validação mínimo 1 método ✅
- [x] Testar salvamento ✅

### Fase 8: Frontend - Aluno (v2.6 - PARCIALMENTE CONCLUÍDO)
- [x] `Faturas.tsx`: Query para dependentes (v2.2) ✅
- [x] `Faturas.tsx`: Dialog para alteração de método (v2.2) ✅
- [x] `Faturas.tsx`: Badge "Dependente" para faturas de dependentes ✅
- [x] `Faturas.tsx`: Invocar `change-payment-method` ✅
- [ ] **v2.6**: `Faturas.tsx`: Buscar `business_profile.enabled_payment_methods` na query ❌ PENDENTE
- [ ] **v2.6**: `Faturas.tsx`: Buscar `pix_expires_at` e `boleto_expires_at` na query ❌ PENDENTE
- [ ] `PaymentOptionsCard`: Atualizar interface Invoice (se necessário)
- [ ] `PaymentOptionsCard`: Funções `hasValidBoleto`, `hasValidPix` (verificar expiração)
- [ ] `PaymentOptionsCard`: Verificar `enabled_payment_methods` (invalidação)
- [ ] `PaymentOptionsCard`: Filtrar métodos por valor mínimo (v2.1)
- [ ] `Financeiro.tsx`: Alerta de taxas completo (todos os métodos)

### Fase 9: i18n (CONCLUÍDO)
- [x] `pt/billing.json`: Todas as strings novas + mínimos + erros + paymentMethods ✅
- [x] `en/billing.json`: Equivalentes em inglês ✅
- [x] `pt/financial.json`: Strings para Faturas.tsx (dependentes, troca método) ✅
- [x] `en/financial.json`: Equivalentes em inglês ✅

### Fase 10: Testes (v2.6 - EM ANDAMENTO)
- [ ] Professor configura métodos → Salva corretamente
- [ ] Fatura criada com boleto habilitado + valor >= R$5 → Boleto gerado automaticamente
- [ ] Fatura criada com boleto desabilitado + PIX habilitado + valor >= R$1 → PIX gerado automaticamente (v2.3)
- [ ] Fatura criada com boleto habilitado + valor < R$5 + PIX habilitado → PIX gerado (v2.3)
- [ ] Fatura criada com apenas Card habilitado → Nenhum pagamento gerado
- [ ] **v2.6**: automated-billing aplica hierarquia v2.3 corretamente
- [ ] **v2.6**: Mensalidade (processMonthlySubscriptionBilling) aplica hierarquia v2.4
- [ ] Aluno vê boleto existente → Pode baixar ou alterar
- [ ] Aluno vê PIX existente → Pode copiar código ou alterar
- [ ] Professor desabilita boleto → Boleto existente invalidado
- [ ] Aluno altera de boleto para PIX → Boleto cancelado (ou tratado), PIX gerado
- [ ] Aluno tenta PIX sem capability → Erro amigável
- [ ] Aluno tenta método com valor abaixo do mínimo → Erro amigável (v2.1)
- [x] Webhook limpa TODOS os campos temporários após pagamento ✅
- [x] `create-payment-intent-connect` salva `pix_expires_at` corretamente ✅
- [x] `create-payment-intent-connect` valida `enabled_payment_methods` do business_profile ✅
- [x] Ao gerar boleto, campos PIX anteriores são limpos ✅
- [x] Ao gerar PIX, campos boleto anteriores são limpos ✅
- [x] Ao iniciar Card, campos boleto E PIX são limpos ✅

---

## 16. Estimativa de Tempo (v2.6 - ATUALIZADO COM PROGRESSO)

| Tarefa | Tempo Estimado | Status |
|--------|----------------|--------|
| Backend: Geração condicional (create-invoice) | 1.5 horas | ✅ CONCLUÍDO |
| **v2.6**: Backend: Hierarquia em `automated-billing` tradicional | 1 hora | ❌ PENDENTE |
| **v2.6**: Backend: Hierarquia em `processMonthlySubscriptionBilling` | 1 hora | ❌ PENDENTE |
| Backend: Validação + PIX capability + `pix_expires_at` + limpeza | 2.5 horas | ✅ CONCLUÍDO |
| Backend: change-payment-method + config.toml + audit log | 1.5 horas | ✅ CONCLUÍDO |
| Backend: Webhook limpeza COMPLETA ao pagar | 45 min | ✅ CONCLUÍDO |
| **v2.6**: stripe-fees.ts completo | 45 min | ❌ PENDENTE |
| BillingSettings | 2.5 horas | ✅ CONCLUÍDO |
| **v2.6**: Faturas.tsx (query completa + expiração) | 1 hora | ❌ PENDENTE |
| Financeiro.tsx | 1 hora | ⚠️ A VERIFICAR |
| i18n | 45 min | ✅ CONCLUÍDO |
| Testes (incluindo cenários v2.6) | 4 horas | ⚠️ EM ANDAMENTO |
| **Total Restante** | **~4 horas** | |
| **Total Geral** | **~18.5 horas** | |

---

## 17. Riscos e Mitigações (v2.6 - ATUALIZADO)

| Risco | Probabilidade | Impacto | Mitigação | Status |
|-------|---------------|---------|-----------|--------|
| PIX não habilitado na conta Stripe do professor | Alta | Médio | Verificar capability + mensagem amigável (v2.1) | ✅ MITIGADO |
| Professor desabilita todos os métodos | Baixa | Alto | Validação frontend + backend impede | ✅ MITIGADO |
| Aluno tenta burlar validação frontend | Baixa | Médio | Validação backend é obrigatória | ✅ MITIGADO |
| Professor desabilita método com pagamentos pendentes | Média | Médio | Invalidar pagamentos existentes (decisão confirmada) | ⚠️ A TESTAR |
| Expiração de boleto incorreta | Baixa | Médio | Usar `payment_due_days` do professor | ✅ MITIGADO |
| Query de invoice não inclui business_profile | Média | Alto | Verificar todas as queries | ❌ PENDENTE v2.6 |
| Boleto ativo no Stripe não pode ser cancelado | Média | Médio | Tratar erro graciosamente (v2.1) | ✅ MITIGADO |
| Valor abaixo do mínimo para todos os métodos | Baixa | Médio | Exibir alerta + contato com professor (v2.1) | ✅ MITIGADO |
| **v2.2**: Responsável não consegue ver faturas de dependentes | Média | Alto | Query atualizada com lógica de dependentes | ✅ MITIGADO |
| **v2.5**: Webhook não limpa campos temporários → dados órfãos | Média | Alto | Limpeza COMPLETA obrigatória | ✅ MITIGADO |
| **v2.5**: `pix_expires_at` não salvo → PIX parece sempre válido | Alta | Alto | Verificar código de `create-payment-intent-connect` | ✅ MITIGADO |
| **v2.5**: Método anterior não limpo → dados conflitantes | Média | Alto | Limpar campos do método anterior ao gerar novo | ✅ MITIGADO |
| **v2.6**: `automated-billing` ignora `enabled_payment_methods` | Alta | Alto | Implementar hierarquia v2.3 | ❌ PENDENTE |
| **v2.6**: `processMonthlySubscriptionBilling` ignora `enabled_payment_methods` | Alta | Alto | Implementar hierarquia v2.4 | ❌ PENDENTE |

---

## 18. Histórico de Revisões

| Versão | Data | Descrição |
|--------|------|-----------|
| 1.0 | 2026-01-14 | Versão inicial do plano |
| 1.1 | 2026-01-14 | Lacunas: query Financeiro.tsx, interface Invoice, BillingSettings com business_profiles, PIX capability, múltiplos business_profiles |
| 2.0 | 2026-01-15 | Arquitetura híbrida v2.0: geração automática de boleto (se habilitado), campos de expiração, reutilização de links, alterar método pelo aluno, invalidação ao desabilitar método, cartão pode ser desabilitado, expiração de boleto usa `payment_due_days`, mensagem amigável para PIX capability |
| 2.1 | 2026-01-15 | Análise de lacunas v2.1: validação de valores mínimos por método (Boleto R$5, PIX R$1, Card R$0.50), PIX capability check em `create-payment-intent-connect`, tratamento de boleto ativo no Stripe (`change-payment-method` trata erro graciosamente), configuração `config.toml` para nova edge function, limpeza de expiração no webhook, UI para valor abaixo do mínimo, estimativa atualizada para ~17h |
| 2.2 | 2026-01-16 | Análise de lacunas v2.2: autorização de dependentes em `change-payment-method` (valida `responsible_id`), status `falha_pagamento` permite troca de método, query `Faturas.tsx` suporta dependentes via `responsible_id`, modal substitui redirect `stripe_hosted_invoice_url`, callback `onPaymentMethodChanged` em `PaymentOptionsCard`, `BillingSettings` gerencia `enabled_payment_methods` de `business_profiles`, limpeza de campos temporários OBRIGATÓRIA no webhook (incluindo `barcode`), remoção de índices redundantes da migração (já existem), novas strings i18n `failedPaymentInfo`, estimativa atualizada para ~19h |
| 2.3 | 2026-01-16 | Correções críticas v2.3: Confirmado que `create-invoice` já chama `create-payment-intent-connect` internamente; OBRIGATÓRIO verificar `enabled_payment_methods` antes de gerar pagamento; **hierarquia de geração automática** (Boleto → PIX → Nenhum) para quando boleto não está disponível; `create-payment-intent-connect` DEVE salvar `pix_expires_at`; webhook DEVE limpar `pix_copy_paste` e `linha_digitavel`; `stripe-fees.ts` atualizado com todas as constantes e funções; checklist expandido com novos cenários de teste para hierarquia v2.3; estimativa mantida em ~19h |
| 2.4 | 2026-01-16 | Correções finais v2.4: `processMonthlySubscriptionBilling` DEVE aplicar mesma hierarquia v2.3 (Boleto → PIX → Nenhum) para faturamento de mensalidades mensais; `PaymentOptionsCard` interface corrigida (`amount: string` → `amount: number`); adicionados campos `pix_expires_at`, `boleto_expires_at`, `business_profile` à interface Invoice; corrigidos `formatCurrency()` e `isBelowMinimum` para usar number; checklist expandido com novos itens v2.4; testes adicionais para mensalidades; estimativa atualizada para ~22h |
| 2.5 | 2026-01-16 | Lacunas finais v2.5: Webhook DEVE limpar campos temporários ao pagar (incluindo `stripe_hosted_invoice_url`); `create-payment-intent-connect` DEVE salvar `pix_expires_at` ao criar PIX; `create-payment-intent-connect` DEVE validar `enabled_payment_methods`; DEVE limpar método anterior ao gerar novo; mínimo global de R$5 confirmado |
| 2.6 | 2026-01-16 | **IMPLEMENTAÇÃO PARCIAL**: Backend 90% concluído (`create-invoice`, `create-payment-intent-connect`, `webhook-stripe-connect`, `change-payment-method` com audit log). **5 lacunas identificadas e documentadas**: (1) `automated-billing` hierarquia v2.3, (2) `processMonthlySubscriptionBilling` hierarquia v2.4, (3) `stripe-fees.ts` completo, (4) `Faturas.tsx` query com business_profile, (5) `Faturas.tsx` campos de expiração. Frontend parcialmente concluído (`BillingSettings`, `Faturas.tsx` base, i18n). Estimativa restante: ~4h |
| 2.7 | 2026-01-18 | Novas pontas soltas identificadas: (1) `PaymentOptionsCard` validação de métodos habilitados, (2) `PaymentOptionsCard` UI de expiração, (3) `Faturas.tsx` UI de expiração na lista |
| 2.8 | 2026-01-18 | Falha crítica identificada: `automated-billing` query de businessProfile (linha 134) não inclui `enabled_payment_methods`, impossibilitando a hierarquia v2.3/v2.4 |
| 2.9 | 2026-01-18 | Clarificação importante: O código na seção 5.1 (`stripe-fees.ts`) representa o **ESTADO FINAL DESEJADO**, NÃO o código atual no repositório |
| 2.10 | 2026-01-18 | Correção de inconsistências: Histórico de revisões atualizado (entrada duplicada v2.5 removida), seção Próximos Passos atualizada para v2.10, estimativa de tempo validada (~3h 45min para 10 itens pendentes) |

---

## 19. Próximos Passos

1. ✅ **Aprovação do plano v2.10**: Este documento (análise final concluída)
2. ⏳ **Implementação Backend restante** (~1h 30min):
   - `automated-billing`: Query de businessProfile com `enabled_payment_methods`
   - `automated-billing`: Hierarquia v2.3/v2.4 nos 3 pontos (tradicional, mensalidade, fora do ciclo)
3. ⏳ **Implementação Frontend restante** (~1h 45min):
   - `stripe-fees.ts`: Código completo conforme seção 5.1
   - `Faturas.tsx`: Query expandida + UI de expiração
   - `PaymentOptionsCard`: Interface corrigida + filtro métodos + UI expiração
4. ⏳ **Testes** (~30min): Validar todos os cenários de hierarquia e expiração
5. ⏳ **Deploy**: Staging → Produção
