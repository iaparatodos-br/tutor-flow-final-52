/**
 * Stripe fee calculation utilities for Boleto payments
 * Fixed fee: R$ 3.49 per transaction
 * Minimum amount: R$ 5.00 (Stripe requirement)
 * Maximum amount: R$ 49,999.99 (Stripe requirement)
 */

export const STRIPE_BOLETO_FEE = 3.49;
export const MINIMUM_BOLETO_AMOUNT = 5.00;
export const MAXIMUM_BOLETO_AMOUNT = 49999.99;

export interface BoletoValidationResult {
  valid: boolean;
  error?: string;
  errorKey?: string; // i18n key
}

/**
 * Validates if an amount is valid for boleto generation
 */
export const validateBoletoAmount = (amount: number): BoletoValidationResult => {
  if (isNaN(amount) || amount <= 0) {
    return {
      valid: false,
      error: 'O valor deve ser maior que zero',
      errorKey: 'errors.amountMustBePositive'
    };
  }

  if (amount < MINIMUM_BOLETO_AMOUNT) {
    return {
      valid: false,
      error: `O valor mínimo para geração de boleto é R$ ${MINIMUM_BOLETO_AMOUNT.toFixed(2).replace('.', ',')}`,
      errorKey: 'errors.amountBelowMinimum'
    };
  }

  if (amount > MAXIMUM_BOLETO_AMOUNT) {
    return {
      valid: false,
      error: `O valor máximo para boleto é R$ ${formatCurrency(MAXIMUM_BOLETO_AMOUNT)}`,
      errorKey: 'errors.amountAboveMaximum'
    };
  }

  return { valid: true };
};

export const calculateBoletoFees = (amount: number) => {
  const fee = STRIPE_BOLETO_FEE;
  const netAmount = amount - fee;
  
  return {
    chargedAmount: amount,
    fee: fee,
    netAmount: netAmount >= 0 ? netAmount : 0,
  };
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};
