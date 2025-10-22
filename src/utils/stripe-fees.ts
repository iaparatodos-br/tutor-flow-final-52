/**
 * Stripe fee calculation utilities for Boleto payments
 * Fixed fee: R$ 3.49 per transaction
 */

const STRIPE_BOLETO_FEE = 3.49;

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
