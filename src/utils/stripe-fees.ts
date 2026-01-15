/**
 * Stripe fee calculation utilities for all payment methods
 * 
 * Boleto: R$ 3.49 fixed fee per transaction
 * PIX: 1.19% of transaction value
 * Card: 3.99% + R$ 0.39 per transaction
 * 
 * Minimum amounts:
 * - Boleto: R$ 5.00 (Stripe requirement)
 * - PIX: R$ 1.00
 * - Card: R$ 0.50
 */

// Payment method types
export type PaymentMethodType = 'boleto' | 'pix' | 'card';

// Stripe fees configuration
export const STRIPE_FEES = {
  boleto: { type: 'fixed' as const, value: 3.49 },
  pix: { type: 'percentage' as const, value: 0.0119 }, // 1.19%
  card: { type: 'percentage_plus_fixed' as const, percentage: 0.0399, fixed: 0.39 } // 3.99% + R$0.39
} as const;

// Minimum payment amounts by method (Stripe requirements)
export const MINIMUM_PAYMENT_AMOUNTS: Record<PaymentMethodType, number> = {
  boleto: 5.00,
  pix: 1.00,
  card: 0.50
} as const;

// Maximum payment amounts by method
export const MAXIMUM_PAYMENT_AMOUNTS: Record<PaymentMethodType, number> = {
  boleto: 49999.99,
  pix: 999999.99,
  card: 999999.99
} as const;

// Legacy exports for backward compatibility
export const STRIPE_BOLETO_FEE = STRIPE_FEES.boleto.value;
export const MINIMUM_BOLETO_AMOUNT = MINIMUM_PAYMENT_AMOUNTS.boleto;
export const MAXIMUM_BOLETO_AMOUNT = MAXIMUM_PAYMENT_AMOUNTS.boleto;

export interface PaymentValidationResult {
  valid: boolean;
  error?: string;
  errorKey?: string; // i18n key
}

/**
 * Validates if an amount is valid for a specific payment method
 */
export const validatePaymentMethod = (method: PaymentMethodType, amount: number): PaymentValidationResult => {
  if (isNaN(amount) || amount <= 0) {
    return {
      valid: false,
      error: 'O valor deve ser maior que zero',
      errorKey: 'errors.amountMustBePositive'
    };
  }

  const minimum = MINIMUM_PAYMENT_AMOUNTS[method];
  const maximum = MAXIMUM_PAYMENT_AMOUNTS[method];

  if (amount < minimum) {
    return {
      valid: false,
      error: `O valor mínimo para ${getMethodLabel(method)} é ${formatCurrency(minimum)}`,
      errorKey: `errors.${method}MinimumAmount`
    };
  }

  if (amount > maximum) {
    return {
      valid: false,
      error: `O valor máximo para ${getMethodLabel(method)} é ${formatCurrency(maximum)}`,
      errorKey: `errors.${method}MaximumAmount`
    };
  }

  return { valid: true };
};

// Legacy function for backward compatibility
export const validateBoletoAmount = (amount: number): PaymentValidationResult => {
  return validatePaymentMethod('boleto', amount);
};

/**
 * Calculates the fee for a specific payment method and amount
 */
export const calculateFee = (method: PaymentMethodType, amount: number): number => {
  const feeConfig = STRIPE_FEES[method];
  
  switch (feeConfig.type) {
    case 'fixed':
      return feeConfig.value;
    case 'percentage':
      return amount * feeConfig.value;
    case 'percentage_plus_fixed':
      return (amount * feeConfig.percentage) + feeConfig.fixed;
    default:
      return 0;
  }
};

/**
 * Calculates the net amount after fees for a specific payment method
 */
export const calculateNetAmount = (method: PaymentMethodType, amount: number): number => {
  const fee = calculateFee(method, amount);
  return Math.max(0, amount - fee);
};

// Legacy function for backward compatibility
export const calculateBoletoFees = (amount: number) => {
  const fee = calculateFee('boleto', amount);
  const netAmount = amount - fee;
  
  return {
    chargedAmount: amount,
    fee: fee,
    netAmount: netAmount >= 0 ? netAmount : 0,
  };
};

/**
 * Formats a fee example for display (e.g., "Em R$ 200 = R$ 2,38")
 */
export const formatFeeExample = (method: PaymentMethodType, amount: number = 200): string => {
  const fee = calculateFee(method, amount);
  return `Em ${formatCurrency(amount)} = ${formatCurrency(fee)}`;
};

/**
 * Gets the fee description for a payment method
 */
export const getFeeDescription = (method: PaymentMethodType): string => {
  switch (method) {
    case 'boleto':
      return `${formatCurrency(STRIPE_FEES.boleto.value)} fixo`;
    case 'pix':
      return `${(STRIPE_FEES.pix.value * 100).toFixed(2).replace('.', ',')}%`;
    case 'card':
      return `${(STRIPE_FEES.card.percentage * 100).toFixed(2).replace('.', ',')}% + ${formatCurrency(STRIPE_FEES.card.fixed)}`;
    default:
      return '';
  }
};

/**
 * Gets the human-readable label for a payment method
 */
export const getMethodLabel = (method: PaymentMethodType): string => {
  switch (method) {
    case 'boleto':
      return 'Boleto Bancário';
    case 'pix':
      return 'PIX';
    case 'card':
      return 'Cartão de Crédito';
    default:
      return method;
  }
};

/**
 * Sorts payment methods in recommended order (cheapest first for a given amount)
 */
export const sortPaymentMethods = (methods: PaymentMethodType[], amount: number = 200): PaymentMethodType[] => {
  return [...methods].sort((a, b) => {
    const feeA = calculateFee(a, amount);
    const feeB = calculateFee(b, amount);
    return feeA - feeB;
  });
};

/**
 * Gets all available payment methods that are valid for a given amount
 */
export const getValidMethodsForAmount = (
  amount: number, 
  enabledMethods: PaymentMethodType[] = ['boleto', 'pix', 'card']
): PaymentMethodType[] => {
  return enabledMethods.filter(method => {
    const validation = validatePaymentMethod(method, amount);
    return validation.valid;
  });
};

/**
 * Default payment methods (all enabled)
 */
export const DEFAULT_PAYMENT_METHODS: PaymentMethodType[] = ['boleto', 'pix', 'card'];

/**
 * Formats a currency value in BRL
 */
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};
