# Plano de Implementação: Métodos de Pagamento Configuráveis pelo Professor

> **Versão**: 1.0  
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

---

## 4. Constantes de Taxas

### 4.1 Arquivo: `src/utils/stripe-fees.ts`

```typescript
/**
 * Stripe fee calculation utilities for all payment methods
 * Updated: 2026-01-14
 * Source: https://stripe.com/en-br/pricing/local-payment-methods
 */

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

#### Alterações Necessárias

1. **Buscar métodos habilitados**: Consultar `business_profiles.enabled_payment_methods` via invoice
2. **Filtrar métodos**: Mostrar apenas os habilitados pelo professor
3. **Ordenar alfabeticamente**: Boleto → Cartão → PIX
4. **Lógica de método único**: Se apenas 1 método, redirecionar direto ao Stripe

#### Pseudo-código da Lógica

```typescript
const enabledMethods = invoice.business_profile?.enabled_payment_methods || ['boleto', 'pix', 'card'];
const sortedMethods = sortPaymentMethods(enabledMethods);

// Se apenas 1 método habilitado, redirecionar direto
if (sortedMethods.length === 1) {
  const [onlyMethod] = sortedMethods;
  
  // Mostrar botão único
  return (
    <Button onClick={() => createPaymentIntent(onlyMethod)}>
      Pagar com {PAYMENT_METHOD_CONFIG[onlyMethod].name}
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

#### Layout - Múltiplos Métodos

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

#### Layout - Método Único

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

## 7. Backend - Validação e Segurança

### 7.1 Arquivo: `supabase/functions/create-payment-intent-connect/index.ts`

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

---

## 8. Internacionalização (i18n)

### 8.1 Português: `src/i18n/locales/pt/billing.json`

```json
{
  "paymentMethods": {
    "title": "Métodos de Pagamento Disponíveis",
    "subtitle": "Selecione quais formas de pagamento seus alunos poderão utilizar. As taxas são cobradas pela Stripe.",
    "atLeastOne": "Pelo menos um método de pagamento deve estar habilitado",
    "feeLabel": "Taxa",
    "exampleLabel": "Exemplo",
    "exampleFormat": "Em {{amount}} = {{fee}} de taxa",
    "methods": {
      "boleto": {
        "name": "Boleto Bancário",
        "fee": "R$ 3,49 por transação"
      },
      "card": {
        "name": "Cartão de Crédito",
        "fee": "3,99% + R$ 0,39"
      },
      "pix": {
        "name": "PIX",
        "fee": "1,19%"
      }
    },
    "singleMethodButton": "Pagar com {{method}}"
  }
}
```

### 8.2 Inglês: `src/i18n/locales/en/billing.json`

```json
{
  "paymentMethods": {
    "title": "Available Payment Methods",
    "subtitle": "Select which payment methods your students can use. Fees are charged by Stripe.",
    "atLeastOne": "At least one payment method must be enabled",
    "feeLabel": "Fee",
    "exampleLabel": "Example",
    "exampleFormat": "On {{amount}} = {{fee}} fee",
    "methods": {
      "boleto": {
        "name": "Boleto Bancário",
        "fee": "R$ 3.49 per transaction"
      },
      "card": {
        "name": "Credit Card",
        "fee": "3.99% + R$ 0.39"
      },
      "pix": {
        "name": "PIX",
        "fee": "1.19%"
      }
    },
    "singleMethodButton": "Pay with {{method}}"
  }
}
```

---

## 9. Arquivos a Modificar/Criar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migração SQL | **CRIAR** | Adicionar coluna `enabled_payment_methods` |
| `src/utils/stripe-fees.ts` | **MODIFICAR** | Adicionar taxas de todos métodos + funções auxiliares |
| `src/components/Settings/BillingSettings.tsx` | **MODIFICAR** | Adicionar seção de métodos de pagamento |
| `src/components/PaymentOptionsCard.tsx` | **MODIFICAR** | Filtrar métodos + lógica de redirecionamento direto |
| `supabase/functions/create-payment-intent-connect/index.ts` | **MODIFICAR** | Validar método permitido + incluir campo na query |
| `src/i18n/locales/pt/billing.json` | **MODIFICAR** | Adicionar textos em português |
| `src/i18n/locales/en/billing.json` | **MODIFICAR** | Adicionar textos em inglês |

---

## 10. Fluxo Completo

```
┌─────────────────────┐
│   PROFESSOR         │
│ (Configurações)     │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ BillingSettings: Toggles para Boleto/Cartão/PIX                 │
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
│ PaymentOptionsCard: Mostra apenas métodos habilitados           │
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
│ create-payment-intent-connect: Valida método + processa         │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐
│   STRIPE            │
│ (Checkout/Payment)  │
└─────────────────────┘
```

---

## 11. Considerações Técnicas

### 11.1 PIX no Stripe Connect

O PIX já está implementado no backend (`create-payment-intent-connect/index.ts`, linhas 343-423), mas pode exigir que o professor habilite o método no Dashboard do Stripe da conta conectada.

**Ação necessária**: Documentar para o professor como habilitar PIX no Stripe Dashboard.

### 11.2 Compatibilidade Retroativa

Professores existentes sem a configuração terão todos os métodos habilitados por default (array padrão da coluna).

### 11.3 Segurança

- **Backend**: Validação impede que alunos tentem usar métodos não habilitados
- **Frontend**: Filtragem de métodos evita exibição de opções inválidas

### 11.4 Performance

- Query de invoice já faz JOIN com `business_profiles`
- Adição de um campo array não impacta performance significativamente

---

## 12. Checklist de Implementação

### Fase 1: Database
- [ ] Criar migração SQL
- [ ] Testar migração em ambiente de desenvolvimento
- [ ] Aplicar migração em produção

### Fase 2: Backend
- [ ] Atualizar `src/utils/stripe-fees.ts`
- [ ] Modificar query de invoice em `create-payment-intent-connect`
- [ ] Adicionar validação de método permitido
- [ ] Testar edge function

### Fase 3: Frontend - Professor
- [ ] Adicionar i18n para português
- [ ] Adicionar i18n para inglês
- [ ] Implementar seção em `BillingSettings.tsx`
- [ ] Testar configuração de métodos

### Fase 4: Frontend - Aluno
- [ ] Modificar `PaymentOptionsCard.tsx`
- [ ] Implementar lógica de método único
- [ ] Testar fluxo de pagamento com diferentes configurações

### Fase 5: Testes e Validação
- [ ] Testar professor sem business_profile
- [ ] Testar todos os métodos habilitados
- [ ] Testar apenas 1 método habilitado
- [ ] Testar validação de backend
- [ ] Teste de regressão geral

---

## 13. Estimativa de Tempo

| Tarefa | Estimativa |
|--------|------------|
| Migração SQL | 15 min |
| Atualizar stripe-fees.ts | 30 min |
| BillingSettings + Toggles | 1.5 horas |
| PaymentOptionsCard | 1 hora |
| Backend validation | 30 min |
| i18n | 30 min |
| Testes e ajustes | 1 hora |
| **Total** | **~5 horas** |

---

## 14. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| PIX não habilitado na conta Stripe do professor | Alta | Médio | Verificar status da capability antes de exibir opção |
| Professor desabilita todos os métodos | Baixa | Alto | Validação frontend + backend impede |
| Aluno tenta burlar validação frontend | Baixa | Médio | Validação backend é obrigatória |

---

## 15. Próximos Passos

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
